# Cấu trúc Hải Hà Hưng (đã hợp nhất)

- `index.html`: khung chung duy nhất (đăng nhập Supabase, sidebar, phân quyền, định tuyến `#/ten-trang`). Phần kho nằm trong file này.
- `config.js`: URL + publishable key Supabase.
- `sites/*`: các trang kinh doanh (báo giá, lịch sử, danh mục nhôm, phụ kiện, báo giá có bản vẽ) hiển thị trong khung chung. Mở trực tiếp một trang sẽ tự chuyển về khung chung. `sites/in-bao-gia` là trang in, vẫn mở cửa sổ riêng.
- `assets/js/bridge.js`: cầu nối nhúng trang + đồng bộ báo giá với bảng `quotes`.
- `supabase/`: chạy lần lượt update-5, 6, 7 trong SQL Editor.
- Danh mục nhôm, phụ kiện, khách hàng nằm trong Supabase (`catalog_aluminum`, `catalog_accessories`, `customers`); `bridge.js` tự nạp, không còn file JSON công khai.
- `assets/js/stock-link.js`: nút "Tồn kho / Xuất kho" trong trang báo giá (đối chiếu `items`, tạo phiếu qua `submit_request`).

Tuyến: dash, stock, low, po, count, dc, log, rpt, req, usr, bao-gia, lich-su, danh-muc-nhom, phu-kien, khach-hang, nguon-tien.
Đăng nhập Cloudflare cũ (`functions/`, `login/`) đã bỏ vì dùng chung tài khoản Supabase.
- `sites/sao-luu`, `sites/khoi-phuc`: tải file sao lưu .json, và tạo SQL khôi phục từ file đó (chạy trong SQL Editor).

## CSKH (chăm sóc khách hàng / telesale) và vai trò CTV
  - Ghi nhận mỗi lần tương tác: kênh, thời điểm, liên hệ được hay không, kết quả, tín hiệu (nóng/ấm/lạnh), nội dung, **nhắc chăm sóc lại sau N ngày**. Người chăm sóc do server tự gán theo tài khoản đăng nhập.
  - Tab khách: Cần gọi (đến hạn + quá hạn) · Sắp tới · Chưa chăm sóc · Chưa hẹn lại · Tất cả; lọc "nhắc hẹn do tôi đặt"; nút gọi `tel:` trên điện thoại.
  - Tab "Nhật ký chăm sóc": lọc theo ngày / nhân viên / kết quả, kèm bảng tổng hợp theo nhân viên.
- `supabase/supabase-update-10.sql` (chạy SAU update-9): bảng `crm_interactions`, view `crm_customer_list` (không có công nợ), hàm `crm_add_customer`, `crm_dismiss_followup`, vai trò `ctv`.
- Vai trò **ctv** (Cộng tác viên CSKH) không còn trang nào sau khi bỏ mục CSKH: giao diện chỉ hiện thông báo; ở database policy `ctv_block` vẫn chặn đọc/ghi các bảng nghiệp vụ.
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
- Bốn loại: Hàng bán ra, Doanh thu khách hàng, Hàng nhập vào, Hàng hoàn tồn. Giá trị đều do database tính, trình duyệt chỉ lọc và cộng.
- `supabase/supabase-update-17.sql` (sau update-16): view `report_sales` cho hai báo cáo bán ra = dòng xuất kho chưa hủy trong Lịch sử kho + giá trị (báo giá hoặc phiếu ảnh, cùng công thức công nợ) + hoàn kho theo báo giá (số âm).
- `supabase/supabase-update-18.sql` (sau update-17): view `report_stock` cho hàng nhập vào (typ `in`) và hàng hoàn tồn (typ `return`: phiếu hoàn kho theo báo giá + dòng xuất đã hủy trong Lịch sử kho).
- Giao diện nằm trong `index.html`. Thêm loại báo cáo mới: thêm một mục vào `RPT` (nguồn, các ô lọc, các bảng phân tích) và, nếu cần, một nhánh vẽ bảng trong `rpDraw`.
- Test logic trình duyệt: `node tests/test-report.mjs`.

## Lịch sử nguồn tiền (supabase-update-19.sql, chạy SAU update-18)
- Trang `sites/nguon-tien/index.html` (tuyến `#/nguon-tien`, nhóm **Kinh doanh**, ngay dưới Khách hàng & công nợ).
- Bảng `cash_funds` (nguồn tiền + số dư đầu kỳ), `cash_vouchers` (phiếu thu / phiếu chi nhập tay, có số phiếu tự sinh PTyymmdd-xxxx / PCyymmdd-xxxx, hủy phiếu có lý do), view `cash_ledger` gộp phiếu thu/chi với `customer_payments`.
- Tiền khách trả ở trang Khách hàng & công nợ tự hiện thành phiếu thu (không nhập hai lần). Lập **phiếu thu** và chọn đúng khách đã lưu → ghi vào `customer_payments` (trừ công nợ); phiếu thu/chi khác chỉ nằm ở `cash_vouchers`, không đổi công nợ.
- Số dư từng nguồn = số dư đầu kỳ + tổng thu − tổng chi (phiếu đã hủy không tính). Có lọc theo ngày / loại / nguồn / từ khóa, in phiếu (kèm số tiền bằng chữ), xuất CSV.
- Quyền: admin / quản lý duyệt lập, hủy, sửa nguồn tiền; nhân viên kho chỉ lập phiếu; chỉ xem thì chỉ đọc; CTV và CTV kho bị chặn ở database.

## Một bảng sản phẩm duy nhất (supabase-update-21.sql, chạy SAU update-19; thay update-20)
- Kho, danh mục nhôm, danh mục phụ kiện gộp vào bảng `items`. Cột thêm: `system`, `grp`, `weight_kg`, `sale_price` (giá bán; `price` là giá nhập), `catalog_kind` (aluminum / accessory / none), `track_stock` (true = quản lý tồn kho, false = chỉ có trong báo giá), `needs_review`, `q_code`, `q_name`, `q_unit`, `q_color` (chữ hiển thị trên báo giá nếu khác kho).
- `catalog_aluminum`, `catalog_accessories` là VIEW đọc từ `items` (giữ tên + cột cũ) nên trang báo giá và các trang danh mục không đổi. Bảng cũ đổi tên `*_bak`, xóa khi đã chạy ổn.
- Mã thêm vào kho (form, Excel, xuất kho từ ảnh) tự thuộc danh mục báo giá (trigger `items_defaults`), `needs_review = true`, giá bán 0.
- Trang `sites/san-pham` (tuyến `#/san-pham`, "Danh mục sản phẩm"): xem / lọc / sửa mọi sản phẩm, đặt giá bán, hệ, kg, bật/tắt quản lý tồn kho. Trang Kho chỉ nạp các mã `track_stock = true`.
- Thêm mã vào kho trùng một mã chỉ-có-trong-báo-giá: hệ thống nhận dòng đó (bật track_stock) thay vì tạo trùng.
- Sao lưu / khôi phục không còn bảng `catalog_*` (dữ liệu nằm trong `items`).

## Thêm danh mục theo hãng (supabase-update-22.sql, chạy SAU update-21)
- Cột `items.brand` (hãng) + ô lọc "Hãng" ở trang Danh mục sản phẩm. update-22 nạp 71 mã nhôm **Trường Thành** (hệ TTLY2_ 1.2mm, TTLY4_ 1.4mm, TTLY8_ 1.8mm, TT2LY_ 2.0mm; giá 125.000 đ/kg), loại "chỉ có trong báo giá". Nhập kho đúng mã (VD `TTLY2_CC3328`) thì tự bật quản lý tồn kho cho dòng đó.
- Thêm hãng khác: tạo file SQL tương tự (insert vào `items` với `catalog_kind='aluminum'`, `track_stock=false`, `brand='<hãng>'`), hoặc thêm tay ở trang Danh mục sản phẩm.

- Đề xuất đặt hàng: bộ lọc (tìm kiếm, loại, hệ nhôm, màu, tình trạng, nhà cung cấp), mặc định chưa tick mã nào; nút **Tạo đơn đặt hàng** lưu vào bảng `purchase_orders` (supabase-update-23.sql) và mở trang in A4; thẻ **Đơn đã tạo** xem lại, in lại, đổi trạng thái.
