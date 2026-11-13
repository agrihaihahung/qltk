-- =====================================================================
-- CẬP NHẬT SUPABASE 5: Hủy phiếu nhập (trừ lại tồn) + cho quản lý duyệt được xóa lịch sử
-- Chạy SAU supabase-update-4.sql. Chạy lại nhiều lần được.
-- =====================================================================

-- Hủy các dòng nhập: trừ lại tồn, giữ dòng cũ trong lịch sử (gạch ngang) kèm lý do.
-- Báo lỗi nếu tồn hiện tại không đủ để trừ (hàng đã xuất bớt).
create or replace function public.void_in_movements(p_ids text[], p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare m record; n int := 0; cur numeric;
begin
  if not public.is_boss() then raise exception 'Bạn không có quyền hủy phiếu nhập'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Cần nhập lý do hủy'; end if;
  for m in select * from public.movements
           where id::text = any(p_ids) and kind = 'in' and voided_at is null
             and coalesce(note, '') not like '[%'
           order by id for update loop
    select qty into cur from public.items where id = m.item_id for update;
    if cur is null then raise exception 'Không tìm thấy mã % trong kho', m.code; end if;
    if cur < m.qty then
      raise exception 'Không thể hủy: mã % chỉ còn tồn % (đã nhập %), hàng có thể đã xuất', m.code, cur, m.qty;
    end if;
    update public.items set qty = qty - m.qty where id = m.item_id;
    update public.movements set voided_at = now(), voided_by = auth.jwt() ->> 'email', void_reason = trim(p_reason)
    where id = m.id;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Không có dòng nhập nào để hủy'; end if;
  return n;
end $$;

-- Quản lý duyệt + quản trị được xóa lịch sử
create or replace function public.delete_history(p_ids text[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_boss() then raise exception 'Bạn không có quyền xóa lịch sử'; end if;
  delete from public.movements where id::text = any(p_ids);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.delete_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_boss() then raise exception 'Bạn không có quyền xóa phiếu'; end if;
  delete from public.requests where id = p_id and status <> 'approved';
  if not found then raise exception 'Không xóa được phiếu này'; end if;
end $$;

drop policy if exists mv_admin_delete on public.movements;
create policy mv_admin_delete on public.movements as restrictive for delete to authenticated
  using (public.is_boss());

revoke all on function public.void_in_movements(text[], text) from public, anon;
grant execute on function public.void_in_movements(text[], text) to authenticated;
notify pgrst, 'reload schema';
