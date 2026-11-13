-- =====================================================================
-- CẬP NHẬT SUPABASE 6: lưu lịch sử báo giá trên Supabase (thay localStorage)
-- Chạy SAU supabase-update-5.sql. Chạy lại nhiều lần được.
-- Xem: mọi tài khoản đăng nhập. Tạo/sửa: admin, quản lý duyệt, nhân viên. Xóa: admin, quản lý duyệt.
-- =====================================================================
create table if not exists public.quotes (
  code text primary key,
  customer_name text not null default '',
  customer_phone text not null default '',
  total numeric not null default 0,
  payload jsonb not null,
  created_by text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quotes_updated_idx on public.quotes (updated_at desc);
alter table public.quotes enable row level security;

drop policy if exists quotes_select on public.quotes;
create policy quotes_select on public.quotes for select to authenticated using (true);
drop policy if exists quotes_insert on public.quotes;
create policy quotes_insert on public.quotes for insert to authenticated
  with check (public.my_role() in ('admin','approver','staff'));
drop policy if exists quotes_update on public.quotes;
create policy quotes_update on public.quotes for update to authenticated
  using (public.my_role() in ('admin','approver','staff'))
  with check (public.my_role() in ('admin','approver','staff'));
drop policy if exists quotes_delete on public.quotes;
create policy quotes_delete on public.quotes for delete to authenticated using (public.is_boss());
notify pgrst, 'reload schema';
