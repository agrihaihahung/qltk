-- =====================================================================
-- CẬP NHẬT SUPABASE 11: "Đặc điểm tương thích" của từng khách hàng (trang CSKH)
-- Chạy SAU supabase-update-10.sql. Chạy lại nhiều lần được.
-- Admin tóm gọn đặc điểm khách qua nhiều lần tương tác; CTV và các vai trò khác chỉ xem.
-- =====================================================================
create table if not exists public.crm_profiles (
  customer_id bigint primary key references public.customers(id) on delete cascade,
  content     text not null default '',
  updated_at  timestamptz not null default now(),
  updated_by  text not null default ''
);

create or replace function public.crm_profiles_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.content    := coalesce(trim(new.content), '');
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', '');
  return new;
end $$;
drop trigger if exists trg_crm_profiles_stamp on public.crm_profiles;
create trigger trg_crm_profiles_stamp before insert or update on public.crm_profiles
  for each row execute function public.crm_profiles_stamp();

alter table public.crm_profiles enable row level security;
drop policy if exists crmp_sel on public.crm_profiles;
create policy crmp_sel on public.crm_profiles for select to authenticated
  using (public.my_role() in ('admin','approver','staff','viewer','ctv'));
drop policy if exists crmp_ins on public.crm_profiles;
create policy crmp_ins on public.crm_profiles for insert to authenticated
  with check (public.my_role() = 'admin');
drop policy if exists crmp_upd on public.crm_profiles;
create policy crmp_upd on public.crm_profiles for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
drop policy if exists crmp_del on public.crm_profiles;
create policy crmp_del on public.crm_profiles for delete to authenticated
  using (public.my_role() = 'admin');

-- Bảng này phải để CTV đọc được: gỡ chặn ctv_block nếu có (update-10 chạy lại sau này đã loại trừ bảng này)
drop policy if exists ctv_block on public.crm_profiles;
notify pgrst, 'reload schema';
