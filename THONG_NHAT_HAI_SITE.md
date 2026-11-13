# Thống nhất site báo giá và site in

## Quy tắc chiết khấu phụ kiện
- Chiết khấu riêng được áp dụng trên từng phụ kiện trước.
- Chiết khấu chung chỉ áp dụng cho dòng phụ kiện đã đánh dấu `CK chung` và có chiết khấu riêng bằng 0%.
- Dòng đã có chiết khấu riêng lớn hơn 0% sẽ bị loại khỏi cơ sở tính chiết khấu chung.
- Không có dòng nào đủ điều kiện thì chiết khấu chung phụ kiện bằng 0; không tự động áp dụng cho toàn bộ danh sách.
- Bảng in vẫn gọn, không thêm cột chiết khấu; thành tiền từng dòng phụ kiện phản ánh chiết khấu riêng, phần chiết khấu chung hiển thị trong tổng hợp thanh toán.

## Nguồn dữ liệu in
- Khi bấm `In / PDF`, site báo giá tạo snapshot từ phiếu đang soạn và mở site in bằng `draftKey` riêng cho lần in đó.
- Site in ưu tiên đọc snapshot được chỉ định bởi `draftKey`, tránh đọc nhầm snapshot cũ khi có nhiều tab báo giá.

## Excel
- Sheet Phụ kiện có đơn giá, thành tiền gốc, chiết khấu riêng, tiền chiết khấu riêng, trạng thái đủ điều kiện CK chung và thành tiền sau CK riêng.
- Sheet Báo giá và Thanh toán tách chiết khấu nhôm, chiết khấu phụ kiện chung và tổng chiết khấu.

## Kiểm thử cần chạy trong trình duyệt
1. Tạo 3 phụ kiện: một dòng CK riêng 5%, một dòng CK riêng 0% đã tick CK chung, một dòng CK riêng 0% không tick CK chung.
2. Nhập chiết khấu chung phụ kiện 10%: chỉ dòng thứ hai thuộc cơ sở tính CK chung.
3. In báo giá: bảng phụ kiện giữ bố cục gọn; thành tiền từng dòng đã phản ánh CK riêng; phần tổng hợp thể hiện CK chung.
4. Xuất Excel: kiểm tra sheet Phụ kiện và Thanh toán khớp tổng tiền trên màn hình và phiếu in.
5. Thử tắt VAT và xác nhận dòng VAT không xuất hiện trên phiếu in.


## Cập nhật phiếu in – chiết khấu phụ kiện
- Khi có ít nhất một phụ kiện có `discountPercent > 0`, bảng phụ kiện hiện cột `CK RIÊNG (%)`; dòng không có chiết khấu để trống.
- Khi không có phụ kiện nào có chiết khấu riêng, cột này được ẩn hoàn toàn.
- Dòng `Chiết khấu phụ kiện` trong tổng hợp thanh toán cộng chiết khấu riêng từng sản phẩm và chiết khấu chung; chỉ hiện khi tổng chiết khấu thực tế khác 0.


## Bổ sung công nợ cũ và cân đối cột chiết khấu (2026-10-14)
- Bảng phụ kiện trên phiếu in dùng cột CK riêng hẹp hơn; tăng không gian cho đơn giá và thành tiền.
- Phần Tổng hợp thanh toán có công tắc bật/tắt công nợ cũ; chỉ hiện dòng công nợ trên phiếu in khi bật và số tiền lớn hơn 0.
- Công nợ cũ được cộng vào tổng thanh toán, không tính vào cơ sở tính VAT.
- Công nợ cũ được đưa vào payload bản nháp và file Excel.
