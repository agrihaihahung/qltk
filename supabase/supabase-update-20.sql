-- >>> ĐÃ ĐƯỢC THAY THẾ bởi supabase-update-21.sql (gộp kho + danh mục vào một bảng). Không cần chạy file này. <<<
-- =====================================================================
-- CẬP NHẬT SUPABASE 20: mã mới thêm vào KHO tự có trong danh mục BÁO GIÁ
-- Chạy SAU supabase-update-19.sql. Chạy lại nhiều lần được.
--
-- Nguyên nhân lỗi: kho (items), danh mục nhôm (catalog_aluminum) và danh mục phụ kiện
-- (catalog_accessories) là 3 bảng riêng, chỉ khớp nhau theo MÃ. Thêm mã vào kho thì báo giá không biết.
--
-- Cách sửa: khi thêm vật tư vào kho (hoặc đổi mã/loại), nếu danh mục báo giá CHƯA có mã đó thì database
-- tự tạo một dòng ở danh mục tương ứng:
--    loại "Phụ kiện"                          -> catalog_accessories
--    Thanh định hình / Tấm / Cuộn / Ống nhôm  -> catalog_aluminum
-- Dòng tự tạo có needs_review = true và ĐƠN GIÁ BÁN = 0, KG/THANH = 0 (kho chỉ có giá nhập, không
-- được tự coi là giá bán). Hệ nhôm ghi "Chưa phân hệ" để lọc ra bổ sung. Điền giá bán / kg ở Table Editor
-- rồi tắt needs_review. Không bao giờ ghi đè dòng danh mục đã có.
-- Cách so khớp mã giống trang báo giá: bỏ ký tự lạ, không phân biệt hoa thường; nhôm chấp nhận tiền tố "N-".
-- =====================================================================

alter table public.catalog_aluminum   add column if not exists needs_review boolean not null default false;
alter table public.catalog_accessories add column if not exists needs_review boolean not null default false;

create or replace function public.norm_code(p text) returns text
language sql immutable as $$ select lower(regexp_replace(coalesce(p, ''), '[^a-zA-Z0-9]', '', 'g')) $$;

-- Mã này đã có trong danh mục báo giá chưa? (nhôm hoặc phụ kiện)
create or replace function public.catalog_has_code(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.catalog_aluminum a
                  where public.norm_code(a.code) = public.norm_code(p)
                     or (a.code ~* '^n-' and public.norm_code(a.code) = 'n' || public.norm_code(p)))
      or exists (select 1 from public.catalog_accessories c
                  where public.norm_code(c.code) = public.norm_code(p));
$$;

-- Tạo dòng danh mục cho 1 vật tư kho (dùng cho trigger và cho bước bù dữ liệu cũ)
create or replace function public.sync_item_to_catalog(p_item public.items) returns void
language plpgsql security definer set search_path = public as $$
declare v_unit text;
begin
  if coalesce(trim(p_item.code), '') = '' or public.catalog_has_code(p_item.code) then return; end if;
  if p_item.type = 'Phụ kiện' then
    insert into public.catalog_accessories (system, code, name, unit, grp, price, needs_review)
    values ('', p_item.code, coalesce(nullif(p_item.name, ''), p_item.code),
            coalesce(nullif(p_item.unit, ''), 'Cái'), '', 0, true);
  else
    v_unit := case when lower(coalesce(p_item.unit, '')) in ('cây', 'cay', '') then 'Thanh' else p_item.unit end;
    insert into public.catalog_aluminum (system, code, name, unit, color, weight_kg, price, needs_review)
    values ('Chưa phân hệ', p_item.code, coalesce(nullif(p_item.name, ''), p_item.code),
            v_unit, coalesce(p_item.fin, ''), 0, 0, true);
  end if;
end $$;
revoke all on function public.sync_item_to_catalog(public.items) from public, anon;

create or replace function public.items_to_catalog_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_item_to_catalog(new);
  return new;
end $$;
drop trigger if exists items_to_catalog on public.items;
create trigger items_to_catalog after insert or update of code, type on public.items
  for each row execute function public.items_to_catalog_trg();

notify pgrst, 'reload schema';

-- =====================================================================
-- BƯỚC BÙ DỮ LIỆU CŨ (chạy TAY, từng câu, sau khi đã xem kết quả):
--
-- 1) Xem vật tư kho nào chưa có trong danh mục báo giá:
--      select i.code, i.name, i.type, i.fin, i.unit
--        from public.items i
--       where not public.catalog_has_code(i.code)
--       order by i.code;
--    Nếu danh sách DÀI và nhìn thấy nhiều mã thực ra đã có trong báo giá dưới tên khác (khác tiền tố,
--    khác cách đặt mã) thì ĐỪNG bù hàng loạt, vì sẽ tạo dòng trùng. Gửi danh sách này để đối chiếu mã.
--
-- 2) Nếu danh sách đúng là mã còn thiếu, bù một lần:
--      select public.sync_item_to_catalog(i) from public.items i;
--
-- 3) Xem các dòng cần bổ sung giá bán / kg:
--      select 'nhom' as loai, code, name, color from public.catalog_aluminum    where needs_review
--      union all
--      select 'phu kien', code, name, '' from public.catalog_accessories where needs_review;
--    Sau khi điền xong:  update public.catalog_aluminum set needs_review = false where id = ...;
-- =====================================================================
