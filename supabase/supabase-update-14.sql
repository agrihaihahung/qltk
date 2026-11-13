-- =====================================================================
-- CẬP NHẬT SUPABASE 14: hoàn kho ở MỌI đường đều trừ công nợ + định giá thống nhất phía server
-- Chạy SAU supabase-update-13.sql. Chạy lại nhiều lần được.
--
-- Sửa lỗi: "Hủy đơn" xuất kho (Lịch sử kho → Hoàn xuất) đã cộng lại tồn nhưng KHÔNG trừ công nợ,
-- báo giá vẫn "Đã xuất kho" và không xóa được.
--
-- Quy tắc mới:
--   * Hoàn kho có 2 đường, cùng một hàm apply_quote_return:
--       a) Hủy dòng xuất trong Lịch sử kho (void_movements)      -> trừ nợ ngay khi hủy.
--       b) Phiếu hoàn kho từ báo giá (phiếu nhập, sig 'HK:...')    -> trừ nợ khi phiếu được duyệt.
--   * Giá trị hoàn do SERVER tính từ báo giá đã khóa: giá dòng báo giá × (tổng báo giá / cộng tiền hàng),
--     tức chiết khấu chung và VAT chia đều theo giá trị. Giao diện chỉ hiện ước tính cùng công thức.
--   * Không hoàn quá số đã xuất của từng mã (chặn cả hủy xuất lẫn duyệt phiếu hoàn).
--   * Hoàn đủ mọi số lượng đã xuất -> báo giá chuyển 'returned' (Đã hoàn kho), công nợ của đơn về 0,
--     và XÓA được. Không xuất kho tiếp được từ báo giá đã hoàn toàn bộ (tạo báo giá mới).
--   * Báo giá đã gửi / đã xuất / đã hoàn bị khóa nội dung (payload + tổng tiền).
-- =====================================================================

-- Số an toàn từ chuỗi JSON (rỗng / chữ -> 0)
create or replace function public.num(t text) returns numeric language sql immutable as $$
  select case when t ~ '^\s*-?\d+(\.\d+)?([eE][-+]?\d+)?\s*$' then t::numeric else 0 end $$;
-- Khóa so khớp mã giữa báo giá và kho (giống nrm() ở stock-link.js, bỏ tiền tố N- của nhôm)
create or replace function public.qkey(t text) returns text language sql immutable as $$
  select lower(regexp_replace(regexp_replace(coalesce(t,''), '^\s*n-', '', 'i'), '[^a-zA-Z0-9]', '', 'g')) $$;

-- Đơn giá trị trừ nợ của 1 đơn vị mã kho p_item trong báo giá p_code.
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
    from l)
  select coalesce((select sum(val) / nullif(sum(qty), 0) from v where k = public.qkey(p_item))
                  * (select total from q) / nullif((select sum(val) from v), 0), 0)
$$;

-- Ghi 1 lần hoàn kho vào báo giá. p_lines: [{code, name, qty}] theo mã kho. Trả về số tiền đã trừ nợ.
create or replace function public.apply_quote_return(p_code text, p_ref text, p_source text, p_note text, p_by text, p_lines jsonb)
returns numeric language plpgsql security definer set search_path = public as $$
declare q record; e jsonb; v_lines jsonb := '[]'; v_qty numeric; v_exp numeric; v_ret numeric;
        v_exp_all numeric; v_ret_all numeric; v_amt numeric; v_apply numeric; v_full boolean;
begin
  select * into q from public.quotes where code = p_code for update;
  if not found or q.status not in ('exported','returned') then return 0; end if;
  if q.returns @> jsonb_build_array(jsonb_build_object('ref', p_ref)) then return 0; end if;
  if q.status = 'returned' then raise exception 'Báo giá % đã hoàn kho toàn bộ, không hoàn thêm được.', p_code; end if;

  for e in select x from jsonb_array_elements(coalesce(p_lines, '[]')) x loop
    v_qty := public.num(e->>'qty');
    continue when v_qty <= 0;
    select coalesce(sum(l.qty), 0) into v_exp from public.requests r join public.request_lines l on l.request_id = r.id
     where r.sig like 'BG:' || p_code || '|%' and r.status = 'approved' and upper(l.code) = upper(e->>'code');
    select coalesce(sum(public.num(x->>'qty')), 0) into v_ret
      from (select x from jsonb_array_elements(q.returns) h, jsonb_array_elements(coalesce(h->'lines','[]')) x
            union all select x from jsonb_array_elements(v_lines) x) s(x)
     where upper(x->>'code') = upper(e->>'code');
    -- v_exp = 0: báo giá cũ chưa có phiếu xuất gắn mã -> không kiểm được số lượng, chỉ chặn theo tiền
    if v_exp > 0 and v_ret + v_qty > v_exp + 0.000001 then
      raise exception 'Mã % của báo giá %: đã xuất %, đã hoàn %, không hoàn thêm % được.', e->>'code', p_code, v_exp, v_ret, v_qty;
    end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('code', e->>'code', 'name', e->>'name', 'qty', v_qty,
                 'amount', round(v_qty * public.quote_unit_value(p_code, e->>'code'))));
  end loop;
  if v_lines = '[]'::jsonb then return 0; end if;

  select coalesce(sum(public.num(x->>'amount')), 0) into v_amt from jsonb_array_elements(v_lines) x;
  select coalesce(sum(l.qty), 0) into v_exp_all from public.requests r join public.request_lines l on l.request_id = r.id
   where r.sig like 'BG:' || p_code || '|%' and r.status = 'approved';
  select coalesce(sum(public.num(x->>'qty')), 0) into v_ret_all
    from (select x from jsonb_array_elements(q.returns) h, jsonb_array_elements(coalesce(h->'lines','[]')) x
          union all select x from jsonb_array_elements(v_lines) x) s(x);
  -- Trả lại đủ hàng đã xuất = hủy cả đơn: trừ hết phần còn lại (kể cả dòng không quản lý tồn kho)
  v_full := v_exp_all > 0 and v_ret_all >= v_exp_all - 0.000001;
  v_apply := case when v_full then greatest(0, q.total - q.returned_amount) else least(v_amt, greatest(0, q.total - q.returned_amount)) end;

  update public.quotes
     set returned_amount = returned_amount + v_apply,
         status = case when v_full then 'returned' else status end,
         returns = returns || jsonb_build_array(jsonb_build_object('ref', p_ref, 'source', p_source, 'at', now(), 'by', p_by,
                     'note', p_note, 'amount', v_apply, 'lines', v_lines))
   where code = p_code;
  return v_apply;
end $$;
revoke all on function public.apply_quote_return(text,text,text,text,text,jsonb) from public, anon, authenticated;

-- Dòng xuất kho thuộc báo giá nào: cột request_id (nếu có) -> ghi chú "báo giá <mã>" -> phiếu BG cùng mã hàng + số lượng + tên khách.
create or replace function public.quote_of_movement(m jsonb) returns text
language plpgsql stable security definer set search_path = public as $$
declare v text; r text := coalesce(m->>'request_id', m->>'req_id');
begin
  if r is not null then
    select split_part(substr(sig, 4), '|', 1) into v from public.requests where id::text = r and sig like 'BG:%';
    if v is not null then return v; end if;
  end if;
  v := substring(coalesce(m->>'note','') from 'báo giá\s+([^\s,;·\]\)]+)');
  if v is not null and exists (select 1 from public.quotes where code = v) then return v; end if;
  select split_part(substr(rq.sig, 4), '|', 1) into v
    from public.requests rq join public.request_lines l on l.request_id = rq.id
   where rq.sig like 'BG:%' and rq.status = 'approved'
     and l.item_id::text = m->>'item_id' and l.qty = public.num(m->>'qty')
     and rq.created_at <= coalesce((m->>'created_at')::timestamptz, now())
     and coalesce(rq.party,'') <> ''
     and (coalesce(m->>'note','') ilike '%' || rq.party || '%' or coalesce(m->>'cust','') ilike rq.party)
   order by rq.created_at desc limit 1;
  return v;
end $$;

-- Hủy dòng xuất (void_movements) -> hoàn kho cho báo giá
create or replace function public.movement_void_to_quote() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if new.kind <> 'out' or old.voided_at is not null or new.voided_at is null then return new; end if;
  v_code := public.quote_of_movement(to_jsonb(new));
  if v_code is not null then
    perform public.apply_quote_return(v_code, 'mv:' || new.id, 'void', 'Hủy xuất kho: ' || coalesce(new.void_reason, ''),
      coalesce(new.voided_by, auth.jwt() ->> 'email'), jsonb_build_array(jsonb_build_object('code', new.code, 'name', new.name, 'qty', new.qty)));
  end if;
  return new;
end $$;
drop trigger if exists trg_movement_void_to_quote on public.movements;
create trigger trg_movement_void_to_quote after update of voided_at on public.movements
  for each row execute function public.movement_void_to_quote();

-- Phiếu kho -> báo giá. Chạy lúc COMMIT (deferred) để dòng phiếu đã được ghi đủ, đọc trạng thái phiếu mới nhất.
create or replace function public.sync_quote_export_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_code text; r record; qs text;
        v_new boolean := tg_op = 'INSERT' or old.status is distinct from new.status; -- chỉ chặn khi phiếu mới tạo / đổi trạng thái
begin
  select * into r from public.requests where id = new.id;
  if not found or r.sig is null or (r.sig not like 'BG:%' and r.sig not like 'HK:%') then return null; end if;
  v_code := split_part(substr(r.sig, 4), '|', 1);
  select status into qs from public.quotes where code = v_code;
  if r.sig like 'BG:%' then
    if v_new and qs = 'returned' and r.status in ('pending','approved') then
      raise exception 'Báo giá % đã hoàn kho toàn bộ, không xuất tiếp được. Hãy tạo báo giá mới.', v_code;
    end if;
    if r.status = 'approved' then
      update public.quotes set status = 'exported', exported_at = coalesce(exported_at, now()), exported_by = coalesce(exported_by, r.created_by)
       where code = v_code and status not in ('exported','returned');
    elsif r.status = 'pending' then
      update public.quotes set status = 'export_pending', exported_at = now(), exported_by = r.created_by
       where code = v_code and status not in ('export_pending','exported','returned');
    elsif r.status in ('rejected','cancelled','canceled') then
      update public.quotes q set status = 'confirmed' where q.code = v_code and q.status = 'export_pending'
         and not exists (select 1 from public.requests x where x.sig like 'BG:' || v_code || '|%' and x.status in ('pending','approved') and x.id <> r.id);
    end if;
  elsif r.status = 'approved' then
    if exists (select 1 from public.quotes where code = v_code and returns @> jsonb_build_array(jsonb_build_object('request_id', r.id))) then
      return null; -- đã ghi ở bản update-13
    end if;
    if v_new and (qs is null or qs not in ('exported','returned')) then
      raise exception 'Báo giá % chưa xuất kho (hoặc không còn), không duyệt phiếu hoàn theo báo giá được.', v_code;
    end if;
    perform public.apply_quote_return(v_code, 'rq:' || r.id, 'request', r.note, coalesce(r.reviewed_by, r.created_by),
      (select coalesce(jsonb_agg(jsonb_build_object('code', l.code, 'name', l.name, 'qty', l.qty) order by l.id), '[]'::jsonb)
         from public.request_lines l where l.request_id = r.id));
  end if;
  return null;
end $$;
drop trigger if exists trg_sync_quote_export on public.requests;
create constraint trigger trg_sync_quote_export after insert or update on public.requests
  deferrable initially deferred for each row execute function public.sync_quote_export_status();

-- Khóa báo giá đã gửi kho; cho xóa báo giá đã hoàn toàn bộ.
create or replace function public.quotes_guard() returns trigger
language plpgsql set search_path = public as $$
declare locked text[] := array['export_pending','exported','returned'];
begin
  if current_user <> 'authenticated' then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    if new.status = any(locked) or new.returned_amount <> 0 or new.returns <> '[]'::jsonb then
      raise exception 'Báo giá mới không được tạo sẵn ở trạng thái xuất kho / hoàn kho.';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status in ('export_pending','exported') then
      raise exception 'Báo giá % đang gửi/đã xuất kho, không xóa được. Hoàn kho toàn bộ (hoặc hủy dòng xuất trong Lịch sử kho) rồi mới xóa.', old.code;
    end if;
    return old;
  end if;
  if new.status is distinct from old.status and (new.status = any(locked) or old.status = any(locked)) then
    raise exception 'Trạng thái xuất / hoàn kho của báo giá % do kho cập nhật, không đổi tay được.', old.code;
  end if;
  if old.status = any(locked) and (new.total is distinct from old.total or new.payload is distinct from old.payload) then
    raise exception 'Báo giá % đã gửi/xuất kho nên đã khóa nội dung. Hàng trả lại: dùng Hoàn kho; đổi đơn: tạo báo giá mới.', old.code;
  end if;
  if new.returned_amount is distinct from old.returned_amount or new.returns is distinct from old.returns then
    raise exception 'Số tiền hoàn kho chỉ cập nhật khi kho hủy dòng xuất hoặc duyệt phiếu hoàn.';
  end if;
  return new;
end $$;

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
           from public.quotes where status in ('exported','returned') group by customer_id) s on s.customer_id = c.id
left join (select customer_id, sum(amount) paid, max(paid_at) last_paid from public.customer_payments group by customer_id) p on p.customer_id = c.id
left join (select customer_id, count(*) n from public.quotes group by customer_id) a on a.customer_id = c.id;
grant select on public.customer_balances to authenticated;

create or replace function public.quote_old_debt(p_code text, p_name text, p_phone text) returns numeric
language plpgsql stable security invoker set search_path = public as $$
declare v_id bigint := public.find_customer(p_name, p_phone);
begin
  if v_id is null then return 0; end if;
  return coalesce((select debt from public.customer_balances where id = v_id), 0)
       - coalesce((select total - returned_amount from public.quotes
                   where code = p_code and status in ('exported','returned') and customer_id = v_id), 0);
end $$;

-- Bù dữ liệu cũ: dòng xuất đã hủy và phiếu hoàn đã duyệt nhưng chưa trừ nợ.
do $$ declare m record; r record; v text; begin
  for m in select * from public.movements where kind = 'out' and voided_at is not null order by voided_at, id loop
    v := public.quote_of_movement(to_jsonb(m));
    continue when v is null;
    begin
      perform public.apply_quote_return(v, 'mv:' || m.id, 'void', 'Hủy xuất kho: ' || coalesce(m.void_reason, ''), m.voided_by,
        jsonb_build_array(jsonb_build_object('code', m.code, 'name', m.name, 'qty', m.qty)));
    exception when others then raise notice 'Bỏ qua dòng xuất % (báo giá %): %', m.id, v, sqlerrm;
    end;
  end loop;
  for r in select * from public.requests where sig like 'HK:%' and status = 'approved' order by created_at loop
    v := split_part(substr(r.sig, 4), '|', 1);
    continue when exists (select 1 from public.quotes where code = v and returns @> jsonb_build_array(jsonb_build_object('request_id', r.id)));
    begin
      perform public.apply_quote_return(v, 'rq:' || r.id, 'request', r.note, coalesce(r.reviewed_by, r.created_by),
        (select coalesce(jsonb_agg(jsonb_build_object('code', l.code, 'name', l.name, 'qty', l.qty) order by l.id), '[]'::jsonb)
           from public.request_lines l where l.request_id = r.id));
    exception when others then raise notice 'Bỏ qua phiếu hoàn % (báo giá %): %', r.id, v, sqlerrm;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- KIỂM TRA sau khi chạy: dòng xuất đã hủy KHÔNG nối được với báo giá nào (sẽ không trừ nợ).
-- Nếu có dòng thuộc báo giá mà vẫn hiện ở đây, gửi 1 dòng kết quả (cột note) để chỉnh cách nối.
-- select id, code, qty, note, voided_at from public.movements
--  where kind = 'out' and voided_at is not null and public.quote_of_movement(to_jsonb(movements.*)) is null
--  order by voided_at desc limit 20;
