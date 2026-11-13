-- =====================================================================
-- CẬP NHẬT SUPABASE 9: báo giá chỉ tính công nợ sau khi phiếu xuất kho được DUYỆT + thông tin khách đầy đủ hơn
-- Chạy SAU supabase-update-8.sql. Chạy lại nhiều lần được.
-- Trạng thái báo giá: draft (nháp) · confirmed (đã chốt) · export_pending (chờ duyệt xuất kho) · exported (đã xuất kho) · cancelled (đã hủy)
-- Công nợ chỉ tính confirmed và exported.
-- =====================================================================
alter table public.customers add column if not exists contact text not null default '';
alter table public.customers add column if not exists email text not null default '';
alter table public.customers add column if not exists tax_code text not null default '';

drop view if exists public.customer_balances;
create view public.customer_balances with (security_invoker = true) as
select c.id, c.code, c.name, c.phone, c.address, c.note, c.opening_debt,
  coalesce(s.sales,0) as sales, coalesce(s.n,0) as quote_count, s.last_quote,
  coalesce(p.paid,0) as paid, p.last_paid,
  c.opening_debt + coalesce(s.sales,0) - coalesce(p.paid,0) as debt,
  coalesce(a.n,0) as all_quotes, c.contact, c.email, c.tax_code
from public.customers c
left join (select customer_id, sum(total) sales, count(*) n, max(updated_at) last_quote from public.quotes where status in ('confirmed','exported') group by customer_id) s on s.customer_id = c.id
left join (select customer_id, sum(amount) paid, max(paid_at) last_paid from public.customer_payments group by customer_id) p on p.customer_id = c.id
left join (select customer_id, count(*) n from public.quotes group by customer_id) a on a.customer_id = c.id;
grant select on public.customer_balances to authenticated;

-- Khi phiếu xuất (tạo từ báo giá, sig dạng 'BG:<mã>|...') được duyệt/từ chối thì cập nhật trạng thái báo giá
create or replace function public.sync_quote_export_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if new.sig is null or new.sig not like 'BG:%' then return new; end if;
  v_code := split_part(substr(new.sig, 4), '|', 1);
  if new.status = 'approved' then
    update public.quotes set status = 'exported', exported_at = coalesce(exported_at, now()) where code = v_code and status <> 'cancelled';
  elsif new.status in ('rejected','cancelled','canceled') then
    update public.quotes set status = 'confirmed' where code = v_code and status = 'export_pending';
  end if;
  return new;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='requests' and column_name='sig') then
    execute 'drop trigger if exists trg_sync_quote_export on public.requests';
    execute 'create trigger trg_sync_quote_export after update of status on public.requests for each row when (old.status is distinct from new.status) execute function public.sync_quote_export_status()';
    -- báo giá đã ghi "đã xuất kho" nhưng phiếu vẫn chờ duyệt -> chuyển về "chờ duyệt xuất kho" (chưa tính công nợ)
    execute $q$update public.quotes q set status = 'export_pending' where q.status = 'exported' and exists (select 1 from public.requests r where r.sig like 'BG:' || q.code || '|%' and r.status = 'pending')$q$;
  else
    raise notice 'Bảng requests không có cột sig: bỏ qua đồng bộ tự động, hãy đổi trạng thái báo giá thủ công.';
  end if;
end $$;
notify pgrst, 'reload schema';
