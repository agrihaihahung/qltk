-- =====================================================================
-- CẬP NHẬT SUPABASE 19: LỊCH SỬ NGUỒN TIỀN (phiếu thu, phiếu chi, số dư từng nguồn)
-- Chạy SAU supabase-update-18.sql. Chạy lại nhiều lần được.
--
--  cash_funds    : danh sách nguồn tiền (Tiền mặt, Ngân hàng, ...) + số dư đầu kỳ.
--  cash_vouchers : phiếu thu / phiếu chi nhập tay (thu khác, chi nhà cung cấp, lương, vận chuyển...).
--  cash_ledger   : VIEW gộp  phiếu thu/chi  +  khoản thanh toán của khách (customer_payments),
--                  nên tiền khách trả ở trang "Khách hàng & công nợ" tự hiện thành phiếu thu,
--                  không phải nhập hai lần và không bị tính trùng.
-- Không đổi bảng/hàm cũ, không ảnh hưởng công nợ.
-- =====================================================================

-- 1. Nguồn tiền + số dư đầu kỳ
create table if not exists public.cash_funds (
  name            text primary key,
  opening_balance numeric not null default 0,
  sort_no         int     not null default 100,
  created_at      timestamptz not null default now()
);
insert into public.cash_funds (name, sort_no) values ('Tiền mặt', 1), ('Ngân hàng', 2)
on conflict (name) do nothing;

-- 2. Phiếu thu / phiếu chi
create table if not exists public.cash_vouchers (
  id           bigint generated always as identity primary key,
  voucher_no   text unique,
  kind         text not null check (kind in ('thu', 'chi')),
  voucher_date date not null default current_date,
  amount       numeric not null check (amount > 0),
  fund         text not null default 'Tiền mặt',
  category     text not null default '',
  party        text not null default '',
  note         text not null default '',
  created_by   text default (auth.jwt() ->> 'email'),
  created_at   timestamptz not null default now(),
  voided_at    timestamptz,
  voided_by    text,
  void_reason  text
);
create index if not exists cash_vouchers_date_idx on public.cash_vouchers (voucher_date desc);

-- Số phiếu tự sinh: PT/PC + yymmdd + số thứ tự toàn cục (id) -> không bao giờ trùng
create or replace function public.cash_voucher_no() returns trigger
language plpgsql as $$
begin
  if new.voucher_no is null or new.voucher_no = '' then
    new.voucher_no := case new.kind when 'thu' then 'PT' else 'PC' end
                      || to_char(new.voucher_date, 'YYMMDD') || '-' || lpad(new.id::text, 4, '0');
  end if;
  return new;
end $$;
drop trigger if exists cash_voucher_no_trg on public.cash_vouchers;
create trigger cash_voucher_no_trg before insert on public.cash_vouchers
  for each row execute function public.cash_voucher_no();

-- Hủy phiếu: ghi người hủy từ server, không cho tự khai
create or replace function public.cash_voucher_void_stamp() returns trigger
language plpgsql as $$
begin
  if new.voided_at is not null and old.voided_at is null then
    new.voided_by := auth.jwt() ->> 'email';
  end if;
  return new;
end $$;
drop trigger if exists cash_voucher_void_trg on public.cash_vouchers;
create trigger cash_voucher_void_trg before update on public.cash_vouchers
  for each row execute function public.cash_voucher_void_stamp();

-- 3. Phân quyền (cùng quy tắc như customer_payments)
--    Xem: mọi tài khoản đăng nhập (CTV bị chặn ở bước 5).  Thêm: admin / quản lý duyệt / nhân viên kho.
--    Sửa, hủy, xóa: chỉ admin / quản lý duyệt.
alter table public.cash_funds enable row level security;
drop policy if exists cf_sel on public.cash_funds;
create policy cf_sel on public.cash_funds for select to authenticated using (true);
drop policy if exists cf_ins on public.cash_funds;
create policy cf_ins on public.cash_funds for insert to authenticated with check (public.is_boss());
drop policy if exists cf_upd on public.cash_funds;
create policy cf_upd on public.cash_funds for update to authenticated using (public.is_boss()) with check (public.is_boss());
drop policy if exists cf_del on public.cash_funds;
create policy cf_del on public.cash_funds for delete to authenticated using (public.is_boss());

alter table public.cash_vouchers enable row level security;
drop policy if exists cv_sel on public.cash_vouchers;
create policy cv_sel on public.cash_vouchers for select to authenticated using (true);
drop policy if exists cv_ins on public.cash_vouchers;
create policy cv_ins on public.cash_vouchers for insert to authenticated
  with check (public.my_role() in ('admin', 'approver', 'staff') and voided_at is null);
drop policy if exists cv_upd on public.cash_vouchers;
create policy cv_upd on public.cash_vouchers for update to authenticated using (public.is_boss()) with check (public.is_boss());
drop policy if exists cv_del on public.cash_vouchers;
create policy cv_del on public.cash_vouchers for delete to authenticated using (public.is_boss());

-- 4. Sổ nguồn tiền: gộp phiếu thu/chi + thanh toán của khách
--    Thanh toán của khách: số dương = phiếu thu "Thu tiền khách hàng"; số âm = phiếu chi "Hoàn tiền khách hàng".
--    Hình thức "Chuyển khoản" được quy về nguồn "Ngân hàng"; "Tiền mặt" giữ nguyên; còn lại giữ tên gốc.
drop view if exists public.cash_ledger;
create view public.cash_ledger with (security_invoker = true) as
select 'V' || v.id::text                       as row_key,
       'voucher'::text                         as src,
       v.id                                    as src_id,
       v.voucher_no                            as voucher_no,
       v.kind                                  as kind,
       v.voucher_date                          as d,
       v.amount                                as amount,
       v.fund                                  as fund,
       v.category                              as category,
       v.party                                 as party,
       null::bigint                            as customer_id,
       null::text                              as quote_code,
       v.note                                  as note,
       v.created_by                            as created_by,
       v.created_at                            as created_at,
       v.voided_at                             as voided_at,
       v.void_reason                           as void_reason
  from public.cash_vouchers v
union all
select 'P' || p.id::text,
       'payment',
       p.id,
       'TT' || to_char(p.paid_at, 'YYMMDD') || '-' || lpad(p.id::text, 4, '0'),
       case when p.amount > 0 then 'thu' else 'chi' end,
       p.paid_at,
       abs(p.amount),
       case p.method when 'Chuyển khoản' then 'Ngân hàng' else p.method end,
       case when p.amount > 0 then 'Thu tiền khách hàng' else 'Hoàn tiền khách hàng' end,
       coalesce(c.name, ''),
       p.customer_id,
       p.quote_code,
       p.note,
       p.created_by,
       p.created_at,
       null::timestamptz,
       null::text
  from public.customer_payments p
  left join public.customers c on c.id = p.customer_id;
grant select on public.cash_ledger to authenticated;

-- 5. CTV / CTV kho không được đọc hay ghi hai bảng mới (giống các bảng nghiệp vụ khác)
do $$ declare t text; begin
  foreach t in array array['cash_funds', 'cash_vouchers'] loop
    execute format('drop policy if exists ctv_block on public.%I', t);
    execute format($p$create policy ctv_block on public.%I as restrictive for all to authenticated
                      using (public.my_role() is distinct from 'ctv')
                      with check (public.my_role() is distinct from 'ctv')$p$, t);
    execute format('drop policy if exists ctvkho_block on public.%I', t);
    execute format($p$create policy ctvkho_block on public.%I as restrictive for all to authenticated
                      using (public.my_role() is distinct from 'ctv_kho')
                      with check (public.my_role() is distinct from 'ctv_kho')$p$, t);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- =====================================================================
-- KIỂM TRA SAU KHI CHẠY (tùy chọn):
--   1) Sổ nguồn tiền có đủ dòng:
--      select src, kind, count(*), sum(amount) from public.cash_ledger where voided_at is null group by 1, 2 order by 1, 2;
--   2) Số dư từng nguồn (đầu kỳ + thu − chi):
--      select f.name, f.opening_balance
--             + coalesce(sum(case when l.kind = 'thu' then l.amount else -l.amount end), 0) as so_du
--        from public.cash_funds f
--        left join public.cash_ledger l on l.fund = f.name and l.voided_at is null
--       group by f.name, f.opening_balance order by min(f.sort_no);
-- =====================================================================
