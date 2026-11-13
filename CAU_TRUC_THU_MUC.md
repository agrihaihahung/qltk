# Cấu trúc Hải Hà Hưng (đã hợp nhất)

- `index.html`: khung chung duy nhất (đăng nhập Supabase, sidebar, phân quyền, định tuyến `#/ten-trang`). Phần kho nằm trong file này.
- `config.js`: URL + publishable key Supabase.
- `sites/*`: các trang kinh doanh (báo giá, lịch sử, danh mục nhôm, phụ kiện, báo giá có bản vẽ) hiển thị trong khung chung. Mở trực tiếp một trang sẽ tự chuyển về khung chung. `sites/in-bao-gia` là trang in, vẫn mở cửa sổ riêng.
- `assets/js/bridge.js`: cầu nối nhúng trang + đồng bộ báo giá với bảng `quotes`.
- `supabase/`: chạy lần lượt update-5, 6, 7 trong SQL Editor.
- Danh mục nhôm, phụ kiện, khách hàng nằm trong Supabase (`catalog_aluminum`, `catalog_accessories`, `customers`); `bridge.js` tự nạp, không còn file JSON công khai.
- `assets/js/stock-link.js`: nút "Tồn kho / Xuất kho" trong trang báo giá (đối chiếu `items`, tạo phiếu qua `submit_request`).

Tuyến: dash, stock, low, po, count, dc, log, rpt, req, usr, bao-gia, ve-bao-gia, lich-su, danh-muc-nhom, phu-kien, khach-hang, cskh.
Đăng nhập Cloudflare cũ (`functions/`, `login/`) đã bỏ vì dùng chung tài khoản Supabase.
- `sites/sao-luu`, `sites/khoi-phuc`: tải file sao lưu .json, và tạo SQL khôi phục từ file đó (chạy trong SQL Editor).

## CSKH (chăm sóc khách hàng / telesale) và vai trò CTV
- `sites/cskh/index.html`: trang CSKH nằm trong nhóm **Kinh doanh** (tuyến `#/cskh`).
  - Ghi nhận mỗi lần tương tác: kênh, thời điểm, liên hệ được hay không, kết quả, tín hiệu (nóng/ấm/lạnh), nội dung, **nhắc chăm sóc lại sau N ngày**. Người chăm sóc do server tự gán theo tài khoản đăng nhập.
  - Tab khách: Cần gọi (đến hạn + quá hạn) · Sắp tới · Chưa chăm sóc · Chưa hẹn lại · Tất cả; lọc "nhắc hẹn do tôi đặt"; nút gọi `tel:` trên điện thoại.
  - Tab "Nhật ký chăm sóc": lọc theo ngày / nhân viên / kết quả, kèm bảng tổng hợp theo nhân viên.
- `supabase/supabase-update-10.sql` (chạy SAU update-9): bảng `crm_interactions`, view `crm_customer_list` (không có công nợ), hàm `crm_add_customer`, `crm_dismiss_followup`, vai trò `ctv`.
- Vai trò **ctv** (Cộng tác viên) là thấp nhất: giao diện chỉ còn mục CSKH, mọi tuyến khác tự đưa về `#/cskh`. Ở database, policy `ctv_block` (restrictive) chặn ctv đọc/ghi mọi bảng nghiệp vụ khác, nên gõ tay URL hoặc gọi API trực tiếp cũng không lấy được dữ liệu kho, báo giá, công nợ.
- Quyền trong CSKH: admin/quản lý duyệt xem + ghi + xóa mọi bản ghi; nhân viên kho và ctv xem + ghi, xóa bản ghi của mình trong 24 giờ; chỉ xem thì chỉ đọc.
- Cấp quyền: trang **Người dùng** (admin) → đổi vai trò thành "Cộng tác viên (chỉ CSKH)".
- **Đặc điểm tương thích** (nút cạnh "Ghi nhận tương tác"): bản tóm tắt đặc điểm từng khách do admin biên soạn (bảng `crm_profiles`, `supabase-update-11.sql`). Chỉ admin sửa được (chặn ở database); CTV và vai trò khác chỉ xem. Nút có chấm xanh khi khách đã có nội dung.

## Giá, chiết khấu, tổng tiền khi xuất kho từ ảnh phiếu
- `supabase/functions/parse-order/index.ts`: Edge Function đọc ảnh. Trả `lines[{code,name,color,unit,qty,price,weight,amount}]`, `discount`, `total`. Triển khai: `supabase functions deploy parse-order` (cần secret `ANTHROPIC_API_KEY`).
- `supabase/supabase-update-12.sql` (chạy SAU update-11): thêm cột `inv_price`, `inv_amount`, `inv_weight` vào `request_lines`, `inv_discount`, `inv_total` vào `requests`, và hàm `save_order_pricing`.
- Giá lưu đúng như in trên phiếu: nhôm thanh là đ/kg (có `inv_weight`), phụ kiện là đ/chiếc. Thành tiền lấy từ phiếu, không tự tính lại.
- Hộp thoại xuất kho cho sửa tay đơn giá, thành tiền, chiết khấu, tổng; có dòng đối chiếu (cộng các dòng + vận chuyển − chiết khấu so với tổng phiếu). Chỉ cảnh báo, không chặn xuất kho.
- Xem lại ở trang **Chờ duyệt** (tab đã xử lý): từng dòng có đơn giá, thành tiền; tiêu đề phiếu có tổng và chiết khấu.


## Báo giá ↔ kho ↔ công nợ (supabase-update-13.sql, chạy SAU update-12)
- Luồng: báo giá → "Tồn kho / Xuất kho" (lưu báo giá rồi tạo phiếu xuất, sig `BG:<mã>|...`) → **Chờ duyệt xuất kho** (chưa tính nợ) → kho duyệt → **Đã xuất kho** (tính công nợ). Từ chối/hủy phiếu → về "Đã chốt".
- Công nợ = nợ đầu kỳ + Σ(giá trị báo giá đã xuất kho − đã hoàn kho) − đã thanh toán. Báo giá "Đã chốt" không còn tính nợ.
- Hoàn kho theo đơn: mở báo giá đã xuất → "Tồn kho / Xuất kho" → bảng **Hoàn kho theo báo giá** (chọn số lượng, giá trị tự tính theo giá báo giá, sửa được) → phiếu NHẬP chờ duyệt (sig `HK:<mã>|...`). Kho duyệt → cộng tồn + trừ công nợ, chi tiết hiện ở báo giá, trang Khách hàng, bảng đối chiếu công nợ.
- Database chặn: đổi tay trạng thái xuất kho, sửa tổng tiền / xóa báo giá đã gửi kho, sửa số tiền hoàn. Hủy đơn xuất trong Lịch sử kho chỉ cộng tồn, không đổi nợ (có cảnh báo).
- Báo giá: bật "Công nợ cũ" → tự lấy công nợ hiện tại của khách đang chọn (hàm `quote_old_debt`, không tính chính báo giá đó).
- Test SQL: `tests/test-update-13.mjs` (Postgres PGlite, xem dòng đầu file).

## Cập nhật 14 (supabase-update-14.sql, chạy SAU update-13)
- Sửa lỗi: **Hủy đơn / Hoàn xuất trong Lịch sử kho** giờ tự trừ công nợ báo giá (trước chỉ cộng lại tồn). Dữ liệu cũ được bù khi chạy file.
- Hai đường hoàn kho (hủy dòng xuất ở kho, phiếu hoàn từ báo giá) dùng chung hàm `apply_quote_return`.
- Giá trị trừ nợ do database tính (`quote_unit_value`): giá dòng báo giá × tổng báo giá / cộng tiền hàng. Giao diện chỉ hiện ước tính cùng công thức, không nhập tay.
- Không hoàn quá số đã xuất của từng mã. Hoàn đủ → trạng thái **Đã hoàn kho**, nợ của đơn = 0, xóa được; không xuất tiếp từ báo giá này.
- Báo giá đã gửi/xuất/hoàn kho bị khóa nội dung; xuất tiếp phần còn lại vẫn được (không lưu đè báo giá).
- Test: `tests/test-update-14.mjs`. Sau khi chạy SQL, chạy câu KIỂM TRA ở cuối file để xem dòng hủy xuất nào chưa nối được với báo giá.

## Cập nhật 15 (supabase-update-15.sql, chạy SAU update-14)
Thứ tự triển khai: (1) chạy `supabase-update-15.sql` trong SQL Editor; (2) deploy lại Edge Function `parse-order` (thêm cột ĐVT khi đọc phiếu); (3) đẩy code web lên.

**A. Công nợ cho phiếu xuất kho từ ảnh**
- Trước đây phiếu xuất từ ảnh không vào công nợ vì không có báo giá. Nay hộp thoại "Xuất kho từ ảnh phiếu" có bảng **Công nợ khách hàng**: nhận diện khách theo tên trên phiếu (trùng đúng 1 khách thì tự chọn; gần giống chỉ gợi ý), cho chọn lại khách nếu nhận diện sai, tạo khách mới, hoặc chọn "Không tính công nợ".
- Bắt buộc chọn 1 trong 2 (tính cho khách X / không tính) mới xuất được. Bảng cảnh báo: chưa chọn, tên không khớp, khách chọn khác tên phiếu, thiếu tổng tiền, trùng giá trị với báo giá đang xuất kho (tránh tính nợ 2 lần), phiếu chờ duyệt thì nợ chỉ cộng sau khi duyệt.
- Database: `requests.debt_customer_id / debt_mode ('count'|'skip'|NULL)`; `customer_balances.sales/debt` đã gồm phiếu ảnh đã duyệt; hủy dòng xuất ở Lịch sử kho trừ lại theo tỷ lệ giá trị dòng (bảng `order_debt_adjust`).
- Phiếu ảnh cũ chưa gán: quản lý vào Chờ duyệt → Đã xử lý → nút **Gán công nợ**. Trang Khách hàng có tab **Phiếu xuất ảnh** và bảng đối chiếu in ra đã gồm các phiếu này.
- Xuất theo báo giá (BG:) vẫn tính nợ qua báo giá, không bị tính trùng.

**B. Đơn vị bán ra + bảng quy đổi**
- `items.unit` = đơn vị KHO. Bảng `item_units`: 1 <đơn vị bán> = <hệ số> <đơn vị kho> (VD kho "chiếc": 1 hộp = 100 chiếc). Sửa ở hộp thoại vật tư (mục "Đơn vị bán ra & bảng quy đổi"); danh sách tồn hiện ghi chú quy đổi dưới số tồn.
- Nơi dùng: xuất kho từ ảnh (chọn ĐVT bán từng dòng, tự gợi ý theo ĐVT đọc được trên phiếu; ĐVT lạ chưa có quy đổi thì phải xác nhận hoặc thêm quy đổi), xuất/nhập tay, xuất theo báo giá (ĐVT trên báo giá khác kho thì cần hệ số; có nút lưu lại cho lần sau).
- Kho luôn trừ theo đơn vị kho; `request_lines.sale_qty/sale_unit/sale_factor` lưu lại số bán thực tế. `quote_unit_value` chia theo số lượng kho nên hoàn kho theo báo giá không lệch khi quy đổi.
- Test: `tests/test-update-15.mjs` (cần `npm i @electric-sql/pglite@0.2.17`). Câu KIỂM TRA cuối file SQL liệt kê phiếu ảnh cũ chưa gán nợ.

## Vai trò CTV kho (supabase-update-16.sql, chạy SAU update-15)
- Vai trò `ctv_kho` ("CTV kho (chỉ xem Tồn kho)"): chỉ vào được trang **Tồn kho**, chỉ đọc. Giao diện ẩn mọi nút Nhập / Xuất / Sửa / Thêm / Nhập Excel / Xuất từ ảnh, mọi tuyến khác tự đưa về `#/stock`.
- Database: chỉ đọc được `items`, `offcuts`, `item_units`; chặn ghi các bảng này và chặn đọc/ghi mọi bảng khác (policy `ctvkho_*`, restrictive). Có hàm security definer nào ghi dữ liệu mà không kiểm tra vai trò thì rà theo phần "KIỂM TRA" cuối file SQL.
- Cấp quyền: trang **Người dùng** (admin) → đổi vai trò thành "CTV kho (chỉ xem Tồn kho)".
- Logo góc trái sidebar dùng `assets/images/logo-icon.png` (phần biểu tượng cắt từ logo gốc).

## Báo cáo kho (tuyến `#/rpt`)
- Chạy `supabase/supabase-update-17.sql` (SAU update-16) để tạo view `report_sales`. Đây là nguồn duy nhất của báo cáo: dòng xuất kho chưa hủy trong Lịch sử kho + giá trị tính ở database (báo giá hoặc phiếu ảnh, cùng công thức công nợ) + dòng hoàn kho theo báo giá (số âm).
- Giao diện nằm trong `index.html`. Thêm loại báo cáo mới: thêm một mục vào `RPT` và, nếu cần, một nhánh vẽ bảng trong `rpDraw`.
- Test logic trình duyệt: `node tests/test-report.mjs`.
