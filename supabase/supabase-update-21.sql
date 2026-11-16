-- =====================================================================
-- CẬP NHẬT SUPABASE 21: GỘP KHO + DANH MỤC NHÔM + DANH MỤC PHỤ KIỆN VÀO MỘT BẢNG (items)
-- Chạy SAU supabase-update-19.sql. THAY THẾ update-20 (chạy rồi hay chưa đều được).
--
-- >>> TRƯỚC KHI CHẠY: vào Sao lưu dữ liệu, tải bản sao lưu đầy đủ (.json). <<<
--
-- Kết quả:
--   * Bảng DUY NHẤT `items` chứa mọi sản phẩm. Thêm các cột:
--       system        hệ nhôm / hệ phụ kiện            weight_kg   kg trên 1 thanh (nhôm)
--       grp           nhóm phụ kiện                    sale_price  ĐƠN GIÁ BÁN trên báo giá (items.price vẫn là giá nhập)
--       catalog_kind  'aluminum' | 'accessory' | 'none' (không bán qua báo giá)
--       track_stock   true = đang quản lý tồn kho; false = mã chỉ có trong báo giá (chưa nhập kho)
--       needs_review  true = dòng tự tạo, cần xem lại giá bán / hệ / kg
--       q_code, q_name, q_unit, q_color : chữ HIỂN THỊ TRÊN BÁO GIÁ nếu khác với kho (để trống = dùng như kho).
--         Dùng để báo giá in ra y như trước (VD mã "N-K55-3318", đơn vị "Thanh", tên có quy cách).
--   * catalog_aluminum và catalog_accessories trở thành VIEW đọc từ items => trang báo giá, danh mục nhôm,
--     phụ kiện chạy như cũ. Bảng cũ được ĐỔI TÊN thành *_bak (không xóa) để quay lại được.
--   * Mã thêm mới vào kho tự thuộc danh mục báo giá (nhôm hoặc phụ kiện theo "Loại"), needs_review = true.
--   * Vật tư kho cũ chưa có trong báo giá cũng được đưa vào danh mục (needs_review = true, giá bán 0).
--
-- Chạy an toàn: nếu gặp điều bất thường (xem các RAISE EXCEPTION) thì TOÀN BỘ bị hủy, dữ liệu không đổi.
-- Chạy lại nhiều lần được (lần sau bỏ qua phần chuyển dữ liệu).
-- =====================================================================
begin;

-- ---------- 0. Hàm hỗ trợ ----------
-- Chuẩn hóa mã/màu: bỏ dấu tiếng Việt, chữ thường, chỉ giữ chữ-số (giống nrm() của giao diện)
create or replace function public.norm_code(p text) returns text
language sql immutable as $$
  select regexp_replace(
           translate(lower(coalesce(p, '')),
                     'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
                     'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'),
           '[^a-z0-9]', '', 'g') $$;

-- Màu tương thích: một bên trống, hoặc chuỗi này chứa chuỗi kia (giống colorBad() của giao diện)
create or replace function public.color_ok(a text, b text) returns boolean
language sql immutable as $$
  select public.norm_code(a) = '' or public.norm_code(b) = ''
      or public.norm_code(a) like '%' || public.norm_code(b) || '%'
      or public.norm_code(b) like '%' || public.norm_code(a) || '%' $$;

-- Gỡ cơ chế update-20 (nếu đã chạy): thay bằng trigger mới ở bước 5
drop trigger  if exists items_to_catalog on public.items;
drop function if exists public.items_to_catalog_trg();
drop function if exists public.sync_item_to_catalog(public.items);
drop function if exists public.catalog_has_code(text);

-- ---------- 1. Thêm cột vào items ----------
alter table public.items add column if not exists system       text    not null default '';
alter table public.items add column if not exists grp          text    not null default '';
alter table public.items add column if not exists weight_kg    numeric not null default 0;
alter table public.items add column if not exists sale_price   numeric not null default 0;
alter table public.items add column if not exists catalog_kind text;
alter table public.items add column if not exists track_stock  boolean not null default true;
alter table public.items add column if not exists needs_review boolean not null default false;
alter table public.items add column if not exists q_code  text;
alter table public.items add column if not exists q_name  text;
alter table public.items add column if not exists q_unit  text;
alter table public.items add column if not exists q_color text;
alter table public.items drop constraint if exists items_catalog_kind_chk;
alter table public.items add constraint items_catalog_kind_chk check (catalog_kind is null or catalog_kind in ('aluminum', 'accessory', 'none'));
create index if not exists items_catalog_kind_idx on public.items (catalog_kind) where catalog_kind in ('aluminum', 'accessory');
create index if not exists items_track_idx on public.items (track_stock);

-- ---------- 2. Chuyển dữ liệu (chỉ lần đầu, khi hai bảng danh mục còn là bảng thật) ----------
do $mig$
declare
  r record; miss int; sample text; dropped boolean := false;
begin
  if coalesce((select relkind::text from pg_class where oid = to_regclass('public.catalog_aluminum')), 'x') <> 'r' then
    raise notice 'Danh mục đã được gộp trước đó: bỏ qua bước chuyển dữ liệu.';
    return;
  end if;
  alter table public.catalog_aluminum    add column if not exists needs_review boolean not null default false;
  alter table public.catalog_accessories add column if not exists needs_review boolean not null default false;
  -- tắt trigger khác của bảng items khi nạp hàng loạt (tránh sinh phiếu/nhật ký giả cho ~hàng nghìn mã chưa nhập kho)
  begin perform set_config('session_replication_role', 'replica', true); exception when others then null; end;

  -- 2a. Mã trong kho đang bị ràng buộc DUY NHẤT theo riêng cột code? Danh mục có nhiều màu trên cùng một mã,
  --     nên cần đổi thành duy nhất theo (mã, màu/hoàn thiện). Chỉ làm khi không có hàm SQL nào dùng ON CONFLICT (code).
  if exists (select 1 from pg_index i
              where i.indrelid = 'public.items'::regclass and i.indisunique and not i.indisprimary and i.indnatts = 1
                and (select attname from pg_attribute where attrelid = i.indrelid and attnum = i.indkey[0]) = 'code') then
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.prosrc ~* 'on\s+conflict\s*\(\s*code\s*\)') then
      raise exception 'Kho đang đặt duy nhất theo mã và có hàm SQL dùng ON CONFLICT (code). Chưa thể gộp tự động: hãy gửi lại cho người hỗ trợ kết quả câu: select proname from pg_proc where prosrc ~* ''on\s+conflict\s*\(\s*code'';';
    end if;
    for r in select c.conname, i.indexrelid::regclass::text as idx
               from pg_index i left join pg_constraint c on c.conindid = i.indexrelid and c.contype = 'u'
              where i.indrelid = 'public.items'::regclass and i.indisunique and not i.indisprimary and i.indnatts = 1
                and (select attname from pg_attribute where attrelid = i.indrelid and attnum = i.indkey[0]) = 'code' loop
      if r.conname is not null then execute format('alter table public.items drop constraint %I', r.conname);
      else execute 'drop index ' || r.idx; end if;
      dropped := true;
    end loop;
  end if;
  -- giữ tinh thần "không trùng": thay bằng duy nhất theo (mã, màu/hoàn thiện)
  if dropped then create unique index if not exists items_code_fin_uq on public.items (code, (coalesce(fin, ''))); end if;

  -- 2b. Ghép dòng danh mục NHÔM với vật tư kho: cùng mã (chấp nhận tiền tố "N-"), màu tương thích;
  --     mỗi vật tư chỉ nhận 1 dòng danh mục và ngược lại; ưu tiên màu trùng hẳn.
  create temp table _p_al on commit drop as
    select a.id as cid, i.id as iid, (public.norm_code(a.color) = public.norm_code(i.fin)) as ex
      from public.catalog_aluminum a join public.items i
        on (public.norm_code(i.code) = public.norm_code(a.code)
            or (a.code ~* '^n-' and public.norm_code(a.code) = 'n' || public.norm_code(i.code)))
       and public.color_ok(a.color, i.fin);
  create temp table _m_al on commit drop as
    select distinct on (cid) cid, iid from (
      select distinct on (iid) cid, iid, ex from _p_al order by iid, ex desc, cid) t
    order by cid, ex desc, iid;

  update public.items i set
         system = a.system, weight_kg = coalesce(a.weight_kg, 0), sale_price = coalesce(a.price, 0),
         catalog_kind = 'aluminum', needs_review = coalesce(a.needs_review, false),
         q_code  = case when a.code  is distinct from i.code              then a.code  end,
         q_name  = case when a.name  is distinct from i.name              then a.name  end,
         q_unit  = case when a.unit  is distinct from i.unit              then a.unit  end,
         q_color = case when a.color is distinct from coalesce(i.fin, '') then a.color end
    from _m_al m join public.catalog_aluminum a on a.id = m.cid
   where i.id = m.iid;

  -- dòng danh mục nhôm chưa có trong kho -> thành sản phẩm "chỉ có trong báo giá" (track_stock = false)
  insert into public.items (code, name, type, spec, fin, unit, qty, min_qty, price, loc,
                            system, weight_kg, sale_price, catalog_kind, track_stock, needs_review, q_unit)
  select a.code, a.name, 'Thanh định hình', '', a.color, lower(a.unit), 0, 0, 0, '',
         a.system, coalesce(a.weight_kg, 0), coalesce(a.price, 0), 'aluminum', false, coalesce(a.needs_review, false),
         case when a.unit <> lower(a.unit) then a.unit end
    from public.catalog_aluminum a
   where a.id not in (select cid from _m_al)
  on conflict do nothing;

  -- 2c. Phụ kiện: ghép theo mã
  create temp table _p_ac on commit drop as
    select c.id as cid, i.id as iid
      from public.catalog_accessories c join public.items i on public.norm_code(i.code) = public.norm_code(c.code);
  create temp table _m_ac on commit drop as
    select distinct on (cid) cid, iid from (select distinct on (iid) cid, iid from _p_ac order by iid, cid) t order by cid, iid;

  update public.items i set
         system = c.system, grp = c.grp, sale_price = coalesce(c.price, 0),
         catalog_kind = 'accessory', needs_review = coalesce(c.needs_review, false),
         q_code = case when c.code is distinct from i.code then c.code end,
         q_name = case when c.name is distinct from i.name then c.name end,
         q_unit = case when c.unit is distinct from i.unit then c.unit end
    from _m_ac m join public.catalog_accessories c on c.id = m.cid
   where i.id = m.iid;

  insert into public.items (code, name, type, spec, fin, unit, qty, min_qty, price, loc,
                            system, grp, sale_price, catalog_kind, track_stock, needs_review, q_unit)
  select c.code, c.name, 'Phụ kiện', '', '', lower(c.unit), 0, 0, 0, '',
         c.system, c.grp, coalesce(c.price, 0), 'accessory', false, coalesce(c.needs_review, false),
         case when c.unit <> lower(c.unit) then c.unit end
    from public.catalog_accessories c
   where c.id not in (select cid from _m_ac)
  on conflict do nothing;

  -- 2d. Vật tư kho chưa có dòng danh mục nào (đúng lỗi "thêm vào kho mà báo giá không có"):
  --     đưa vào danh mục theo Loại, giá bán 0, đánh dấu cần xem lại.
  update public.items set
         catalog_kind = case when type = 'Phụ kiện' then 'accessory' else 'aluminum' end,
         system = case when type = 'Phụ kiện' then system else 'Chưa phân hệ' end,
         needs_review = true
   where catalog_kind is null;

  -- 2e. KIỂM TRA: mọi dòng danh mục cũ phải còn đại diện trong items, nếu không thì HỦY TOÀN BỘ
  select count(*), string_agg(code, ', ') into miss, sample from (
    select a.code from public.catalog_aluminum a
     where not exists (select 1 from public.items i
                        where i.catalog_kind = 'aluminum'
                          and public.norm_code(coalesce(i.q_code, i.code)) = public.norm_code(a.code)
                          and public.norm_code(coalesce(i.q_color, i.fin, '')) = public.norm_code(a.color))
     limit 10) x;
  if miss > 0 then
    raise exception 'Có dòng danh mục NHÔM không chuyển được (có thể trùng mã + màu): %. Dữ liệu chưa bị đổi. Hãy gửi lại danh sách này.', sample;
  end if;
  select count(*), string_agg(code, ', ') into miss, sample from (
    select c.code from public.catalog_accessories c
     where not exists (select 1 from public.items i
                        where i.catalog_kind = 'accessory' and public.norm_code(coalesce(i.q_code, i.code)) = public.norm_code(c.code))
     limit 10) x;
  if miss > 0 then
    raise exception 'Có dòng danh mục PHỤ KIỆN không chuyển được: %. Dữ liệu chưa bị đổi. Hãy gửi lại danh sách này.', sample;
  end if;

  -- 2f. Đổi tên bảng cũ (giữ làm bản dự phòng)
  alter table public.catalog_aluminum    rename to catalog_aluminum_bak;
  alter table public.catalog_accessories rename to catalog_accessories_bak;
  begin perform set_config('session_replication_role', 'origin', true); exception when others then null; end;
end $mig$;

-- ---------- 3. Hai VIEW giữ nguyên tên + cột cũ để trang báo giá chạy như trước ----------
-- (nếu bước 2 bị bỏ qua vì đã gộp từ trước, view được tạo lại cho khớp)
drop view if exists public.catalog_aluminum;
create view public.catalog_aluminum with (security_invoker = true) as
select id, system,
       coalesce(nullif(q_code, ''), code)                              as code,
       coalesce(nullif(q_name, ''), name)                              as name,
       coalesce(nullif(q_unit, ''), nullif(unit, ''), 'Thanh')         as unit,
       coalesce(nullif(q_color, ''), fin, '')                          as color,
       weight_kg, sale_price as price, needs_review
  from public.items where catalog_kind = 'aluminum';

drop view if exists public.catalog_accessories;
create view public.catalog_accessories with (security_invoker = true) as
select id, system,
       coalesce(nullif(q_code, ''), code)                              as code,
       coalesce(nullif(q_name, ''), name)                              as name,
       coalesce(nullif(q_unit, ''), nullif(unit, ''), 'Cái')           as unit,
       grp, sale_price as price, needs_review
  from public.items where catalog_kind = 'accessory';

grant select on public.catalog_aluminum, public.catalog_accessories to authenticated;

-- ---------- 4. Mã thêm mới vào kho tự thuộc danh mục báo giá ----------
create or replace function public.items_defaults_trg() returns trigger
language plpgsql as $$
begin
  if new.catalog_kind is null then
    new.catalog_kind := case when new.type = 'Phụ kiện' then 'accessory' else 'aluminum' end;
    new.needs_review := true;
    if new.catalog_kind = 'aluminum' and coalesce(new.system, '') = '' then new.system := 'Chưa phân hệ'; end if;
  end if;
  return new;
end $$;
drop trigger if exists items_defaults on public.items;
create trigger items_defaults before insert on public.items
  for each row execute function public.items_defaults_trg();

notify pgrst, 'reload schema';
commit;

-- =====================================================================
-- KIỂM TRA SAU KHI CHẠY (chạy tay, tùy chọn):
--  1) Số dòng danh mục trước / sau (phải bằng nhau, trừ dòng trùng hệt nhau):
--       select (select count(*) from public.catalog_aluminum_bak) as nhom_cu, (select count(*) from public.catalog_aluminum) as nhom_moi,
--              (select count(*) from public.catalog_accessories_bak) as pk_cu,  (select count(*) from public.catalog_accessories) as pk_moi;
--  2) Sản phẩm đang quản lý tồn kho / chỉ có trong báo giá / cần xem lại:
--       select track_stock, catalog_kind, needs_review, count(*) from public.items group by 1, 2, 3 order by 1 desc, 2, 3;
--  3) Khi đã dùng ổn vài ngày, xóa bảng dự phòng:
--       -- drop table public.catalog_aluminum_bak, public.catalog_accessories_bak;
-- QUAY LẠI (nếu cần): xóa 2 view, đổi tên *_bak về tên cũ:
--       -- drop view public.catalog_aluminum, public.catalog_accessories;
--       -- alter table public.catalog_aluminum_bak rename to catalog_aluminum;
--       -- alter table public.catalog_accessories_bak rename to catalog_accessories;
-- =====================================================================
