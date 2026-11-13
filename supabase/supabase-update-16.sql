-- =====================================================================
-- CẬP NHẬT SUPABASE 16: vai trò CTV KHO (chỉ xem Tồn kho)
-- Chạy SAU supabase-update-15.sql. Chạy lại nhiều lần được.
--
-- Vai trò mới:  ctv_kho = Cộng tác viên kho.
--   * Chỉ ĐỌC được 3 bảng của trang Tồn kho: items, offcuts, item_units.
--   * KHÔNG ghi được bất kỳ bảng nào (nhập, xuất, sửa, xóa, quy đổi đơn vị...).
--   * KHÔNG đọc/ghi được các bảng khác: báo giá, khách hàng, công nợ, phiếu, lịch sử, CSKH...
--
-- Lưu ý: nếu thêm bảng mới sau này, chạy lại file này để bảng mới cũng bị chặn với ctv_kho.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cho phép giá trị vai trò 'ctv_kho' trong user_roles
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
    select format('%I.%I', n.nspname, t.typname) into v_type
      from pg_attribute a
      join pg_type t on t.oid = a.atttypid
      join pg_namespace n on n.oid = t.typnamespace
     where a.attrelid = 'public.user_roles'::regclass and a.attname = 'role';
    execute format('alter type %s add value if not exists %L', v_type, 'ctv_kho');
  else
    for r in select conname from pg_constraint
              where conrelid = 'public.user_roles'::regclass and contype = 'c'
                and pg_get_constraintdef(oid) ilike '%role%' loop
      execute format('alter table public.user_roles drop constraint %I', r.conname);
    end loop;
    alter table public.user_roles add constraint user_roles_role_check
      check (role in ('admin','approver','staff','viewer','ctv','ctv_kho'));
  end if;
end $$;

-- Quản trị đổi vai trò người dùng (bản có hỗ trợ 'ctv_kho')
drop function if exists public.set_user_role(uuid, text);
create function public.set_user_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'Chỉ quản trị mới đổi được quyền'; end if;
  if p_role not in ('admin','approver','staff','viewer','ctv','ctv_kho') then raise exception 'Vai trò không hợp lệ'; end if;
  update public.user_roles set role = p_role where user_id = p_user;
  if not found then raise exception 'Không tìm thấy người dùng'; end if;
end $$;
revoke all on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Chặn ctv_kho ở tầng database (policy "restrictive" được AND với policy sẵn có)
--    (a) Bảng Tồn kho (items, offcuts, item_units): cho ĐỌC, chặn ghi.
--    (b) Mọi bảng khác (trừ user_roles để my_role() hoạt động): chặn cả đọc lẫn ghi.
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables
            where schemaname = 'public' and tablename in ('items', 'offcuts', 'item_units') loop
    execute format('drop policy if exists ctvkho_block on public.%I', t.tablename);
    execute format('drop policy if exists ctvkho_no_ins on public.%I', t.tablename);
    execute format('drop policy if exists ctvkho_no_upd on public.%I', t.tablename);
    execute format('drop policy if exists ctvkho_no_del on public.%I', t.tablename);
    execute format($p$create policy ctvkho_no_ins on public.%I as restrictive for insert to authenticated
                      with check (public.my_role() is distinct from 'ctv_kho')$p$, t.tablename);
    execute format($p$create policy ctvkho_no_upd on public.%I as restrictive for update to authenticated
                      using (public.my_role() is distinct from 'ctv_kho')
                      with check (public.my_role() is distinct from 'ctv_kho')$p$, t.tablename);
    execute format($p$create policy ctvkho_no_del on public.%I as restrictive for delete to authenticated
                      using (public.my_role() is distinct from 'ctv_kho')$p$, t.tablename);
  end loop;

  for t in select tablename from pg_tables
            where schemaname = 'public'
              and tablename not in ('user_roles', 'items', 'offcuts', 'item_units') loop
    execute format('drop policy if exists ctvkho_block on public.%I', t.tablename);
    execute format($p$create policy ctvkho_block on public.%I as restrictive for all to authenticated
                      using (public.my_role() is distinct from 'ctv_kho')
                      with check (public.my_role() is distinct from 'ctv_kho')$p$, t.tablename);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- =====================================================================
-- KIỂM TRA SAU KHI CHẠY (nên làm 1 lần)
--  a) Hàm security definer chạy bằng quyền chủ sở hữu nên KHÔNG bị policy ở trên chặn.
--     Liệt kê hàm KHÔNG tự kiểm tra vai trò (my_role / is_boss) để rà lại:
--       select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--        where n.nspname = 'public' and p.prosecdef
--          and p.prosrc !~* '(my_role|is_boss)'
--        order by 1;
--     Hàm nào GHI dữ liệu mà không có kiểm tra vai trò thì ctv_kho vẫn gọi được qua API:
--     thêm dòng  if public.my_role() = 'ctv_kho' then raise exception 'Bạn không có quyền'; end if;
--  b) View: view mặc định chạy bằng quyền chủ sở hữu. View nào đọc bảng nghiệp vụ mà chưa có
--     security_invoker = true thì ctv_kho vẫn đọc được:
--       select viewname from pg_views where schemaname = 'public';
--       alter view public.<tên> set (security_invoker = true);
--  c) Thử bằng tài khoản ctv_kho: đọc items → được; insert/update/delete items → lỗi RLS;
--     đọc quotes, customers, requests → trả về 0 dòng hoặc lỗi.
-- =====================================================================
