-- =====================================================================
-- CẬP NHẬT SUPABASE 13: báo giá ↔ kho ↔ công nợ liền mạch
-- Chạy SAU supabase-update-12.sql. Chạy lại nhiều lần được.
--
-- Quy tắc (database tự giữ, giao diện không tự đổi được):
--   1. Báo giá gửi xuất kho  -> 'export_pending' (chưa tính công nợ).
--   2. Kho DUYỆT phiếu xuất   -> 'exported'      (bắt đầu tính công nợ).
--      Kho từ chối / hủy      -> trở về 'confirmed'.
--   3. Hoàn kho theo báo giá: phiếu NHẬP có sig 'HK:<mã báo giá>|...', giá trị ghi bằng save_order_pricing.
--      Khi phiếu hoàn được DUYỆT -> cộng vào quotes.returned_amount và ghi chi tiết vào quotes.returns.
--   4. Công nợ = nợ đầu kỳ + Σ(total − returned_amount) của báo giá 'exported' − đã thanh toán.
--      Báo giá 'confirmed' (đã chốt, chưa xuất) KHÔNG còn tính vào công nợ.
--   5. Không ai (kể cả admin qua web) tự đặt/bỏ trạng thái 'export_pending'/'exported', sửa tổng tiền,
--      xóa báo giá đã gửi kho, hay sửa số tiền hoàn. Sửa dữ liệu cũ sai: chạy SQL trong SQL Editor.
-- =====================================================================

alter table public.quotes add column if not exists returned_amount numeric not null default 0;
alter table public.quotes add column if not exists returns jsonb not null default '[]'::jsonb;

-- Tìm khách theo tên (khớp chính xác) rồi theo số điện thoại. Không tạo mới.
create or replace function public.find_customer(p_name text, p_phone text) returns bigint
language plpgsql stable security invoker set search_path = public as $$
declare v_id bigint; v_name text := lower(regexp_replace(trim(coalesce(p_name,'')), '\s+', ' ', 'g'));
begin
  if v_name = '' then return null; end if;
  select id into v_id from public.customers where lower(regexp_replace(trim(name), '\s+', ' ', 'g')) = v_name order by id limit 1;
  if v_id is null then
    select c.id into v_id from public.customers c
    where exists (select 1 from regexp_matches(coalesce(p_phone,''), '\d{9,11}', 'g') a(m)
                  join regexp_matches(coalesce(c.phone,''), '\d{9,11}', 'g') b(m) on a.m[1] = b.m[1])
    order by c.id limit 1;
  end if;
  return v_id;
end $$;
revoke all on function public.find_customer(text,text) from anon;

create or replace function public.resolve_customer(p_name text, p_phone text, p_address text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if trim(coalesce(p_name,'')) = '' then return null; end if;
  v_id := public.find_customer(p_name, p_phone);
  if v_id is null then
    insert into public.customers (name, phone, address) values (trim(p_name), coalesce(p_phone,''), coalesce(p_address,'')) returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.resolve_customer(text,text,text) from public, anon, authenticated;

drop view if exists public.customer_balances;
create view public.customer_balances with (security_invoker = true) as
select c.id, c.code, c.name, c.phone, c.address, c.note, c.opening_debt,
  coalesce(s.sales,0) as sales, coalesce(s.n,0) as quote_count, s.last_quote,
  coalesce(p.paid,0) as paid, p.last_paid,
  c.opening_debt + coalesce(s.sales,0) - coalesce(p.paid,0) as debt,
  coalesce(a.n,0) as all_quotes, c.contact, c.email, c.tax_code,
  coalesce(s.returned,0) as returned
from public.customers c
left join (select customer_id, sum(total - returned_amount) sales, sum(returned_amount) returned, count(*) n, max(updated_at) last_quote
           from public.quotes where status = 'exported' group by customer_id) s on s.customer_id = c.id
left join (select customer_id, sum(amount) paid, max(paid_at) last_paid from public.customer_payments group by customer_id) p on p.customer_id = c.id
left join (select customer_id, count(*) n from public.quotes group by customer_id) a on a.customer_id = c.id;
grant select on public.customer_balances to authenticated;

-- Công nợ hiện tại của khách đang chọn trên báo giá, KHÔNG tính chính báo giá này.
create or replace function public.quote_old_debt(p_code text, p_name text, p_phone text) returns numeric
language plpgsql stable security invoker set search_path = public as $$
declare v_id bigint := public.find_customer(p_name, p_phone);
begin
  if v_id is null then return 0; end if;
  return coalesce((select debt from public.customer_balances where id = v_id), 0)
       - coalesce((select total - returned_amount from public.quotes
                   where code = p_code and status = 'exported' and customer_id = v_id), 0);
end $$;
revoke all on function public.quote_old_debt(text,text,text) from public, anon;
grant execute on function public.quote_old_debt(text,text,text) to authenticated;

-- Phiếu kho (BG: xuất theo báo giá, HK: hoàn kho theo báo giá) -> cập nhật báo giá.
create or replace function public.sync_quote_export_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if new.sig is null or (new.sig not like 'BG:%' and new.sig not like 'HK:%') then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status and old.inv_total is not distinct from new.inv_total then return new; end if;
  v_code := split_part(substr(new.sig, 4), '|', 1);
  if new.sig like 'BG:%' then
    if new.status = 'approved' then
      update public.quotes set status = 'exported', exported_at = coalesce(exported_at, now()), exported_by = coalesce(exported_by, new.created_by)
       where code = v_code and status <> 'exported';
    elsif new.status = 'pending' then
      update public.quotes set status = 'export_pending', exported_at = now(), exported_by = new.created_by
       where code = v_code and status not in ('export_pending','exported');
    elsif new.status in ('rejected','cancelled','canceled') then
      update public.quotes q set status = 'confirmed' where q.code = v_code and q.status = 'export_pending'
         and not exists (select 1 from public.requests r where r.sig like 'BG:' || v_code || '|%' and r.status in ('pending','approved') and r.id <> new.id);
    end if;
  elsif new.status = 'approved' and new.inv_total is not null then
    update public.quotes q
       set returned_amount = q.returned_amount + least(new.inv_total, greatest(0, q.total - q.returned_amount)),
           returns = q.returns || jsonb_build_array(jsonb_build_object(
             'request_id', new.id, 'at', now(), 'by', coalesce(new.reviewed_by, new.created_by), 'note', new.note,
             'amount', least(new.inv_total, greatest(0, q.total - q.returned_amount)),
             'lines', (select coalesce(jsonb_agg(jsonb_build_object('code', l.code, 'name', l.name, 'qty', l.qty, 'amount', l.inv_amount) order by l.id), '[]'::jsonb)
                         from public.request_lines l where l.request_id = new.id)))
     where q.code = v_code and q.status = 'exported'
       and not q.returns @> jsonb_build_array(jsonb_build_object('request_id', new.id));
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_quote_export on public.requests;
create trigger trg_sync_quote_export after insert or update of status, inv_total on public.requests
  for each row execute function public.sync_quote_export_status();

-- Chặn sửa tay từ web (vai trò 'authenticated'). Hàm security definer ở trên chạy bằng chủ sở hữu nên đi qua được.
create or replace function public.quotes_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    if new.status in ('export_pending','exported') or new.returned_amount <> 0 or new.returns <> '[]'::jsonb then
      raise exception 'Báo giá mới không được tạo sẵn ở trạng thái xuất kho / hoàn kho.';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status in ('export_pending','exported') then
      raise exception 'Báo giá % đã gửi/xuất kho, không xóa được.', old.code;
    end if;
    return old;
  end if;
  if new.status is distinct from old.status and (new.status in ('export_pending','exported') or old.status in ('export_pending','exported')) then
    raise exception 'Trạng thái xuất kho của báo giá % do kho cập nhật khi duyệt phiếu, không đổi tay được.', old.code;
  end if;
  if old.status in ('export_pending','exported') and new.total is distinct from old.total then
    raise exception 'Báo giá % đã gửi/xuất kho, không sửa được giá trị. Hàng trả lại: dùng Hoàn kho; đổi đơn: tạo báo giá mới.', old.code;
  end if;
  if new.returned_amount is distinct from old.returned_amount or new.returns is distinct from old.returns then
    raise exception 'Số tiền hoàn kho chỉ cập nhật khi kho duyệt phiếu hoàn.';
  end if;
  return new;
end $$;
drop trigger if exists trg_quotes_guard on public.quotes;
create trigger trg_quotes_guard before insert or update or delete on public.quotes
  for each row execute function public.quotes_guard();

-- Đồng bộ dữ liệu cũ theo phiếu kho hiện có.
update public.quotes q set status = 'export_pending'
 where q.status not in ('export_pending','exported','cancelled')
   and exists (select 1 from public.requests r where r.sig like 'BG:' || q.code || '|%' and r.status = 'pending');
update public.quotes q set status = 'exported', exported_at = coalesce(q.exported_at, now())
 where q.status <> 'exported'
   and exists (select 1 from public.requests r where r.sig like 'BG:' || q.code || '|%' and r.status = 'approved');

notify pgrst, 'reload schema';

-- Kiểm tra sau khi chạy (không bắt buộc): báo giá 'exported' mà không có phiếu xuất được duyệt nào
-- (thường do trước đây đổi tay trạng thái). Xem lại từng mã, sửa bằng SQL nếu sai.
-- select code, customer_name, total from public.quotes q where status = 'exported'
--   and not exists (select 1 from public.requests r where r.sig like 'BG:' || q.code || '|%' and r.status = 'approved');
