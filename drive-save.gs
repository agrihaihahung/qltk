/**
 * Hải Hà Hưng - Lưu báo giá lên Google Drive
 * Triển khai: Deploy > New deployment > Web app
 * Execute as: Me; Who has access: Anyone (hoặc Anyone with the link, tùy chính sách Workspace).
 * Có thể đặt Script Property DRIVE_FOLDER_ID để lưu vào một thư mục cụ thể.
 */
function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var requiredToken = props.getProperty('SAVE_TOKEN');
    var suppliedToken = e && e.parameter && e.parameter.token;
    if (requiredToken && suppliedToken !== requiredToken) throw new Error('Mã xác thực không đúng.');
    var raw = e && e.parameter && e.parameter.payload;
    if (!raw) throw new Error('Không nhận được dữ liệu báo giá.');
    var p = JSON.parse(raw);
    var code = safeName((p.quote && p.quote.code) || ('BG-' + new Date().getTime()));
    var folderId = props.getProperty('DRIVE_FOLDER_ID');
    var folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
    var jsonFile = folder.createFile(code + '.json', JSON.stringify(p, null, 2), MimeType.JSON);
    var html = buildQuoteHtml(p);
    var pdfBlob = Utilities.newBlob(html, 'text/html', code + '.html').getAs(MimeType.PDF).setName(code + '.pdf');
    var pdfFile = folder.createFile(pdfBlob);
    return HtmlService.createHtmlOutput('<!doctype html><html><head><meta charset="utf-8"></head><body><p>Đã lưu báo giá lên Google Drive.</p><script>try{parent.postMessage({type:"HAIHAHUNG_DRIVE_SAVE_RESULT",ok:true,pdfName:' + JSON.stringify(pdfFile.getName()) + ',pdfUrl:' + JSON.stringify(pdfFile.getUrl()) + ',jsonUrl:' + JSON.stringify(jsonFile.getUrl()) + '},"*")}catch(e){}</script></body></html>');
  } catch (err) {
    var msg = String(err && err.message || err);
    return HtmlService.createHtmlOutput('<!doctype html><html><head><meta charset="utf-8"></head><body><p>Không lưu được báo giá: ' + escapeHtml(msg) + '</p><script>try{parent.postMessage({type:"HAIHAHUNG_DRIVE_SAVE_RESULT",ok:false,error:' + JSON.stringify(msg) + '},"*")}catch(e){}</script></body></html>');
  }
}
function safeName(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100); }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function money(n) { return Math.round(Number(n) || 0).toLocaleString('vi-VN') + ' đ'; }
function buildQuoteHtml(p) {
  var q=p.quote||{}, c=p.customer||{}, t=p.totals||{}, d=p.discount||{};
  var aluminum=Array.isArray(p.aluminum)?p.aluminum:[], accessories=Array.isArray(p.accessories)?p.accessories:[];
  var weight=aluminum.reduce(function(s,x){return s+(Number(x.qty)||0)*(Number(x.weight)||0)},0);
  var fmt=function(n){return (Number(n)||0).toLocaleString('vi-VN',{maximumFractionDigits:3})};
  var aRows=aluminum.map(function(x,i){return '<tr><td>'+(i+1)+'</td><td>'+escapeHtml(x.system||'')+'</td><td>'+escapeHtml(x.code||'')+'</td><td>'+escapeHtml(x.name||'')+'</td><td>'+escapeHtml(x.color||'')+'</td><td>'+fmt(x.qty)+'</td><td>'+fmt(x.weight)+' kg</td><td>'+money((Number(x.qty)||0)*(Number(x.weight)||0)*(Number(x.price)||0))+'</td></tr>';}).join('');
  var pRows=accessories.map(function(x,i){return '<tr><td>'+(i+1)+'</td><td>'+escapeHtml(x.code||'')+'</td><td>'+escapeHtml(x.name||'')+'</td><td>'+escapeHtml(x.group||x.spec||'')+'</td><td>'+fmt(x.qty)+'</td><td>'+money((Number(x.qty)||0)*(Number(x.price)||0))+'</td></tr>';}).join('');
  var discountLabel=d.accessoriesOnly?'Chiết khấu phụ kiện':'Chiết khấu';
  return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><style>@page{size:A4;margin:12mm}body{font:10px Arial,sans-serif;color:#152236}header{text-align:center;border-bottom:2px solid #17385e;padding:0 0 12px;margin-bottom:14px}h1{font-size:18px;margin:8px 0}h2{font-size:12px;margin:14px 0 6px;color:#17385e}p{margin:4px 0}table{width:100%;border-collapse:collapse;margin:5px 0 12px}th,td{border:1px solid #ccd7e5;padding:5px;text-align:left}th{background:#17385e;color:#fff}td:last-child{text-align:right}.summary{width:48%;margin-left:auto}.summary td{padding:6px}.grand{font-weight:bold;background:#eaf2ff}</style></head><body><header><p>BÁO GIÁ SẢN PHẨM</p><h1>CÔNG TY TNHH KINH DOANH TỔNG HỢP HẢI HÀ HƯNG</h1><p>QL1A, Xã Thăng Bình, TP Đà Nẵng · 0918 210 031 · mailcv.30@gmail.com</p><h1>PHIẾU BÁO GIÁ</h1><p>Mã: '+escapeHtml(q.code||'')+' · Ngày: '+escapeHtml(q.date||'')+'</p></header><p><b>Khách hàng:</b> '+escapeHtml(c.name||'')+' &nbsp; <b>Điện thoại:</b> '+escapeHtml(c.phone||'')+'</p><p><b>Người liên hệ:</b> '+escapeHtml(c.contact||'')+' &nbsp; <b>Địa chỉ:</b> '+escapeHtml(c.address||'')+'</p><h2>01. NHÔM THANH</h2><table><thead><tr><th>STT</th><th>Hệ</th><th>Mã hàng</th><th>Tên hàng / quy cách</th><th>Màu</th><th>SL</th><th>Kg/thanh</th><th>Thành tiền</th></tr></thead><tbody>'+aRows+'</tbody><tfoot><tr><td colspan="6" style="text-align:right"><b>TỔNG KHỐI LƯỢNG NHÔM</b></td><td colspan="2">'+fmt(weight)+' kg</td></tr><tr><td colspan="7" style="text-align:right"><b>THÀNH TIỀN NHÔM THANH</b></td><td>'+money(t.aluminumTotal)+'</td></tr></tfoot></table>'+(p.accessoriesIncluded===false?'':'<h2>02. PHỤ KIỆN</h2><table><thead><tr><th>STT</th><th>Mã hàng</th><th>Tên phụ kiện</th><th>Nhóm / quy cách</th><th>SL</th><th>Thành tiền</th></tr></thead><tbody>'+pRows+'</tbody><tfoot><tr><td colspan="5" style="text-align:right"><b>THÀNH TIỀN PHỤ KIỆN</b></td><td>'+money(t.accessoryTotal)+'</td></tr></tfoot></table>')+'<table class="summary"><tr><td>Tổng tiền hàng</td><td>'+money(t.subtotal)+'</td></tr><tr><td>'+discountLabel+'</td><td>'+money(t.discount)+'</td></tr><tr><td>Thuế VAT ('+(Number(p.vatRate)||0)+'%)</td><td>'+money(t.vat)+'</td></tr><tr class="grand"><td>TỔNG THANH TOÁN</td><td>'+money(t.grand)+'</td></tr></table><p><b>Ghi chú:</b> '+escapeHtml(p.notes||'')+'</p><p><b>Giao hàng:</b> '+escapeHtml(p.deliveryTime||'Theo thỏa thuận')+' · <b>Thanh toán:</b> '+escapeHtml(p.paymentTerms||'Theo thỏa thuận')+'</p><p><b>Nhân viên phụ trách:</b> '+escapeHtml(q.salesperson||'')+' · <b>Hiệu lực:</b> '+(Number(q.validityDays)||15)+' ngày</p></body></html>';
}
