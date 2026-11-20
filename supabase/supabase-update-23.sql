-- =====================================================================
-- CẬP NHẬT SUPABASE 23: ĐƠN ĐẶT HÀNG (lưu lịch sử đơn gửi nhà cung cấp)
-- Chạy SAU supabase-update-22.sql. Chạy lại nhiều lần được.
--  purchase_orders : mỗi đơn = một nhà cung cấp; các dòng hàng lưu trong cột lines (jsonb).
--  Trạng thái: ordered (Đã đặt) / received (Đã nhận hàng) / cancelled (Đã hủy).
--  Số đơn tự sinh: DH + yymmdd + số thứ tự (id).
--  Không đổi bảng cũ, không tự cộng tồn kho khi bấm "Đã nhận hàng".
-- =====================================================================
create table if not exists public.purchase_orders (
  id            bigint generated always as identity primary key,
  po_no         text unique,
  supplier_id   text,
  supplier_name text not null default '',
  supplier_phone text not null default '',
  order_date    date not null default current_date,
  expected_date date,
  deliver_to    text not null default '',
  note          text not null default '',
  status        text not null default 'ordered' check (status in ('ordered', 'received', 'cancelled')),
  lines         jsonb not null default '[]'::jsonb,
  total         numeric not null default 0,
  created_by    text default (auth.jwt() ->> 'email'),
  created_at    timestamptz not null default now()
);
create index if not exists purchase_orders_date_idx on public.purchase_orders (order_date desc, id desc);

create or replace function public.purchase_order_no() returns trigger
language plpgsql as $$
begin
  if new.po_no is null or new.po_no = '' then
    new.po_no := 'DH' || to_char(new.order_date, 'YYMMDD') || '-' || lpad(new.id::text, 4, '0');
  end if;
  return new;
end $$;
drop trigger if exists purchase_order_no_trg on public.purchase_orders;
create trigger purchase_order_no_trg before insert on public.purchase_orders
  for each row execute function public.purchase_order_no();

alter table public.purchase_orders enable row level security;
drop policy if exists po_sel on public.purchase_orders;
create policy po_sel on public.purchase_orders for select to authenticated using (true);
drop policy if exists po_ins on public.purchase_orders;
create policy po_ins on public.purchase_orders for insert to authenticated
  with check (public.my_role() in ('admin', 'approver', 'staff'));
drop policy if exists po_upd on public.purchase_orders;
create policy po_upd on public.purchase_orders for update to authenticated
  using (public.my_role() in ('admin', 'approver', 'staff')) with check (public.my_role() in ('admin', 'approver', 'staff'));
drop policy if exists po_del on public.purchase_orders;
create policy po_del on public.purchase_orders for delete to authenticated using (public.is_boss());

do $$ declare t text := 'purchase_orders'; begin
  execute format('drop policy if exists ctv_block on public.%I', t);
  execute format($p$create policy ctv_block on public.%I as restrictive for all to authenticated
                    using (public.my_role() is distinct from 'ctv')
                    with check (public.my_role() is distinct from 'ctv')$p$, t);
  execute format('drop policy if exists ctvkho_block on public.%I', t);
  execute format($p$create policy ctvkho_block on public.%I as restrictive for all to authenticated
                    using (public.my_role() is distinct from 'ctv_kho')
                    with check (public.my_role() is distinct from 'ctv_kho')$p$, t);
end $$;

notify pgrst, 'reload schema';
