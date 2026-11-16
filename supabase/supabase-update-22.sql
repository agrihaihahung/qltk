-- =====================================================================
-- CẬP NHẬT SUPABASE 22: THÊM DANH MỤC NHÔM HÃNG TRƯỜNG THÀNH (71 mã)
-- Chạy SAU supabase-update-21.sql. Chạy lại nhiều lần được (mã đã có thì bỏ qua, không ghi đè).
-- Nguồn: file trường_thành.xlsx, sheet "Bảo vệ trang tính2" (hệ, mã, tên, kg/thanh, giá), đối chiếu sheet 1.
--
--   * Thêm cột items.brand (hãng) để lọc theo hãng ở trang Danh mục sản phẩm. Các dòng cũ để trống.
--   * 4 hệ theo độ dày: TTLY2_ = 1.2mm (25 mã), TTLY4_ = 1.4mm (32 mã), TTLY8_ = 1.8mm (3 mã), TT2LY_ = 2.0mm (11 mã).
--   * Đơn giá 125.000 đ/kg (báo giá tính  số lượng × kg/thanh × đơn giá).
--   * Là sản phẩm "chỉ có trong báo giá" (track_stock = false). Khi nhập kho đúng mã này
--     (VD TTLY2_CC3328) hệ thống tự bật quản lý tồn kho cho dòng đó, không tạo trùng.
--   * Dòng cần xác nhận được đánh dấu needs_review (lọc "Cần xem lại" ở trang Danh mục sản phẩm):
--       TTLY4_CC3313  file ghi 2 trọng lượng 5,5 và 5,3 -> đã lấy 5,5 (hệ 1.2mm là 5,3 nên 1.4mm phải nặng hơn)
--       TTLY4_D2618   sheet 1 có 2 dòng D2618 (6,4 "đố cố định cho vách kính" và 6,7 "khung fix vách kính") -> lấy 6,4 theo sheet giá
-- =====================================================================
begin;
alter table public.items add column if not exists brand text not null default '';

with v(system, code, name, weight_kg, price, thick, review) as (values
  ('TTLY2_', 'TTLY2_CC3328', 'Khung cửa đi mở quay', 5.2, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_CC3303', 'Cánh cửa đi mở ngoài', 6.35, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_CC3332', 'Cánh cửa đi mở trong', 6.35, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_CC3304', 'Đố ngang dưới cửa đi', 8.6, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_CC3318', 'Khung bao sổ', 4.7, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_CC3202', 'Cánh cửa sổ hệ 55 gân', 5.8, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_CC3209', 'Khung bao vách kính cố định', 4.6, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_CC22903', 'Đố động dùng chung', 4.8, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_CC3203', 'Đố T chia khung bao vách', 5.2, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_CC3313', 'Đố T chia khung bao sổ', 5.3, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_CC3295', 'Nẹp kính', 1.7, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_C459', 'Thanh truyền khoá', 1.0, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_C3300', 'Nẹp nối khung', 1.9, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_22900', 'Nẹp ốp đáy', 2.3, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_CD23151', 'Khung bao cửa lùa 55', 5.1, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_CD23156', 'Cánh lùa 55', 5.2, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_CD23157', 'Thanh ốp lùa 55', 2.2, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_CD23158', 'Ốp trung gian trượt ( hệ 55 )', 1.4, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_D1541', 'Khung bao ngang trên lùa', 6.0, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_D1543', 'Khung bao đứng lùa', 4.8, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_D17182', 'Khung bao ngang dưới', 6.5, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_D1544', 'Ngang TRÊN cánh lùa', 4.5, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_D1545', 'Ngang dưới cánh', 4.7, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_D1546', 'Cánh trơn đứng lùa', 5.5, 125000, '1.2', false),
  ('TTLY2_', 'TTLY2_D1547', 'Cánh móc đứng lùa', 4.6, 125000, '1.2', false),
  ('TTLY4_', 'TTLY4_CC3328', 'Khung cửa đi mở quay', 5.5, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_CC3303', 'Cánh cửa đi mở ngoài', 6.9, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_CC3332', 'Cánh cửa đi mở trong', 6.9, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_CC3304', 'Đố ngang dưới cửa đi', 9.4, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_CC22903', 'Đố động dùng chung', 5.0, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_CC3318', 'Khung bao sổ', 5.1, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_CC3202', 'Cánh cửa sổ hệ 55 gân', 6.2, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_CC3209', 'Khung bao vách kính cố định', 4.9, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_CC3313', 'Đố T chia khung bao sổ', 5.5, 125000, '1.4', true),
  ('TTLY4_', 'TTLY4_CC3203', 'Đố T chia khung bao vách', 5.5, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_CC3295', 'Nẹp kính', 1.7, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_CC3296', 'Nẹp kính', 1.45, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_C3310', 'Chống bão', 6.9, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_C459', 'Thanh truyền khoá', 1.0, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_XC3300', 'Nẹp nối khung', 1.9, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_CD23151', 'Khung bao cửa lùa 55', 5.4, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_CD23156', 'Cánh lùa 55', 5.5, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_CD23157', 'Thanh ốp lùa 55', 2.2, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_D1541', 'Khung bao ngang trên lùa', 6.8, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_D1543', 'Khung bao đứng lùa', 5.5, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_D17182', 'Khung bao ngang dưới', 7.1, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_D1544', 'Ngang TRÊN cánh lùa', 5.0, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_D1545', 'Ngang dưới cánh', 5.3, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_D1546', 'Cánh trơn đứng lùa', 6.0, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_D1547', 'Cánh móc đứng lùa', 5.0, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_D1548A', 'Hèm đứng giữa cửa 4 cánh cửa đi trượt', 2.69, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_D1549A', 'Ốp mặt trong cây đứng bên tạo vách', 3.1, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_D1578', 'Ốp mặt ngoài cây đứng bên tạo vách', 3.0, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_D1559A', 'Thanh vách 1 mặt cửa đi trượt', 4.6, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_D2618', 'Đố cố định cho vách kính', 6.4, 125000, '1.4', true),
  ('TTLY8_', 'TTLY8_CC3328', 'Khung cửa đi mở quay', 6.5, 125000, '1.8', false),
  ('TTLY8_', 'TTLY8_CC3303', 'Cánh cửa đi mở ngoài', 7.5, 125000, '1.8', false),
  ('TTLY8_', 'TTLY8_CC3332', 'Cánh cửa đi mở trong', 7.5, 125000, '1.8', false),
  ('TT2LY_', 'TT2LY_CC3328', 'Khung cửa đi mở quay', 7.3, 125000, '2.0', false),
  ('TT2LY_', 'TT2LY_CC3303', 'Cánh cửa đi mở ngoài', 8.5, 125000, '2.0', false),
  ('TT2LY_', 'TT2LY_CC3332', 'Cánh cửa đi mở trong', 8.5, 125000, '2.0', false),
  ('TT2LY_', 'TT2LY_CC3304', 'Đố ngang dưới cửa đi', 12.0, 125000, '2.0', false),
  ('TTLY4_', 'TTLY4_CC22900', 'Nẹp ốp đáy', 2.3, 125000, '1.4', false),
  ('TTLY4_', 'TTLY4_CD23158', 'Ốp trung gian trượt ( hệ 55 )', 1.4, 125000, '1.4', false),
  ('TT2LY_', 'TT2LY_D1541', 'Khung bao ngang trên lùa', 8.5, 125000, '2.0', false),
  ('TT2LY_', 'TT2LY_D1543', 'Khung bao đứng lùa', 6.9, 125000, '2.0', false),
  ('TT2LY_', 'TT2LY_D17182', 'Khung bao ngang dưới', 8.5, 125000, '2.0', false),
  ('TT2LY_', 'TT2LY_D1545', 'Ngang dưới cánh', 5.8, 125000, '2.0', false),
  ('TT2LY_', 'TT2LY_D1544', 'Ngang dưới cánh lùa', 5.7, 125000, '2.0', false),
  ('TT2LY_', 'TT2LY_D1546', 'Cánh trơn đứng lùa', 7.5, 125000, '2.0', false),
  ('TT2LY_', 'TT2LY_D1547', 'Cánh móc đứng lùa', 6.7, 125000, '2.0', false)
)
insert into public.items (code, name, type, spec, fin, unit, qty, min_qty, price, loc,
                          system, weight_kg, sale_price, catalog_kind, track_stock, needs_review, q_unit, brand)
select v.code, v.name, 'Thanh định hình', 'Độ dày ' || v.thick || 'mm', '', 'thanh', 0, 0, 0, '',
       v.system, v.weight_kg, v.price, 'aluminum', false, v.review, 'Thanh', 'Trường Thành'
  from v
 where not exists (select 1 from public.items i
                    where public.norm_code(i.code) = public.norm_code(v.code)
                       or public.norm_code(coalesce(i.q_code, '')) = public.norm_code(v.code));

notify pgrst, 'reload schema';
commit;

-- KIỂM TRA (chạy tay): phải ra 71 dòng khi chạy lần đầu
--   select system, count(*), min(weight_kg), max(weight_kg) from public.items where brand = 'Trường Thành' group by 1 order by 1;
