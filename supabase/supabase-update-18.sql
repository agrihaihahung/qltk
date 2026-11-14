-- =====================================================================
-- CẬP NHẬT SUPABASE 18: nguồn dữ liệu báo cáo "Hàng nhập vào" và "Hàng hoàn tồn"
-- Chạy SAU supabase-update-17.sql. Chạy lại nhiều lần được. Chỉ tạo 1 view, không đổi bảng/hàm cũ.
--
-- Mỗi dòng của view = 1 lần hàng quay lại kho, chia hai loại (cột typ):
--   typ = 'in'     Hàng nhập vào: dòng NHẬP chưa hủy trong sổ `movements`, trừ phiếu hoàn kho theo báo giá.
--   typ = 'return' Hàng hoàn tồn (hàng khách trả / đơn bị hủy), có 2 nguồn (cột src):
--       'hk'   phiếu hoàn kho theo báo giá đã duyệt (dòng nhập có ghi chú "Hoàn kho báo giá <mã>"),
--       'void' dòng XUẤT đã bị hủy trong Lịch sử kho (hàng cộng lại tồn). Ngày = ngày hủy, người = người hủy.
--   value: giá trị hoàn = số lượng × quote_unit_value của báo giá (cùng công thức công nợ); NULL nếu không gắn được báo giá.
--          Hàng nhập vào không có giá trị (chỉ theo dõi số lượng).
--   party: khách hàng (với hàng hoàn) hoặc nhà cung cấp ghi ở đầu ghi chú dạng "[tên] ..." (với hàng nhập); '' nếu không có.
--   grp  : gom các dòng cùng một lần thao tác (cùng người, cùng ghi chú, cách nhau dưới 10 giây) = 1 phiếu.
-- =====================================================================

drop view if exists public.report_stock;
create view public.report_stock with (security_invoker = true) as
with b as (
  select mv.id, mv.item_id, mv.code, mv.name, mv.qty, mv.void_reason, mv.note,
         case when mv.kind = 'out' then mv.voided_at else mv.created_at end as at,
         case when mv.kind = 'out' then mv.voided_by else mv.user_email end as who,
         case when mv.kind = 'out' then 'void'
              when mv.note ilike '%hoàn kho báo giá%' then 'hk' else 'in' end as k,
         case when mv.kind = 'out' then public.quote_of_movement(to_jsonb(mv))
              when mv.note ilike '%hoàn kho báo giá%' then substring(mv.note from 'báo giá\s+([^\s,;·\]\)]+)') end as qcode
    from public.movements mv
   where mv.qty > 0
     and ((mv.kind = 'in' and mv.voided_at is null) or (mv.kind = 'out' and mv.voided_at is not null))),
g1 as (
  select b.*,
         case when b.at - lag(b.at) over w > interval '10 seconds' then 1 else 0 end as brk
    from b
  window w as (partition by b.k, coalesce(b.who, ''), coalesce(b.note, '') order by b.at, b.id)),
g as (
  select g1.*,
         g1.k || '|' || coalesce(g1.who, '') || '|' || coalesce(g1.note, '') || '|' ||
         sum(g1.brk) over (partition by g1.k, coalesce(g1.who, ''), coalesce(g1.note, '') order by g1.at, g1.id) as grp
    from g1)
select g.id, g.item_id, g.at as created_at, g.code, g.name, g.qty, g.who as user_email, g.note, g.grp,
       case when g.k = 'in' then 'in' else 'return' end as typ,
       g.k as src,
       g.qcode as ref,
       coalesce(nullif(c.name, ''), nullif(q.customer_name, ''), nullif(substring(g.note from '^\[([^\]]+)\]'), ''), '') as party,
       case when g.k <> 'in' and g.qcode is not null then nullif(round(g.qty * public.quote_unit_value(g.qcode, g.code)), 0) end as value,
       g.void_reason as reason
  from g
  left join public.quotes q on q.code = g.qcode
  left join public.customers c on c.id = q.customer_id;

grant select on public.report_stock to authenticated;

-- KIỂM TRA (chạy tay sau khi cài):
--   1) Số dòng theo loại / nguồn:
--      select typ, src, count(*), sum(qty) from public.report_stock group by 1, 2 order by 1, 2;
--   2) Hàng nhập vào không được lẫn phiếu hoàn kho (phải ra 0 dòng):
--      select * from public.report_stock where typ = 'in' and note ilike '%hoàn kho báo giá%';
