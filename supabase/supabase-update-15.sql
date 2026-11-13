-- =====================================================================
-- CẬP NHẬT SUPABASE 15: (A) công nợ cho phiếu xuất kho từ ảnh, (B) đơn vị bán ra + bảng quy đổi theo mã
-- Chạy SAU supabase-update-14.sql. Chạy lại nhiều lần được.
-- Chỉ THÊM cột / bảng / hàm; không sửa submit_request, approve_request, void_movements.
--
-- (A) Công nợ phiếu xuất ảnh
--   * Phiếu xuất từ ảnh (source 'image', không phải BG:/HK:) trước đây KHÔNG vào công nợ vì không có báo giá.
--   * Giờ mỗi phiếu ghi: khách tính nợ (debt_customer_id) + chế độ debt_mode:
--       'count' = tính công nợ theo tổng phiếu (inv_total, hoặc cộng thành tiền các dòng - chiết khấu)
--       'skip'  = đã quyết định KHÔNG tính (khách lẻ / thu tiền ngay)
--       NULL    = chưa quyết định (phiếu cũ) -> không tính, giao diện hiện cảnh báo để gán sau.
--   * Chỉ phiếu đã DUYỆT mới tính nợ (giống báo giá). Phiếu chờ duyệt / bị từ chối / hủy: không tính.
--   * Hủy dòng xuất trong Lịch sử kho -> trừ nợ theo tỷ lệ giá trị dòng (bảng order_debt_adjust).
--   * customer_balances.sales / debt đã gồm phần này; quote_old_debt (nợ cũ trên báo giá) tự gồm theo.
--
-- (B) Đơn vị bán ra
--   * items.unit vẫn là đơn vị TỒN KHO. Bảng item_units khai báo các đơn vị bán khác:
--       "1 <unit> = <factor> <đơn vị kho>"  (VD: 1 hộp = 100 chiếc; 1 bộ = 2 chiếc; 1 kg = 0.25 thanh).
--   * Kho luôn trừ theo đơn vị kho; request_lines ghi thêm sale_qty / sale_unit / sale_factor để xem lại.
--   * quote_unit_value (giá trị trừ nợ khi hoàn kho theo báo giá) chia theo SỐ LƯỢNG KHO nên không lệch khi quy đổi.
-- =====================================================================

-- ---------- (A) cột + bảng ----------
alter table public.requests
  add column if not exists debt_customer_id   bigint references public.customers(id) on delete set null,
  add column if not exists debt_customer_name text,
  add column if not exists debt_mode          text,
  add column if not exists debt_set_by        text,
  add column if not exists debt_set_at        timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'requests_debt_mode_chk') then
    alter table public.requests add constraint requests_debt_mode_chk check (debt_mode is null or debt_mode in ('count','skip'));
  end if;
end $$;
create index if not exists requests_debt_customer_idx on public.requests (debt_customer_id) where debt_mode = 'count';

alter table public.request_lines
  add column if not exists sale_qty    numeric,   -- số lượng theo đơn vị bán
  add column if not exists sale_unit   text,      -- đơn vị bán
  add column if not exists sale_factor numeric;   -- 1 đơn vị bán = bao nhiêu đơn vị kho

create table if not exists public.order_debt_adjust (
  id         bigint generated always as identity primary key,
  request_id uuid not null references public.requests(id) on delete cascade,
  ref        text not null unique,                 -- 'mv:<id dòng xuất bị hủy>'
  amount     numeric not null check (amount >= 0),
  reason     text,
  lines      jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists order_debt_adjust_req_idx on public.order_debt_adjust (request_id);
alter table public.order_debt_adjust enable row level security;
drop policy if exists oda_sel on public.order_debt_adjust;
create policy oda_sel on public.order_debt_adjust for select to authenticated using (true);
-- không có policy ghi: chỉ các hàm security definer bên dưới ghi được

-- ---------- (A) giá trị nợ của một phiếu ----------
create or replace function public.order_debt_value(p_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce(r.inv_total,
           (select sum(l.inv_amount) from public.request_lines l where l.request_id = r.id) - coalesce(r.inv_discount, 0), 0))
    from public.requests r where r.id = p_id $$;

create or replace function public.order_debt_net(p_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select greatest(0, public.order_debt_value(p_id) - coalesce((select sum(amount) from public.order_debt_adjust where request_id = p_id), 0)) $$;

-- Tổng nợ phát sinh từ phiếu xuất ảnh theo khách (chỉ phiếu đã duyệt, chế độ 'count').
create or replace function public.image_order_sales() returns table(customer_id bigint, sales numeric, n bigint, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.debt_customer_id, sum(public.order_debt_net(r.id)), count(*), max(r.created_at)
    from public.requests r
   where r.kind = 'out' and r.status = 'approved' and r.debt_mode = 'count' and r.debt_customer_id is not null
     and coalesce(r.sig, '') not like 'BG:%' and coalesce(r.sig, '') not like 'HK:%'
     and public.my_role() is distinct from 'ctv'
   group by r.debt_customer_id $$;
revoke all on function public.image_order_sales() from public, anon;
grant execute on function public.image_order_sales() to authenticated;

-- Danh sách phiếu xuất ảnh đã gán nợ cho 1 khách (cho trang Khách hàng).
create or replace function public.customer_image_orders(p_customer bigint)
returns table(id uuid, created_at timestamptz, doc_date text, party text, status text, created_by text, value numeric, adjusted numeric, net numeric)
language sql stable security definer set search_path = public as $$
  select r.id, r.created_at, r.doc_date::text, r.party, r.status, r.created_by,
         public.order_debt_value(r.id),
         coalesce((select sum(a.amount) from public.order_debt_adjust a where a.request_id = r.id), 0),
         public.order_debt_net(r.id)
    from public.requests r
   where r.debt_customer_id = p_customer and r.debt_mode = 'count' and r.kind = 'out'
     and r.status in ('pending', 'approved') and public.my_role() is distinct from 'ctv'
   order by r.created_at desc $$;
revoke all on function public.customer_image_orders(bigint) from public, anon;
grant execute on function public.customer_image_orders(bigint) to authenticated;

-- ---------- (A) công nợ trong customer_balances ----------
drop view if exists public.customer_balances;
create view public.customer_balances with (security_invoker = true) as
select c.id, c.code, c.name, c.phone, c.address, c.note, c.opening_debt,
  coalesce(s.sales,0) + coalesce(io.sales,0) as sales, coalesce(s.n,0) as quote_count, s.last_quote,
  coalesce(p.paid,0) as paid, p.last_paid,
  c.opening_debt + coalesce(s.sales,0) + coalesce(io.sales,0) - coalesce(p.paid,0) as debt,
  coalesce(a.n,0) as all_quotes, c.contact, c.email, c.tax_code,
  coalesce(s.returned,0) as returned,
  coalesce(io.sales,0) as order_sales, coalesce(io.n,0) as order_count
from public.customers c
left join (select customer_id, sum(total - returned_amount) sales, sum(returned_amount) returned, count(*) n, max(updated_at) last_quote
           from public.quotes where status in ('exported','returned') group by customer_id) s on s.customer_id = c.id
left join (select customer_id, sum(amount) paid, max(paid_at) last_paid from public.customer_payments group by customer_id) p on p.customer_id = c.id
left join (select customer_id, count(*) n from public.quotes group by customer_id) a on a.customer_id = c.id
left join public.image_order_sales() io on io.customer_id = c.id;
grant select on public.customer_balances to authenticated;

-- ---------- (A) gán khách / chế độ tính nợ + đơn vị bán cho phiếu vừa tạo ----------
-- p_count: true = tính nợ cho p_customer_id; false = không tính (đã quyết định); NULL = không đụng tới phần nợ.
-- p_lines: [{code, sale_qty, sale_unit, sale_factor}] đúng thứ tự dòng đã gửi cho submit_request (khớp theo vị trí + mã).
create or replace function public.save_order_sale(p_id uuid, p_sig text, p_customer_id bigint, p_count boolean, p_lines jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_by text; v_at timestamptz; v_kind text; v_sig text; v_src text; v_cname text;
        v_line bigint; r record; n int := 0; k int; v_mode text; v_f numeric;
begin
  if public.my_role() not in ('admin','approver','staff') then raise exception 'Bạn không có quyền ghi thông tin phiếu'; end if;
  if p_id is not null then
    select id, created_by, created_at, kind, sig, source into v_id, v_by, v_at, v_kind, v_sig, v_src from public.requests where id = p_id;
  else
    select id, created_by, created_at, kind, sig, source into v_id, v_by, v_at, v_kind, v_sig, v_src from public.requests where sig = p_sig order by created_at desc limit 1;
  end if;
  if v_id is null then raise exception 'Không tìm thấy phiếu'; end if;
  if not public.is_boss() and (v_by is distinct from (auth.jwt() ->> 'email') or v_at < now() - interval '30 minutes') then
    raise exception 'Chỉ ghi được cho phiếu do bạn vừa tạo';
  end if;

  if p_count is not null then
    if v_kind <> 'out' or coalesce(v_sig,'') like 'BG:%' or coalesce(v_sig,'') like 'HK:%' or v_src is distinct from 'image' then
      raise exception 'Chỉ phiếu xuất kho từ ảnh mới gán công nợ trực tiếp (xuất theo báo giá tự tính công nợ qua báo giá).';
    end if;
    if p_count then
      if p_customer_id is null then raise exception 'Chọn khách hàng để tính công nợ'; end if;
      select name into v_cname from public.customers where id = p_customer_id;
      if not found then raise exception 'Không tìm thấy khách hàng'; end if;
      v_mode := 'count';
    else
      v_mode := 'skip';
      if p_customer_id is not null then select name into v_cname from public.customers where id = p_customer_id; end if;
    end if;
    update public.requests
       set debt_mode = v_mode, debt_customer_id = p_customer_id, debt_customer_name = v_cname,
           debt_set_by = auth.jwt() ->> 'email', debt_set_at = now()
     where id = v_id;
  end if;

  for r in select value as e, ord from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as t(value, ord) loop
    v_f := public.num(r.e ->> 'sale_factor');
    continue when v_f <= 0 or coalesce(r.e ->> 'sale_unit', '') = '';
    select id into v_line from public.request_lines where request_id = v_id order by id offset (r.ord - 1) limit 1;
    update public.request_lines
       set sale_qty = nullif(r.e ->> 'sale_qty', '')::numeric, sale_unit = left(trim(r.e ->> 'sale_unit'), 30), sale_factor = v_f
     where id = v_line and (upper(code) = upper(coalesce(r.e ->> 'code', '')) or item_id::text = r.e ->> 'item_id');
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return jsonb_build_object('mode', v_mode, 'lines', n, 'customer', v_cname);
end $$;
revoke all on function public.save_order_sale(uuid, text, bigint, boolean, jsonb) from public, anon;
grant execute on function public.save_order_sale(uuid, text, bigint, boolean, jsonb) to authenticated;

-- Gán / đổi công nợ cho phiếu xuất ảnh đã có (kể cả phiếu cũ chưa tính nợ). Chỉ quản lý.
create or replace function public.set_order_debt(p_request_id uuid, p_customer_id bigint, p_count boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_cname text;
begin
  if not public.is_boss() then raise exception 'Chỉ quản lý được gán công nợ cho phiếu'; end if;
  select * into r from public.requests where id = p_request_id for update;
  if not found then raise exception 'Không tìm thấy phiếu'; end if;
  if r.kind <> 'out' or coalesce(r.sig,'') like 'BG:%' or coalesce(r.sig,'') like 'HK:%' or r.source is distinct from 'image' then
    raise exception 'Chỉ gán công nợ cho phiếu xuất kho từ ảnh.';
  end if;
  if r.status not in ('pending','approved') then raise exception 'Phiếu đã bị từ chối / hủy, không gán công nợ.'; end if;
  if p_count then
    if p_customer_id is null then raise exception 'Chọn khách hàng để tính công nợ'; end if;
    select name into v_cname from public.customers where id = p_customer_id;
    if not found then raise exception 'Không tìm thấy khách hàng'; end if;
  elsif p_customer_id is not null then
    select name into v_cname from public.customers where id = p_customer_id;
  end if;
  if r.debt_mode = 'count' and p_count and r.debt_customer_id is distinct from p_customer_id
     and exists (select 1 from public.order_debt_adjust where request_id = r.id) then
    raise exception 'Phiếu này đã có dòng xuất bị hủy trừ nợ cho khách cũ, không đổi sang khách khác được.';
  end if;
  update public.requests
     set debt_mode = case when p_count then 'count' else 'skip' end,
         debt_customer_id = p_customer_id, debt_customer_name = v_cname,
         debt_set_by = auth.jwt() ->> 'email', debt_set_at = now()
   where id = r.id;
end $$;
revoke all on function public.set_order_debt(uuid, bigint, boolean) from public, anon;
grant execute on function public.set_order_debt(uuid, bigint, boolean) to authenticated;

-- ---------- (A) hủy dòng xuất -> trừ nợ phiếu xuất ảnh ----------
-- Không chặn việc hủy dòng xuất nếu phần nợ gặp lỗi: chỉ cảnh báo (xem câu KIỂM TRA cuối file).
create or replace function public.movement_void_to_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := to_jsonb(new); v_req uuid; l record; v_val numeric; v_sum numeric; v_done numeric; v_amt numeric;
        v_qty_all numeric; v_ret_all numeric; v_ret_code numeric; v_rem numeric;
begin
  if new.kind <> 'out' or old.voided_at is not null or new.voided_at is null then return new; end if;
  begin
    begin v_req := coalesce(m ->> 'request_id', m ->> 'req_id')::uuid; exception when others then v_req := null; end;
    if v_req is not null and not exists (select 1 from public.requests where id = v_req and debt_mode = 'count' and status = 'approved'
                                          and coalesce(sig,'') not like 'BG:%' and coalesce(sig,'') not like 'HK:%') then
      v_req := null;
    end if;
    if v_req is null then
      select r.id into v_req
        from public.requests r join public.request_lines x on x.request_id = r.id
       where r.kind = 'out' and r.status = 'approved' and r.debt_mode = 'count'
         and coalesce(r.sig,'') not like 'BG:%' and coalesce(r.sig,'') not like 'HK:%'
         and x.item_id::text = m ->> 'item_id' and x.qty >= new.qty
         and r.created_at <= coalesce(new.created_at, now()) + interval '1 minute'
         and coalesce((select sum(public.num(e ->> 'qty')) from public.order_debt_adjust a, jsonb_array_elements(a.lines) e
                        where a.request_id = r.id and upper(e ->> 'code') = upper(x.code)), 0) + new.qty <= x.qty + 0.000001
       order by r.created_at desc limit 1;
    end if;
    if v_req is null then return new; end if;
    if exists (select 1 from public.order_debt_adjust where ref = 'mv:' || new.id) then return new; end if;

    select * into l from public.request_lines
     where request_id = v_req and (item_id::text = m ->> 'item_id' or upper(code) = upper(new.code)) order by (item_id::text = m ->> 'item_id') desc, id limit 1;
    if not found or l.inv_amount is null or coalesce(l.qty, 0) <= 0 then return new; end if;

    v_val := public.order_debt_value(v_req);
    select coalesce(sum(inv_amount), 0), coalesce(sum(qty), 0) into v_sum, v_qty_all from public.request_lines where request_id = v_req;
    select coalesce(sum(amount), 0) into v_done from public.order_debt_adjust where request_id = v_req;
    if v_sum <= 0 then return new; end if;
    -- giá trị dòng đã gồm chiết khấu / vận chuyển theo tỷ lệ (tổng phiếu / cộng thành tiền các dòng)
    v_amt := round(new.qty * l.inv_amount / l.qty * v_val / v_sum);
    select coalesce(sum(public.num(e ->> 'qty')), 0) into v_ret_all from public.order_debt_adjust a, jsonb_array_elements(a.lines) e where a.request_id = v_req;
    if v_ret_all + new.qty >= v_qty_all - 0.000001 then v_amt := greatest(0, v_val - v_done); end if;   -- hoàn hết = trừ hết phần còn lại
    v_amt := least(v_amt, greatest(0, v_val - v_done));
    insert into public.order_debt_adjust (request_id, ref, amount, reason, lines, created_by)
    values (v_req, 'mv:' || new.id, v_amt, 'Hủy xuất kho: ' || coalesce(new.void_reason, ''),
            jsonb_build_array(jsonb_build_object('code', new.code, 'qty', new.qty, 'amount', v_amt)),
            coalesce(new.voided_by, auth.jwt() ->> 'email'));
  exception when others then
    raise warning 'Không trừ được công nợ phiếu xuất ảnh cho dòng xuất %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists trg_movement_void_to_order on public.movements;
create trigger trg_movement_void_to_order after update of voided_at on public.movements
  for each row execute function public.movement_void_to_order();

-- ---------- (B) bảng quy đổi đơn vị theo mã ----------
do $$ declare t text; begin
  select format_type(a.atttypid, a.atttypmod) into t from pg_attribute a
   where a.attrelid = 'public.items'::regclass and a.attname = 'id' and not a.attisdropped;
  if t is null then raise exception 'Không thấy cột items.id'; end if;
  execute format($f$create table if not exists public.item_units (
      id bigint generated always as identity primary key,
      item_id %s not null references public.items(id) on delete cascade,
      unit text not null,
      factor numeric not null check (factor > 0),
      note text not null default '',
      created_by text default (auth.jwt() ->> 'email'),
      created_at timestamptz not null default now())$f$, t);
end $$;
create unique index if not exists item_units_uq on public.item_units (item_id, lower(unit));

create or replace function public.item_units_guard() returns trigger
language plpgsql set search_path = public as $$
declare v_base text;
begin
  new.unit := regexp_replace(trim(coalesce(new.unit, '')), '\s+', ' ', 'g');
  if new.unit = '' or length(new.unit) > 30 then raise exception 'Đơn vị bán không hợp lệ (1–30 ký tự).'; end if;
  select unit into v_base from public.items where id = new.item_id;
  if lower(new.unit) = lower(coalesce(v_base, '')) then
    raise exception 'Đơn vị bán trùng với đơn vị kho (%): không cần quy đổi.', v_base;
  end if;
  return new;
end $$;
drop trigger if exists trg_item_units_guard on public.item_units;
create trigger trg_item_units_guard before insert or update on public.item_units for each row execute function public.item_units_guard();

alter table public.item_units enable row level security;
drop policy if exists iu_sel on public.item_units;
create policy iu_sel on public.item_units for select to authenticated using (true);
drop policy if exists iu_ins on public.item_units;
create policy iu_ins on public.item_units for insert to authenticated with check (public.my_role() in ('admin','approver','staff'));
drop policy if exists iu_upd on public.item_units;
create policy iu_upd on public.item_units for update to authenticated using (public.my_role() in ('admin','approver','staff')) with check (public.my_role() in ('admin','approver','staff'));
drop policy if exists iu_del on public.item_units;
create policy iu_del on public.item_units for delete to authenticated using (public.my_role() in ('admin','approver','staff'));

-- CTV vẫn bị chặn mọi bảng nghiệp vụ (như update-10), gồm 2 bảng mới
do $$ declare t text; begin
  foreach t in array array['item_units', 'order_debt_adjust'] loop
    execute format('drop policy if exists ctv_block on public.%I', t);
    execute format($p$create policy ctv_block on public.%I as restrictive for all to authenticated
                      using (public.my_role() is distinct from 'ctv')
                      with check (public.my_role() is distinct from 'ctv')$p$, t);
  end loop;
end $$;

-- ---------- (B) giá trị trừ nợ khi hoàn kho theo báo giá: chia theo SỐ LƯỢNG KHO ----------
-- Trước: giá trị / số lượng trên báo giá (VD 10 hộp) rồi nhân số lượng hoàn (tính theo kho, VD 300 chiếc) -> sai khi hộp ≠ chiếc.
-- Nay: hệ số quy đổi lấy từ dòng phiếu xuất của báo giá (request_lines.sale_factor, mặc định 1).
create or replace function public.quote_unit_value(p_code text, p_item text) returns numeric
language sql stable security definer set search_path = public as $$
  with q as (select total, payload p from public.quotes where code = p_code),
  l as (
    select e, true as al from q, jsonb_array_elements(case when jsonb_typeof(q.p->'aluminum') = 'array' then q.p->'aluminum' else '[]'::jsonb end) e
    union all
    select e, false from q, jsonb_array_elements(case when q.p->>'accessoriesIncluded' = 'false' or jsonb_typeof(q.p->'accessories') is distinct from 'array' then '[]'::jsonb else q.p->'accessories' end) e),
  v as (
    select public.qkey(e->>'code') k, public.num(e->>'qty') qty,
      case when al then public.num(e->>'qty') * public.num(e->>'weight') * public.num(e->>'price')
           else public.num(e->>'qty') * public.num(e->>'price') * (1 - least(100, greatest(0, public.num(e->>'discountPercent'))) / 100) end val
    from l),
  fx as (
    select coalesce((select max(x.sale_factor) from public.requests r join public.request_lines x on x.request_id = r.id
                      where r.sig like 'BG:' || p_code || '|%' and r.status in ('pending','approved')
                        and public.qkey(x.code) = public.qkey(p_item) and x.sale_factor > 0), 1) f)
  select coalesce((select sum(val) / nullif(sum(qty) * (select f from fx), 0) from v where k = public.qkey(p_item))
                  * (select total from q) / nullif((select sum(val) from v), 0), 0)
$$;

notify pgrst, 'reload schema';

-- KIỂM TRA sau khi chạy (không bắt buộc):
-- 1) Phiếu xuất ảnh đã duyệt nhưng CHƯA quyết định tính nợ (phiếu cũ) -> gán ở trang Chờ duyệt > Đã xử lý, nút "Gán công nợ":
--   select id, created_at, party, inv_total from public.requests
--    where kind = 'out' and source = 'image' and status = 'approved' and debt_mode is null
--      and coalesce(sig,'') not like 'BG:%' order by created_at desc;
-- 2) Dòng xuất ảnh đã hủy nhưng chưa trừ nợ (phiếu đã gán 'count'):
--   select m.id, m.code, m.qty, m.note, m.voided_at from public.movements m
--    where m.kind = 'out' and m.voided_at is not null and not exists (select 1 from public.order_debt_adjust a where a.ref = 'mv:' || m.id)
--      and exists (select 1 from public.requests r join public.request_lines x on x.request_id = r.id
--                   where r.debt_mode = 'count' and x.item_id::text = to_jsonb(m) ->> 'item_id' and r.status = 'approved');
