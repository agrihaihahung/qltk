-- =====================================================================
-- CẬP NHẬT SUPABASE 8: hồ sơ khách hàng, công nợ, thanh toán
-- Chạy SAU supabase-update-7.sql. Chạy lại nhiều lần được.
-- Công nợ = nợ đầu kỳ + tổng báo giá đã chốt/đã xuất kho − tổng đã thanh toán.
-- =====================================================================
alter table public.customers add column if not exists opening_debt numeric not null default 0;
alter table public.customers add column if not exists created_at timestamptz not null default now();
alter table public.quotes add column if not exists customer_id bigint references public.customers(id) on delete set null;
create index if not exists quotes_customer_idx on public.quotes (customer_id);

create table if not exists public.customer_payments (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  quote_code text,
  amount numeric not null check (amount <> 0),
  paid_at date not null default current_date,
  method text not null default 'Tiền mặt',
  note text not null default '',
  created_by text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);
create index if not exists customer_payments_cust_idx on public.customer_payments (customer_id, paid_at desc);
alter table public.customer_payments enable row level security;
drop policy if exists cpay_sel on public.customer_payments;
create policy cpay_sel on public.customer_payments for select to authenticated using (true);
drop policy if exists cpay_ins on public.customer_payments;
create policy cpay_ins on public.customer_payments for insert to authenticated with check (public.my_role() in ('admin','approver','staff'));
drop policy if exists cpay_upd on public.customer_payments;
create policy cpay_upd on public.customer_payments for update to authenticated using (public.is_boss()) with check (public.is_boss());
drop policy if exists cpay_del on public.customer_payments;
create policy cpay_del on public.customer_payments for delete to authenticated using (public.is_boss());

-- Tìm khách theo tên (khớp chính xác) rồi theo số điện thoại; chưa có thì tạo mới.
create or replace function public.resolve_customer(p_name text, p_phone text, p_address text) returns bigint
language plpgsql security definer set search_path = public as $$
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
  if v_id is null then
    insert into public.customers (name, phone, address) values (trim(p_name), coalesce(p_phone,''), coalesce(p_address,'')) returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.link_quote_customer(p_code text) returns bigint
language plpgsql security definer set search_path = public as $$
declare q record; v bigint;
begin
  if public.my_role() not in ('admin','approver','staff') then raise exception 'Bạn không có quyền'; end if;
  select * into q from public.quotes where code = p_code;
  if not found then return null; end if;
  v := public.resolve_customer(q.customer_name, q.customer_phone, q.payload -> 'customer' ->> 'address');
  update public.quotes set customer_id = v where code = p_code;
  return v;
end $$;
revoke all on function public.resolve_customer(text,text,text) from public, anon, authenticated;
revoke all on function public.link_quote_customer(text) from public, anon;
grant execute on function public.link_quote_customer(text) to authenticated;

-- Giá trị đơn = tổng thanh toán trừ phần "nợ cũ" đã cộng vào báo giá (tránh cộng trùng)
update public.quotes set total = greatest(0, coalesce((payload->'totals'->>'grand')::numeric, total) - coalesce((payload->'totals'->>'oldDebt')::numeric, 0))
where payload ? 'totals';

-- Gắn các báo giá cũ vào hồ sơ khách (tạo khách mới nếu chưa có trong danh mục)
do $$ declare r record; begin
  for r in select code from public.quotes where customer_id is null and coalesce(customer_name,'') <> '' order by updated_at loop
    update public.quotes set customer_id = public.resolve_customer(customer_name, customer_phone, payload -> 'customer' ->> 'address') where code = r.code;
  end loop;
end $$;

create or replace view public.customer_balances with (security_invoker = true) as
select c.id, c.code, c.name, c.phone, c.address, c.note, c.opening_debt,
  coalesce(s.sales,0) as sales, coalesce(s.n,0) as quote_count, s.last_quote,
  coalesce(p.paid,0) as paid, p.last_paid,
  c.opening_debt + coalesce(s.sales,0) - coalesce(p.paid,0) as debt,
  coalesce(a.n,0) as all_quotes
from public.customers c
left join (select customer_id, sum(total) sales, count(*) n, max(updated_at) last_quote from public.quotes where status in ('confirmed','exported') group by customer_id) s on s.customer_id = c.id
left join (select customer_id, sum(amount) paid, max(paid_at) last_paid from public.customer_payments group by customer_id) p on p.customer_id = c.id
left join (select customer_id, count(*) n from public.quotes group by customer_id) a on a.customer_id = c.id;
grant select on public.customer_balances to authenticated;
notify pgrst, 'reload schema';
