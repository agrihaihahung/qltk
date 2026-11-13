-- =====================================================================
-- CẬP NHẬT SUPABASE 10: CSKH (chăm sóc khách hàng / telesale) + vai trò CTV
-- Chạy SAU supabase-update-9.sql. Chạy lại nhiều lần được.
--
-- Vai trò mới:  ctv = Cộng tác viên (thấp nhất).
--   * Chỉ dùng được CSKH: xem danh sách khách (tên, SĐT, địa chỉ, người liên hệ),
--     ghi nhận tương tác, đặt nhắc hẹn, thêm khách mới.
--   * KHÔNG đọc/ghi được kho, báo giá, công nợ, danh mục, phiếu... (bị chặn ở database).
--
-- Quyền CSKH theo vai trò:
--   admin / approver : xem tất cả, ghi, xóa bất kỳ bản ghi
--   staff / ctv      : xem tất cả, ghi, xóa bản ghi CỦA MÌNH trong 24 giờ đầu
--   viewer           : chỉ xem
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cho phép giá trị vai trò 'ctv' trong user_roles
-- ---------------------------------------------------------------------
do $$
declare r record; v_type text;
begin
  select data_type into v_type from information_schema.columns
   where table_schema = 'public' and table_name = 'user_roles' and column_name = 'role';
  if v_type is null then
    raise exception 'Không thấy bảng public.user_roles (cột role). Hãy chạy các bản cập nhật trước.';
  end if;
  if v_type = 'USER-DEFINED' then
    -- cột role dùng kiểu enum: thêm giá trị mới
    select format('%I.%I', n.nspname, t.typname) into v_type
      from pg_attribute a
      join pg_type t on t.oid = a.atttypid
      join pg_namespace n on n.oid = t.typnamespace
     where a.attrelid = 'public.user_roles'::regclass and a.attname = 'role';
    execute format('alter type %s add value if not exists %L', v_type, 'ctv');
  else
    -- cột role là text: thay ràng buộc check cũ bằng ràng buộc có 'ctv'
    for r in select conname from pg_constraint
              where conrelid = 'public.user_roles'::regclass and contype = 'c'
                and pg_get_constraintdef(oid) ilike '%role%' loop
      execute format('alter table public.user_roles drop constraint %I', r.conname);
    end loop;
    alter table public.user_roles add constraint user_roles_role_check
      check (role in ('admin','approver','staff','viewer','ctv'));
  end if;
end $$;

-- Quản trị đổi vai trò người dùng (bản có hỗ trợ 'ctv')
drop function if exists public.set_user_role(uuid, text);
create function public.set_user_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'Chỉ quản trị mới đổi được quyền'; end if;
  if p_role not in ('admin','approver','staff','viewer','ctv') then raise exception 'Vai trò không hợp lệ'; end if;
  update public.user_roles set role = p_role where user_id = p_user;
  if not found then raise exception 'Không tìm thấy người dùng'; end if;
end $$;
revoke all on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Bảng nhật ký tương tác CSKH
-- ---------------------------------------------------------------------
create table if not exists public.crm_interactions (
  id               bigint generated always as identity primary key,
  customer_id      bigint not null references public.customers(id) on delete cascade,
  contacted_at     timestamptz not null default now(),          -- thời điểm tương tác
  channel          text not null default 'call',                -- kênh liên hệ
  reached          boolean not null default false,              -- liên hệ được không
  result           text not null default 'no_answer',           -- kết quả
  signal           text not null default 'none',                -- tín hiệu mua hàng
  note             text not null default '',                    -- nội dung trao đổi
  follow_up_days   int,                                         -- hẹn chăm sóc lại sau N ngày
  next_follow_up   date,                                        -- ngày hẹn (tự tính)
  follow_up_done   boolean not null default false,              -- nhắc hẹn đã xử lý
  user_id          uuid not null default auth.uid(),            -- ai chăm sóc (tự gán, không tin client)
  user_email       text not null default coalesce(auth.jwt() ->> 'email', ''),
  created_at       timestamptz not null default now(),
  constraint crm_channel_chk  check (channel in ('call','zalo','sms','visit','email','other')),
  constraint crm_result_chk   check (result in ('no_answer','busy','unreachable','wrong_number','talked','quoted','ordered','declined','callback')),
  constraint crm_signal_chk   check (signal in ('hot','warm','cold','none')),
  constraint crm_days_chk     check (follow_up_days is null or follow_up_days between 0 and 365)
);
create index if not exists crm_int_customer_idx on public.crm_interactions (customer_id, contacted_at desc);
create index if not exists crm_int_follow_idx   on public.crm_interactions (next_follow_up) where not follow_up_done and next_follow_up is not null;
create index if not exists crm_int_user_idx     on public.crm_interactions (user_id, contacted_at desc);

-- Trước khi ghi: luôn gán người ghi từ phiên đăng nhập, tính ngày hẹn
create or replace function public.crm_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id    := auth.uid();
  new.user_email := coalesce(auth.jwt() ->> 'email', '');
  new.note       := coalesce(trim(new.note), '');
  if new.follow_up_days is not null and new.follow_up_days >= 0 then
    new.next_follow_up := ((new.contacted_at at time zone 'Asia/Ho_Chi_Minh')::date) + new.follow_up_days;
  else
    new.follow_up_days := null;
    new.next_follow_up := null;
  end if;
  new.follow_up_done := false;
  return new;
end $$;

-- Sau khi ghi: các nhắc hẹn cũ của khách này coi như đã xử lý
create or replace function public.crm_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.crm_interactions
     set follow_up_done = true
   where customer_id = new.customer_id and id <> new.id
     and next_follow_up is not null and not follow_up_done;
  return new;
end $$;

drop trigger if exists trg_crm_before_insert on public.crm_interactions;
create trigger trg_crm_before_insert before insert on public.crm_interactions
  for each row execute function public.crm_before_insert();
drop trigger if exists trg_crm_after_insert on public.crm_interactions;
create trigger trg_crm_after_insert after insert on public.crm_interactions
  for each row execute function public.crm_after_insert();

alter table public.crm_interactions enable row level security;
drop policy if exists crm_sel on public.crm_interactions;
create policy crm_sel on public.crm_interactions for select to authenticated
  using (public.my_role() in ('admin','approver','staff','viewer','ctv'));
drop policy if exists crm_ins on public.crm_interactions;
create policy crm_ins on public.crm_interactions for insert to authenticated
  with check (public.my_role() in ('admin','approver','staff','ctv'));
drop policy if exists crm_upd on public.crm_interactions;
create policy crm_upd on public.crm_interactions for update to authenticated
  using (public.is_boss()) with check (public.is_boss());
drop policy if exists crm_del on public.crm_interactions;
create policy crm_del on public.crm_interactions for delete to authenticated
  using (public.is_boss()
         or (user_id = auth.uid() and created_at > now() - interval '24 hours'
             and public.my_role() in ('staff','ctv')));

-- ---------------------------------------------------------------------
-- 3. Danh sách khách cho CSKH (KHÔNG có công nợ, giá, doanh số)
--    View chạy bằng quyền chủ sở hữu để CTV đọc được mà không cần đọc bảng customers.
-- ---------------------------------------------------------------------
drop view if exists public.crm_customer_list;
create view public.crm_customer_list with (security_invoker = false) as
select c.id, c.code, c.name, c.phone, c.contact, c.address, c.note,
       coalesce(n.cnt, 0) as n_contacts,
       l.last_at, l.last_by, l.last_result, l.last_signal, l.last_reached,
       f.next_follow_up, f.follow_by
from public.customers c
left join (select customer_id, count(*) cnt from public.crm_interactions group by customer_id) n on n.customer_id = c.id
left join (select distinct on (customer_id) customer_id,
                  contacted_at as last_at, user_email as last_by, result as last_result,
                  signal as last_signal, reached as last_reached
             from public.crm_interactions
            order by customer_id, contacted_at desc, id desc) l on l.customer_id = c.id
left join (select distinct on (customer_id) customer_id, next_follow_up, user_email as follow_by
             from public.crm_interactions
            where next_follow_up is not null and not follow_up_done
            order by customer_id, next_follow_up, id) f on f.customer_id = c.id
where public.my_role() in ('admin','approver','staff','viewer','ctv');
revoke all on public.crm_customer_list from public, anon;
grant select on public.crm_customer_list to authenticated;

-- Thêm khách mới từ CSKH (CTV không được ghi thẳng vào bảng customers)
create or replace function public.crm_add_customer(p_name text, p_phone text, p_contact text, p_address text, p_note text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_digits text; v_dup text;
begin
  if public.my_role() not in ('admin','approver','staff','ctv') then raise exception 'Bạn không có quyền thêm khách hàng'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Cần nhập tên khách hàng'; end if;
  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_digits) >= 9 then
    select name into v_dup from public.customers
     where regexp_replace(phone, '\D', '', 'g') like '%' || v_digits || '%' limit 1;
    if v_dup is not null then raise exception 'Số điện thoại này đã có trong danh sách: %', v_dup; end if;
  end if;
  insert into public.customers (name, phone, contact, address, note)
  values (trim(p_name), coalesce(trim(p_phone), ''), coalesce(trim(p_contact), ''), coalesce(trim(p_address), ''), coalesce(trim(p_note), ''))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.crm_add_customer(text, text, text, text, text) from public, anon;
grant execute on function public.crm_add_customer(text, text, text, text, text) to authenticated;

-- Bỏ nhắc hẹn (khách không cần chăm sóc nữa / đã xử lý ngoài hệ thống)
create or replace function public.crm_dismiss_followup(p_customer bigint) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if public.my_role() not in ('admin','approver','staff','ctv') then raise exception 'Bạn không có quyền'; end if;
  update public.crm_interactions set follow_up_done = true
   where customer_id = p_customer and next_follow_up is not null and not follow_up_done;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.crm_dismiss_followup(bigint) from public, anon;
grant execute on function public.crm_dismiss_followup(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 4. CHẶN CTV ở tầng database: mọi bảng nghiệp vụ khác đều từ chối vai trò ctv
--    (policy "restrictive" được AND với policy sẵn có nên không phải sửa từng bảng).
--    Loại trừ: user_roles (để my_role() hoạt động) và các bảng CSKH (crm_interactions, crm_profiles).
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables
            where schemaname = 'public' and tablename not in ('user_roles', 'crm_interactions', 'crm_profiles') loop
    execute format('drop policy if exists ctv_block on public.%I', t.tablename);
    execute format($p$create policy ctv_block on public.%I as restrictive for all to authenticated
                      using (public.my_role() is distinct from 'ctv')
                      with check (public.my_role() is distinct from 'ctv')$p$, t.tablename);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- =====================================================================
-- KIỂM TRA SAU KHI CHẠY (tùy chọn, chạy riêng từng câu):
--  a) Các view/hàm có thể vẫn để CTV đọc dữ liệu kho/báo giá ngoài ý muốn:
--     select viewname from pg_views where schemaname='public' and viewname <> 'crm_customer_list';
--     (view mặc định chạy bằng quyền chủ sở hữu; nếu view nào KHÔNG có security_invoker = true
--      thì thêm:  alter view public.<tên> set (security_invoker = true);)
--  b) Hàm security definer của các bản cũ có tự kiểm tra vai trò không:
--     select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--      where n.nspname='public' and prosecdef;
--     Hàm nào ghi dữ liệu mà không gọi my_role()/is_boss() thì CTV vẫn gọi được qua API.
-- =====================================================================
