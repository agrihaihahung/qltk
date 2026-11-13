-- =====================================================================
-- CẬP NHẬT SUPABASE 17: nguồn dữ liệu báo cáo thống nhất với Lịch sử kho
-- Chạy SAU supabase-update-16.sql. Chạy lại nhiều lần được. Chỉ tạo 1 view, không đổi bảng/hàm cũ.
--
-- Quy tắc (cùng công thức với công nợ, nên báo cáo và công nợ không lệch nhau):
--   * Mỗi dòng của view = 1 dòng XUẤT KHO CHƯA HỦY trong sổ `movements` (đúng thứ Lịch sử kho đang hiện).
--     Hủy đơn ở Lịch sử kho -> dòng đó biến mất khỏi báo cáo.
--   * Dòng xuất thuộc báo giá (quote_of_movement)  : giá trị = số lượng × quote_unit_value (giá báo giá đã gồm chiết khấu / VAT chia theo tỷ lệ).
--   * Dòng xuất từ phiếu ảnh                       : giá trị = số lượng × thành tiền dòng phiếu / số lượng dòng phiếu × (tổng phiếu / cộng các dòng).
--   * Hoàn kho theo báo giá (phiếu HK)             : thêm dòng SỐ ÂM (src = 'return') để doanh thu ròng đúng.
--                                                    Hoàn do hủy dòng xuất (source = 'void') KHÔNG thêm, vì dòng xuất gốc đã bị loại.
--   * value = NULL nghĩa là chưa xác định được giá (không tìm được báo giá / phiếu ảnh khớp).
--   * grp: gom các dòng cùng một lần xuất (cùng người, cùng ghi chú, cách nhau dưới 10 giây) = 1 "đơn".
-- =====================================================================

drop view if exists public.report_sales;
create view public.report_sales with (security_invoker = true) as
with m as (
  select mv.id, mv.item_id, mv.created_at, mv.code, mv.name, mv.qty, mv.user_email, mv.note,
         public.quote_of_movement(to_jsonb(mv)) as qcode
    from public.movements mv
   where mv.kind = 'out' and mv.voided_at is null and mv.qty > 0),
g1 as (
  select m.*,
         case when m.created_at - lag(m.created_at) over w > interval '10 seconds' then 1 else 0 end as brk
    from m
  window w as (partition by coalesce(m.user_email, ''), coalesce(m.note, '') order by m.created_at, m.id)),
g as (
  select g1.*,
         coalesce(g1.user_email, '') || '|' || coalesce(g1.note, '') || '|' ||
         sum(g1.brk) over (partition by coalesce(g1.user_email, ''), coalesce(g1.note, '') order by g1.created_at, g1.id) as grp
    from g1),
s as (
  select g.id, g.item_id, g.created_at, g.code, g.name, g.qty, g.user_email, g.note, g.grp,
         case when g.qcode is not null then 'quote' when i.rid is not null then 'image' end as src,
         coalesce(g.qcode, i.rid::text) as ref,
         coalesce(nullif(c.name, ''), nullif(q.customer_name, ''), nullif(i.party, ''),
                  nullif(substring(g.note from '^\[([^\]]+)\]'), ''), '') as cust,
         case when g.qcode is not null then nullif(round(g.qty * public.quote_unit_value(g.qcode, g.code)), 0)
              when i.inv_amount is not null and i.lqty > 0 and i.vsum > 0 then round(g.qty * i.inv_amount / i.lqty * i.val / i.vsum)
         end as value
    from g
    left join public.quotes q on q.code = g.qcode
    left join public.customers c on c.id = q.customer_id
    -- shortcut: phiếu ảnh ghép theo mã + số lượng, phiếu gần nhất trong 3 ngày trước dòng xuất (giống trigger công nợ); khi nào cần chắc chắn hơn thì thêm cột request_id vào movements.
    left join lateral (
      select r.id as rid, r.party, x.inv_amount, x.qty as lqty,
             public.order_debt_value(r.id) as val,
             (select sum(y.inv_amount) from public.request_lines y where y.request_id = r.id) as vsum
        from public.requests r
        join public.request_lines x on x.request_id = r.id
       where g.qcode is null and r.kind = 'out' and r.status = 'approved'
         and coalesce(r.sig, '') not like 'BG:%' and coalesce(r.sig, '') not like 'HK:%'
         and (x.item_id::text = g.item_id::text or upper(x.code) = upper(g.code))
         and x.qty >= g.qty
         and r.created_at <= g.created_at + interval '1 minute'
         and r.created_at >= g.created_at - interval '3 days'
       order by r.created_at desc limit 1) i on true)
select * from s
union all
select null, null, (h ->> 'at')::timestamptz, l ->> 'code', l ->> 'name', -public.num(l ->> 'qty'), h ->> 'by', h ->> 'note',
       'HK|' || q.code || '|' || coalesce(h ->> 'ref', ''), 'return', q.code,
       coalesce(nullif(c.name, ''), nullif(q.customer_name, ''), ''), -public.num(l ->> 'amount')
  from public.quotes q
  left join public.customers c on c.id = q.customer_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(q.returns) = 'array' then q.returns else '[]'::jsonb end) h
  cross join lateral jsonb_array_elements(case when jsonb_typeof(h -> 'lines') = 'array' then h -> 'lines' else '[]'::jsonb end) l
 where h ->> 'source' is distinct from 'void';

grant select on public.report_sales to authenticated;

-- KIỂM TRA (chạy tay sau khi cài):
--   1) Dòng xuất chưa xác định được giá / khách (nên xem để biết dữ liệu cũ thiếu gì):
--      select created_at, code, qty, note, user_email from public.report_sales where src is distinct from 'return' and (value is null or cust = '') order by created_at desc limit 50;
--   2) Một báo giá đã xuất hết phải ra đúng tổng tiền báo giá (thay mã):
--      select sum(value) from public.report_sales where ref = 'BG-261109-090';   -- so với quotes.total
