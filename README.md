# Hải Hà Hưng – bản cập nhật giao diện báo giá

## Nội dung cập nhật
1. Popup **Thêm nhôm** có bộ lọc theo **Hệ nhôm** và ô tìm kiếm.
2. Popup **Thêm phụ kiện** có bộ lọc theo **Hệ / nhóm phụ kiện** và ô tìm kiếm.
3. Trên điện thoại, thanh điều hướng được mở bằng nút ☰ ở đầu trang; có lớp nền để đóng menu.
4. Thêm `customers.json` và trường **Chọn khách hàng đã lưu**. Chọn khách hàng sẽ tự điền tên, điện thoại, người liên hệ và địa chỉ.
5. Dữ liệu nhôm/phụ kiện được giữ trong các file JSON riêng: `nhomthanh.json`, `phukien.json`.

## Cấu trúc
- `index.html`, `style.css`, `app.js`: màn hình báo giá.
- `customers.json`: danh sách khách hàng.
- `nhomthanh.json`, `phukien.json`: danh mục hàng hóa.
- `danh-muc-nhom.html`, `phu-kien.html`, `lich-su-bao-gia.html`: các trang danh mục/lịch sử.
- `print.html`, `print.css`, `print.js`: bản in.

## Cập nhật khách hàng
Sửa `customers.json`, thêm phần tử vào mảng theo mẫu:
```json
{
  "id": "KH-0002",
  "name": "Tên khách hàng",
  "phone": "09xxxxxxxx",
  "contact": "Người liên hệ",
  "address": "Địa chỉ"
}
```
Bản giao kèm một bản ghi mẫu dựa trên thông tin minh họa có sẵn trong source cũ. Hãy thay bằng dữ liệu thực tế của doanh nghiệp trước khi sử dụng chính thức.

## Chạy thử
Mở thư mục bằng máy chủ web (ví dụ VS Code Live Server) hoặc triển khai toàn bộ file lên GitHub Pages. Không mở `index.html` trực tiếp bằng `file://`, vì trình duyệt sẽ chặn `fetch()` đọc JSON.


## Cập nhật bổ sung
- Thêm tùy chọn `Chỉ chiết khấu phụ kiện`: phần trăm/số tiền chiết khấu được tính trên tổng phụ kiện, không ảnh hưởng tiền nhôm.
- Phiếu in có dòng tổng khối lượng nhôm, tính bằng tổng số lượng × kg/thanh của tất cả dòng nhôm.
- Khối thông tin công ty trong đầu phiếu in được căn giữa.


## Bản cập nhật tiếp theo
- Thêm checkbox “Chọn nhiều mã” trong popup chọn nhôm/phụ kiện; có thể lọc rồi tích nhiều sản phẩm và thêm cùng lúc.
- Chuyển logo sang bên phải, tăng kích thước và đặt sát vách ngăn mã báo giá; thông tin công ty vẫn căn giữa.
- Đưa dòng tổng khối lượng nhôm lên trên dòng cộng nhôm thanh trong bảng in.


## Popup chọn khách hàng
- Nút **Chọn khách hàng đã lưu** mở popup có ô tìm kiếm theo tên, mã, điện thoại, người liên hệ hoặc địa chỉ.
- Chọn khách hàng sẽ tự điền các trường thông tin trên báo giá. Nút **Nhập khách hàng mới** đóng popup và cho phép nhập thủ công.

## Lưu báo giá lên Google Drive
Nút **Lưu vào Drive** cần một Google Apps Script Web App để lưu PDF và JSON vào Drive. Source có sẵn `drive-save.gs`.

1. Mở [script.google.com](https://script.google.com), tạo project mới và dán toàn bộ nội dung `drive-save.gs` vào `Code.gs`.
2. Trong **Project Settings > Script Properties**, thêm `SAVE_TOKEN` với một chuỗi bí mật dài, khó đoán. Thêm `DRIVE_FOLDER_ID` với ID thư mục Drive muốn lưu (tùy chọn; nếu không cấu hình, file được lưu ở My Drive gốc của tài khoản triển khai).
3. Chọn **Deploy > New deployment > Web app**; Execute as: **Me**; Who has access: chọn mức phù hợp với chính sách tài khoản (thường là **Anyone** để ứng dụng web có thể gửi yêu cầu).
4. Cấp quyền truy cập Drive khi Google yêu cầu và triển khai. Sao chép URL Web App kết thúc bằng `/exec`.
5. Trong ứng dụng, bấm **Lưu vào Drive** và dán URL `/exec` lần đầu. URL được lưu trong localStorage của trình duyệt.
6. Lần đầu bấm nút, nhập URL `/exec` và giá trị `SAVE_TOKEN`; ứng dụng lưu hai giá trị trong localStorage của trình duyệt. Mỗi lần lưu sẽ tạo một file PDF và một file JSON mang mã báo giá trong thư mục Drive đã cấu hình. Nếu đổi token, xóa khóa `haihahung_drive_save_token` trong localStorage hoặc xóa dữ liệu trang để nhập lại.

**Bảo mật:** Web App cần quyền tạo file trong Drive. Hãy đặt `SAVE_TOKEN` và chỉ chia sẻ URL Web App cùng token với người dùng đáng tin cậy và tuân thủ chính sách Google Workspace của doanh nghiệp. Nếu chính sách không cho phép truy cập `Anyone`, cần triển khai cơ chế xác thực phù hợp trước khi sử dụng thực tế.


## Đăng nhập bảo mật
Hướng dẫn triển khai tài khoản nội bộ bằng Cloudflare Pages Functions: xem `SECURE_LOGIN_SETUP.md`. Không đặt mật khẩu trong JSON công khai.
