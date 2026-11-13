(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const money = n => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0)) + ' ₫';
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dateString = d => `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
  const state = { aluminum: [], accessories: [], catalog: [], accessoryCatalog: [], mode: 'aluminum', toastTimer: null, catalogLoaded: false, aluminumPriceEditEnabled: false, customers: [], systemFilterValue: '', multiSelectKeys: new Set() };
  const sampleAluminum = [
    { code: 'KW-55S-001', name: 'Thanh khung bao Kenwin 55s', color: 'Ghi sần', spec: '1.4 mm · 6.0 m', qty: 30, unit: 'Thanh', price: 285000 },
    { code: 'KW-55S-012', name: 'Thanh cánh cửa Kenwin 55s', color: 'Ghi sần', spec: '1.4 mm · 6.0 m', qty: 24, unit: 'Thanh', price: 312000 }
  ];
  const sampleAccessories = [{ code: 'PK-BN-001', name: 'Bản lề cửa nhôm', group: 'Phụ kiện cửa', qty: 12, unit: 'Bộ', price: 85000 }];
  const fmtDateISO = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  function init() {
    $('#todayLabel').textContent = new Intl.DateTimeFormat('vi-VN', { weekday:'short', day:'2-digit', month:'short', year:'numeric' }).format(today);
    $('#quoteDateDisplay').textContent = dateString(today);
    $('#yearLabel').textContent = today.getFullYear();
    $('#quoteCode').textContent = `BG-${String(today.getFullYear()).slice(-2)}${pad(today.getMonth()+1)}${pad(today.getDate())}-001`;
    state.aluminum = [];
    state.accessories = [];
    renderRows(); calculate(); bindEvents(); restoreDraft(); loadCatalog(); loadCustomers();
  }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function renderRows() {
    $('#aluminumRows').innerHTML = state.aluminum.map((item, i) => `<tr data-id="${item.id}" data-kind="aluminum">
      <td>${i+1}</td><td><span class="product-name">${escapeHtml(item.name || 'Sản phẩm nhôm')}</span><span class="product-code"><span class="code-tag">${escapeHtml(item.code || 'CHƯA CÓ MÃ')}</span></span></td>
      <td><input class="cell-input color-input" data-field="color" aria-label="Màu sắc" value="${escapeHtml(item.color)}" /></td>
      <td><input class="cell-input spec-input" data-field="spec" aria-label="Quy cách" value="${escapeHtml(item.spec)}" /></td>
      <td class="align-right"><input class="cell-input qty-input" data-field="qty" type="number" min="0" step="any" aria-label="Số lượng" value="${Number(item.qty)||0}" /></td>
      <td><span class="unit-cell">${escapeHtml(item.unit || 'Thanh')}</span></td>
      <td class="align-right"><input class="cell-input price-input" data-field="price" type="number" min="0" step="100" aria-label="Đơn giá nhôm (VND/kg)" value="${Number(item.price)||0}" ${state.aluminumPriceEditEnabled ? '' : 'readonly'} title="${state.aluminumPriceEditEnabled ? 'Đang bật chỉnh sửa đơn giá nhôm' : 'Đơn giá đang khóa; bật Sửa đơn giá khi cần thay đổi'}" /></td>
      <td class="money-cell" data-total>${money((Number(item.qty)||0)*(Number(item.weight)||0)*(Number(item.price)||0))}</td><td><button class="delete-row" data-delete="${item.id}" title="Xóa dòng" aria-label="Xóa dòng">×</button></td></tr>`).join('');
    $('#accessoryRows').innerHTML = state.accessories.map((item, i) => `<tr data-id="${item.id}" data-kind="accessory">
      <td>${i+1}</td><td><span class="product-name">${escapeHtml(item.name || 'Phụ kiện')}</span><span class="product-code"><span class="code-tag">${escapeHtml(item.code || 'CHƯA CÓ MÃ')}</span></span></td>
      <td><input class="cell-input" style="min-width:110px" data-field="group" aria-label="Nhóm phụ kiện" value="${escapeHtml(item.group || 'Phụ kiện cửa')}" /></td>
      <td class="align-right"><input class="cell-input qty-input" data-field="qty" type="number" min="0" step="any" aria-label="Số lượng" value="${Number(item.qty)||0}" /></td><td><span class="unit-cell">${escapeHtml(item.unit || 'Cái')}</span></td>
      <td class="align-right"><input class="cell-input price-input" data-field="price" type="number" min="0" step="100" aria-label="Đơn giá" value="${Number(item.price)||0}" /></td>
      <td class="align-right"><input class="cell-input discount-percent-input" data-field="discountPercent" type="number" min="0" max="100" step="0.5" aria-label="Chiết khấu riêng phần trăm" value="${Math.min(100,Math.max(0,Number(item.discountPercent)||0))}" /></td><td class="money-cell" data-total>${money((Number(item.qty)||0)*(Number(item.price)||0)*(1-Math.min(100,Math.max(0,Number(item.discountPercent)||0))/100))}</td><td class="discount-check-cell"><input type="checkbox" data-discount-item="${item.id}" ${item.discountEligible ? 'checked' : ''} aria-label="Chiết khấu phụ kiện ${escapeHtml(item.name || item.code || '')}" title="Đánh dấu để áp dụng chiết khấu chung cho dòng này" /></td><td><button class="delete-row" data-delete="${item.id}" title="Xóa dòng" aria-label="Xóa dòng">×</button></td></tr>`).join('');
    $('#aluminumCount').textContent = state.aluminum.length;
    $('#accessoryCount').textContent = $('#includeAccessories').checked ? state.accessories.length : 0;
    $('#lineCount').textContent = state.aluminum.length + ($('#includeAccessories').checked ? state.accessories.length : 0);
    applyProductFilter();
  }
  function readTable(kind) {
    const arr = kind === 'aluminum' ? state.aluminum : state.accessories;
    $$(`tr[data-kind="${kind}"]`).forEach(tr => {
      const item = arr.find(x => x.id === tr.dataset.id); if (!item) return;
      $$('[data-field]', tr).forEach(input => { const key = input.dataset.field; item[key] = input.type === 'number' ? Math.max(0, Number(input.value)||0) : input.value; });
      const total = tr.querySelector('[data-total]'); if (total) total.textContent = money(kind === 'aluminum' ? item.qty * (Number(item.weight)||0) * item.price : item.qty * item.price * (1-Math.min(100,Math.max(0,Number(item.discountPercent)||0))/100));
    });
  }
  function calculate() {
    readTable('aluminum'); readTable('accessory');
    const aluminumTotal = state.aluminum.reduce((s,x)=>s+(Number(x.qty)||0)*(Number(x.weight)||0)*(Number(x.price)||0),0);
    const accessoryGrossTotal = $('#includeAccessories').checked ? state.accessories.reduce((s,x)=>s+(Number(x.qty)||0)*(Number(x.price)||0),0) : 0;
    const accessoryItemDiscount = $('#includeAccessories').checked ? state.accessories.reduce((s,x)=>s+(Number(x.qty)||0)*(Number(x.price)||0)*Math.min(100,Math.max(0,Number(x.discountPercent)||0))/100,0) : 0;
    const accessoryTotal = Math.max(0, accessoryGrossTotal - accessoryItemDiscount);
    const subtotal = aluminumTotal + accessoryTotal;
    const alRaw = Math.max(0, Number($('#discountAlValue')?.value)||0);
    const acRaw = Math.max(0, Number($('#discountAccValue')?.value)||0);
    // CK chung chỉ áp dụng cho các phụ kiện được tick và CHƯA có CK riêng.
    // Nếu sản phẩm có CK riêng (> 0%), loại khỏi nhóm CK chung để tránh giảm trùng.
    const checkedAccessories = $('#includeAccessories').checked ? state.accessories.filter(x => x.discountEligible && Math.min(100,Math.max(0,Number(x.discountPercent)||0)) === 0) : [];
    const selectedAccessoryBase = checkedAccessories.reduce((s,x)=>s+(Number(x.qty)||0)*(Number(x.price)||0),0);
    const alDiscount = Math.min(aluminumTotal, $('#discountAlType').value === 'percent' ? aluminumTotal * Math.min(alRaw,100)/100 : alRaw);
    const accessoryDiscountBase = selectedAccessoryBase;
    const acDiscount = Math.min(accessoryDiscountBase, $('#discountAccType').value === 'percent' ? accessoryDiscountBase * Math.min(acRaw,100)/100 : acRaw);
    const discount = alDiscount + acDiscount;
    const taxable = Math.max(0, subtotal - discount);
    const vatEnabled = $('#vatEnabled')?.checked === true;
    const vat = vatEnabled ? taxable * (Number($('#vatRate').value)||0) / 100 : 0;
    const oldDebtEnabled = $('#oldDebtEnabled')?.checked === true;
    const oldDebt = oldDebtEnabled ? Math.max(0, Number($('#oldDebtAmount')?.value)||0) : 0;
    const grand = taxable + vat + oldDebt;
    $('#aluminumSubtotal').textContent = money(aluminumTotal);
    $('#accessorySubtotal').textContent = money(accessoryTotal);
    $('#discountAlAmount').textContent = money(alDiscount);
    $('#discountAccAmount').textContent = money(acDiscount);
    $('#discountAmount').textContent = money(discount);
    $('#vatAmount').textContent = money(vat);
    if ($('#oldDebtInputLine')) $('#oldDebtInputLine').classList.toggle('hidden', !oldDebtEnabled);
    if ($('#oldDebtSummaryLine')) $('#oldDebtSummaryLine').classList.toggle('hidden', !(oldDebtEnabled && oldDebt > 0));
    if ($('#oldDebtSummaryAmount')) $('#oldDebtSummaryAmount').textContent = money(oldDebt);
    $('#grandTotal').textContent = money(grand);
    $('#totalCard').textContent = money(grand);
    $('#amountWords').textContent = 'Bằng chữ: ' + numberToVietnamese(Math.round(grand)) + '.';
    $('#accessoryCount').textContent = $('#includeAccessories').checked ? state.accessories.length : 0;
    $('#lineCount').textContent = state.aluminum.length + ($('#includeAccessories').checked ? state.accessories.length : 0);
    $('#aluminumCount').textContent = state.aluminum.length;
    return { aluminumTotal, accessoryTotal, subtotal, discountAl:alDiscount, discountAccessories:acDiscount, discount, vat, oldDebt, grand };
  }
  function numberToVietnamese(n) {
    if (!n) return 'không đồng';
    const ones=['không','một','hai','ba','bốn','năm','sáu','bảy','tám','chín'];
    const read3 = num => { let s=''; const h=Math.floor(num/100), t=Math.floor(num%100/10), u=num%10; if(h) s+=ones[h]+' trăm'; else if(t||u) s+='không trăm'; if(t>1) s+=' '+ones[t]+' mươi'; else if(t===1) s+=' mười'; else if(u && h) s+=' lẻ'; if(u){if(t>1&&u===1)s+=' mốt';else if(t>0&&u===5)s+=' lăm';else s+=' '+ones[u]} return s.trim(); };
    const units=['',' nghìn',' triệu',' tỷ',' nghìn tỷ',' triệu tỷ']; let groups=[]; while(n>0){groups.unshift(n%1000);n=Math.floor(n/1000)}
    let words=[]; groups.forEach((g,i)=>{if(g){let unit=units[groups.length-i-1]||'';words.push(read3(g)+unit)}}); return words.join(' ').replace(/\s+/g,' ').trim()+' đồng';
  }
  function bindEvents() {
    $('#addAluminumBtn').addEventListener('click',()=>openPicker('aluminum'));
    const priceEditBtn = $('#toggleAluminumPriceEdit');
    if (priceEditBtn) {
      const syncPriceEditButton = () => {
        priceEditBtn.textContent = state.aluminumPriceEditEnabled ? '🔓 Sửa đơn giá: Bật' : '🔒 Sửa đơn giá: Tắt';
        priceEditBtn.setAttribute('aria-pressed', String(state.aluminumPriceEditEnabled));
        priceEditBtn.classList.toggle('btn-warning', state.aluminumPriceEditEnabled);
        priceEditBtn.classList.toggle('btn-secondary', !state.aluminumPriceEditEnabled);
        priceEditBtn.title = state.aluminumPriceEditEnabled ? 'Đơn giá nhôm đang được phép chỉnh sửa; nhấn để khóa lại' : 'Đơn giá nhôm đang khóa; nhấn để cho phép chỉnh sửa tạm thời';
      };
      syncPriceEditButton();
      priceEditBtn.addEventListener('click', () => {
        calculate(); // Đọc các giá trị đang có trước khi dựng lại bảng.
        state.aluminumPriceEditEnabled = !state.aluminumPriceEditEnabled;
        renderRows();
        calculate();
        saveDraft();
        syncPriceEditButton();
        notify(state.aluminumPriceEditEnabled ? 'Đã bật chỉnh sửa đơn giá nhôm.' : 'Đã khóa chỉnh sửa đơn giá nhôm.');
      });
    }
    $('#addAccessoryBtn').addEventListener('click',()=>openPicker('accessory'));
    $('#closeModal').addEventListener('click',closePicker);
    $('#productModal').addEventListener('click',e=>{if(e.target===$('#productModal'))closePicker()});
    $('#manualProductBtn').addEventListener('click',addManualProduct);
    $('#modalSearch').addEventListener('input',renderCatalogOptions);
    $('#modalSystemFilter').addEventListener('change',renderCatalogOptions);
    $('#multiSelectMode').addEventListener('change',()=>{state.multiSelectKeys.clear();$('#addSelectedBtn').classList.toggle('hidden',!$('#multiSelectMode').checked);$('#multiSelectHint').textContent=$('#multiSelectMode').checked?'Tích chọn các mã cần thêm, sau đó bấm “Thêm mã đã chọn”.':'Bật để chọn nhiều sản phẩm cùng lúc.';renderCatalogOptions()});
    $('#modalList').addEventListener('change',e=>{const input=e.target.closest('.multi-item-check');if(!input)return;const key=input.dataset.key;if(input.checked)state.multiSelectKeys.add(key);else state.multiSelectKeys.delete(key);updateMultiSelectButton()});
    $('#addSelectedBtn').addEventListener('click',addSelectedCatalogItems);
    $('#customerSelect').addEventListener('change',selectCustomer);
    $('#chooseCustomerBtn').addEventListener('click',openCustomerPicker);
    $('#closeCustomerModal').addEventListener('click',closeCustomerPicker);
    $('#customerModal').addEventListener('click',e=>{if(e.target===$('#customerModal'))closeCustomerPicker()});
    $('#customerSearch').addEventListener('input',renderCustomerOptions);
    $('#customerModalList').addEventListener('click',e=>{const card=e.target.closest('[data-customer-key]');if(card)chooseCustomerByKey(card.dataset.customerKey)});
    $('#newCustomerBtn').addEventListener('click',()=>chooseCustomerByKey('__new__'));
    $('#saveDriveBtn').addEventListener('click',saveQuoteToDrive);
    window.addEventListener('message',e=>{if(e.data&&e.data.type==='HAIHAHUNG_DRIVE_SAVE_RESULT'){if(e.data.ok)notify(`Đã lưu lên Google Drive: ${e.data.pdfName||'phiếu báo giá'}`);else notify('Không lưu được lên Drive: '+(e.data.error||'Vui lòng kiểm tra cấu hình Apps Script.'));}});
    const mobileMenuBtn=$('#mobileMenuBtn');
    const mobileNavBackdrop=$('#mobileNavBackdrop');
    if(mobileMenuBtn) mobileMenuBtn.addEventListener('click',toggleMobileMenu);
    if(mobileNavBackdrop) mobileNavBackdrop.addEventListener('click',closeMobileMenu);
    $$('#appSidebar .nav-item').forEach(link=>link.addEventListener('click',closeMobileMenu));
    $('#productSearch').addEventListener('input',applyProductFilter);
    $('#includeAccessories').addEventListener('change',()=>{const on=$('#includeAccessories').checked;$('#accessoriesContent').classList.toggle('hidden',!on);$('#accessoryDisabled').classList.toggle('hidden',on);calculate()});
    ['discountAlValue','discountAccValue','vatRate'].forEach(id=>$('#'+id).addEventListener('input',()=>{calculate();saveDraft()}));
    ['discountAlType','discountAccType'].forEach(id=>$('#'+id).addEventListener('change',()=>{calculate();saveDraft()}));
    $('#vatEnabled')?.addEventListener('change',()=>{const enabled=$('#vatEnabled').checked;$('#vatRate').disabled=!enabled;$('#vatRate').closest('.total-line')?.classList.toggle('vat-disabled',!enabled);calculate();saveDraft()});
    $('#oldDebtEnabled')?.addEventListener('change',()=>{calculate();saveDraft();fillOldDebt()});
    ['customerName','customerPhone'].forEach(id=>$('#'+id)?.addEventListener('change',fillOldDebt));
    $('#oldDebtAmount')?.addEventListener('input',()=>{calculate();saveDraft()});
    $('#accessoryRows').addEventListener('change',e=>{const cb=e.target.closest('[data-discount-item]');if(!cb)return;const item=state.accessories.find(x=>x.id===cb.dataset.discountItem);if(item)item.discountEligible=cb.checked;calculate();saveDraft()});
    $('#discountAccessoriesOnly')?.addEventListener('change',calculate);
    ['aluminumRows','accessoryRows'].forEach(id=>$('#'+id).addEventListener('input',e=>{if(e.target.matches('[data-field]')){calculate();saveDraft()}}));
    ['aluminumRows','accessoryRows'].forEach(id=>$('#'+id).addEventListener('click',e=>{const b=e.target.closest('[data-delete]');if(!b)return;const kind=id==='aluminumRows'?'aluminum':'accessories';state[kind]=state[kind].filter(x=>x.id!==b.dataset.delete);renderRows();calculate();saveDraft()}));
    $('#clearAluminumBtn').addEventListener('click',()=>{if(!state.aluminum.length)return;state.aluminum=[];renderRows();calculate();notify('Đã xóa toàn bộ dòng nhôm thanh.')});
    $('#newQuoteBtn').addEventListener('click',newQuote);
    // Tự lưu bản nháp mỗi khi thay đổi trường nhập liệu; reload sẽ khôi phục.
    document.addEventListener('input',e=>{if(e.target.matches('input,textarea,select'))saveDraft()});
    document.addEventListener('change',e=>{if(e.target.matches('input,textarea,select'))saveDraft()});
    $('#saveQuoteBtn').addEventListener('click',saveQuote);
    $('#exportExcelBtn').addEventListener('click',exportQuoteExcel);
    $('#printQuoteBtn').addEventListener('click',()=>{const payload=buildQuotePayload();try{persistQuote(payload);const draftKey='haihahung_quote_print_'+Date.now()+'_'+uid();localStorage.setItem(draftKey,JSON.stringify(payload));localStorage.setItem('haihahung_quote_print',JSON.stringify(payload));window.open('../in-bao-gia/index.html?draftKey='+encodeURIComponent(draftKey),'_blank')}catch(err){notify('Không thể lưu/mở bản in. Hãy kiểm tra dung lượng lưu trữ hoặc cho phép cửa sổ bật lên.')}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePicker();closeCustomerPicker();}if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveQuote();}});
  }
  // Mã khách hàng có thể rỗng hoặc trùng nhau trong customers.json; khi đó dùng chỉ số bản ghi làm khóa ổn định.
  function customerKey(c, i) {
    const id = String(c?.id ?? c?.MaKhachHang ?? '').trim();
    return id ? id : String(i);
  }
  function customerField(c, field) {
    const aliases = { name: ['name', 'TenKhachHang'], phone: ['phone', 'SoDienThoai'], contact: ['contact', 'NguoiLienHe', 'LienHe'], address: ['address', 'DiaChi'], note: ['note', 'Ghichu'] };
    for (const key of (aliases[field] || [field])) {
      const value = c?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  }
  async function loadCustomers() {
    try {
      const res=await fetch(`../../data/customers.json?v=${Date.now()}`,{cache:'no-store'});
      if(!res.ok) throw new Error('HTTP '+res.status);
      const raw=await res.json();
      state.customers=Array.isArray(raw)?raw:(Array.isArray(raw.customers)?raw.customers:[]);
      const select=$('#customerSelect');
      select.innerHTML='<option value="">— Chọn khách hàng trong danh mục —</option><option value="__new__">＋ Nhập khách hàng mới</option>';
      state.customers.forEach((c,i)=>{
        const opt=document.createElement('option');
        opt.value=String(i); opt.textContent=customerField(c,'name')||`Khách hàng ${i+1}`;
        select.insertBefore(opt,select.querySelector('option[value="__new__"]'));
      });
      $('#customerDataStatus').textContent=`Đã tải ${state.customers.length} khách hàng từ Supabase`;
      $('#customerModalStatus').textContent=`${state.customers.length} khách hàng trong danh mục`;
      renderCustomerOptions();
    } catch(err) {
      $('#customerDataStatus').textContent='Chưa tải được danh mục khách hàng. Có thể nhập thông tin khách hàng thủ công.';
      $('#customerModalStatus').textContent='Chưa tải được danh mục khách hàng. Bạn vẫn có thể nhập thủ công.';
      console.warn('Không tải được danh mục khách hàng:',err);
    }
  }
  function openCustomerPicker() {
    $('#customerSearch').value=''; renderCustomerOptions();
    $('#customerModal').classList.remove('hidden');
    setTimeout(()=>$('#customerSearch').focus(),30);
  }
  function closeCustomerPicker(){ $('#customerModal').classList.add('hidden'); }
  function renderCustomerOptions() {
    const q=($('#customerSearch')?.value||'').trim().toLocaleLowerCase('vi');
    const filtered=state.customers.map((c,i)=>({c,key:String(i)})).filter(({c})=>`${customerField(c,'id')} ${customerField(c,'name')} ${customerField(c,'phone')} ${customerField(c,'contact')} ${customerField(c,'address')}`.toLocaleLowerCase('vi').includes(q));
    $('#customerModalList').innerHTML=filtered.length?filtered.map(({c,key})=>`<button type="button" class="catalog-item customer-catalog-item" data-customer-key="${escapeHtml(key)}"><span class="catalog-symbol">♙</span><span class="catalog-info"><strong>${escapeHtml(c.name||'Khách hàng chưa đặt tên')}</strong><small>${escapeHtml([c.id,c.phone,c.contact,c.address].filter(Boolean).join(' · ')||'Chưa có thông tin bổ sung')}</small></span><span class="catalog-price">Chọn ↗</span></button>`).join(''):'<div class="modal-empty">Không tìm thấy khách hàng phù hợp. Hãy thử từ khóa khác hoặc nhập khách hàng mới.</div>';
    $('#customerModalStatus').textContent=`Hiển thị ${filtered.length}/${state.customers.length} khách hàng`;
  }
  function chooseCustomerByKey(key) {
    if(key==='__new__') {
      $('#customerSelect').value='__new__';
      $('#customerName').value='';$('#customerPhone').value='';$('#customerContact').value='';$('#customerAddress').value='';
      $('#selectedCustomerLabel').textContent='＋ Nhập khách hàng mới';
      closeCustomerPicker(); $('#customerName').focus(); return;
    }
    const index=Number(key);
    if(!Number.isInteger(index)||index<0||index>=state.customers.length)return;
    const c=state.customers[index];
    // Dùng chỉ số bản ghi làm khóa duy nhất, tránh trùng/rỗng mã khách hàng.
    $('#customerSelect').value=String(index);
    $('#customerName').value=customerField(c,'name'); $('#customerPhone').value=customerField(c,'phone'); $('#customerContact').value=customerField(c,'contact'); $('#customerAddress').value=customerField(c,'address');
    $('#selectedCustomerLabel').textContent=customerField(c,'name')||'Khách hàng đã chọn';
    closeCustomerPicker(); notify('Đã điền thông tin khách hàng.'); fillOldDebt();
  }
  // Công nợ cũ = công nợ hiện tại của khách (đơn đã xuất kho − hoàn − đã trả), không tính chính báo giá này.
  async function fillOldDebt(){
    if(!$('#oldDebtEnabled')?.checked||!window.HHH?.sb)return;
    const name=$('#customerName').value.trim();if(!name)return;
    const r=await HHH.sb.rpc('quote_old_debt',{p_code:$('#quoteCode').textContent,p_name:name,p_phone:$('#customerPhone').value});
    if(r.error){notify('Không lấy được công nợ: '+r.error.message);return}
    $('#oldDebtAmount').value=String(Math.max(0,Math.round(Number(r.data)||0)));calculate();saveDraft();
    notify('Đã lấy công nợ hiện tại của '+name+': '+money(r.data));
  }
  function selectCustomer() {
    const value=$('#customerSelect').value;
    if(value==='__new__'){chooseCustomerByKey('__new__');return;}
    if(!value)return;
    chooseCustomerByKey(value);
  }
  function toggleMobileMenu() {
    const sidebar=$('#appSidebar'),backdrop=$('#mobileNavBackdrop');
    const open=!sidebar.classList.contains('mobile-open');
    sidebar.classList.toggle('mobile-open',open);
    backdrop.classList.toggle('hidden',!open);
    const menuButton=$('#mobileMenuBtn');
    if(menuButton) menuButton.setAttribute('aria-expanded',String(open));
    document.body.classList.toggle('mobile-menu-open',open);
  }
  function closeMobileMenu() {
    $('#appSidebar').classList.remove('mobile-open');
    const backdrop=$('#mobileNavBackdrop');
    if(backdrop) backdrop.classList.add('hidden');
    const menuButton=$('#mobileMenuBtn');
    if(menuButton) menuButton.setAttribute('aria-expanded','false');
    document.body.classList.remove('mobile-menu-open');
  }
  function applyProductFilter() {
    const q = ($('#productSearch').value||'').trim().toLocaleLowerCase('vi');
    $$('#aluminumRows tr').forEach(tr=>{const item=state.aluminum.find(x=>x.id===tr.dataset.id);tr.style.display=!q||`${item?.code} ${item?.name} ${item?.system} ${item?.color} ${item?.spec}`.toLocaleLowerCase('vi').includes(q)?'':'none'});
  }
  function openPicker(mode) {
    state.mode=mode;
    state.systemFilterValue='';
    $('#modalTitle').textContent=mode==='aluminum'?'Chọn nhôm thanh':'Chọn phụ kiện';
    $('#modalSubtitle').textContent=mode==='aluminum'?'Lọc theo hệ nhôm, sau đó tìm mã hàng hoặc tên thanh.':'Lọc theo hệ/nhóm phụ kiện, sau đó tìm mã hàng hoặc tên phụ kiện.';
    $('#modalSearch').value='';
    $('#modalSystemFilter').value='';
    state.multiSelectKeys.clear();
    $('#multiSelectMode').checked=false;
    $('#addSelectedBtn').classList.add('hidden');
    $('#multiSelectHint').textContent='Bật để chọn nhiều sản phẩm cùng lúc.';
    $('#modalSystemLabel').textContent=mode==='aluminum'?'Lọc theo hệ nhôm':'Lọc theo hệ / nhóm phụ kiện';
    $('#modalSystemFilter').innerHTML='<option value="">'+(mode==='aluminum'?'Tất cả hệ nhôm':'Tất cả hệ / nhóm')+'</option>';
    const source=mode==='aluminum'?state.catalog:state.accessoryCatalog;
    const systems=[...new Set(source.map(x=>String(mode==='aluminum'?x.system:(x.system||x.group)||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi'));
    systems.forEach(system=>{const opt=document.createElement('option');opt.value=system;opt.textContent=system;$('#modalSystemFilter').appendChild(opt)});
    $('#productModal').classList.remove('hidden');
    renderCatalogOptions();
    setTimeout(()=>$('#modalSearch').focus(),30);
  }
  function closePicker(){ $('#productModal').classList.add('hidden'); }
  function catalogItemKey(x) {
    return [x.code||'',x.system||'',x.group||'',x.color||'',x.name||'',x.unit||''].map(v=>String(v).trim()).join('|');
  }
  function updateMultiSelectButton() {
    const button=$('#addSelectedBtn');
    if(button) button.textContent=`Thêm mã đã chọn (${state.multiSelectKeys.size})`;
    if(button) button.disabled=state.multiSelectKeys.size===0;
  }
  function addSelectedCatalogItems() {
    const source=state.mode==='aluminum'?state.catalog:state.accessoryCatalog;
    const selected=source.filter(x=>state.multiSelectKeys.has(catalogItemKey(x)));
    if(!selected.length)return;
    selected.forEach(addCatalogItem);
    const count=selected.length;
    closePicker();
    notify(`Đã thêm ${count} mã ${state.mode==='aluminum'?'nhôm':'phụ kiện'} vào báo giá.`);
  }
  function renderCatalogOptions() {
    const source=state.mode==='aluminum'?state.catalog:state.accessoryCatalog;
    const multi=$('#multiSelectMode').checked;
    const q=$('#modalSearch').value.trim().toLocaleLowerCase('vi');
    const system=$('#modalSystemFilter').value;
    const filtered=source.filter(x=>{
      const category=String(state.mode==='aluminum'?x.system:(x.system||x.group)||'').trim();
      const matchesSystem=!system||category===system;
      const text=`${x.code} ${x.name} ${x.group} ${x.system} ${x.color} ${x.unit} ${x.weight ?? ''}`.toLocaleLowerCase('vi');
      return matchesSystem&&(!q||text.includes(q));
    }).slice(0,250);
    const host=$('#modalList');
    if(!filtered.length){host.innerHTML='<div class="modal-empty">Không tìm thấy sản phẩm phù hợp với bộ lọc. Hãy thử hệ/nhóm khác hoặc từ khóa ngắn hơn.</div>';}
    else if(multi) {
      host.innerHTML=filtered.map(x=>{
        const key=catalogItemKey(x),checked=state.multiSelectKeys.has(key);
        return `<label class="catalog-item catalog-item-multi${checked?' is-selected':''}"><input class="multi-item-check" type="checkbox" data-key="${escapeHtml(key)}" ${checked?'checked':''} /><span class="catalog-symbol">${state.mode==='aluminum'?'▤':'⚙'}</span><span class="catalog-info"><strong>${escapeHtml(x.name||'Sản phẩm')}</strong><small>${escapeHtml(x.code||'')} · ${escapeHtml(x.system||x.group||x.unit||'')}${x.color?' · '+escapeHtml(x.color):''}${state.mode==='aluminum'&&x.weight!==''&&x.weight!==undefined?' · '+escapeHtml(formatWeight(x.weight))+' kg/thanh':''}</small></span><span class="catalog-price">${money(x.price||0)}</span></label>`;
      }).join('');
    } else {
      host.innerHTML=filtered.map((x,i)=>`<button class="catalog-item" data-catalog-index="${i}" type="button"><span class="catalog-symbol">${state.mode==='aluminum'?'▤':'⚙'}</span><span class="catalog-info"><strong>${escapeHtml(x.name||'Sản phẩm')}</strong><small>${escapeHtml(x.code||'')} · ${escapeHtml(x.system||x.group||x.unit||'')}${x.color?' · '+escapeHtml(x.color):''}${state.mode==='aluminum'&&x.weight!==''&&x.weight!==undefined?' · '+escapeHtml(formatWeight(x.weight))+' kg/thanh':''}</small></span><span class="catalog-price">${money(x.price||0)}</span></button>`).join('');
      $$('.catalog-item',host).forEach((btn,i)=>btn.addEventListener('click',()=>{addCatalogItem(filtered[i]);closePicker()}));
    }
    updateMultiSelectButton();
    $('#catalogStatus').textContent=state.catalogLoaded?`Đang hiển thị ${filtered.length} sản phẩm phù hợp · ${state.catalog.length} mã nhôm · ${state.accessoryCatalog.length} mã phụ kiện.`:'Chưa tải được danh mục. Hãy chạy ứng dụng qua máy chủ web hoặc nhập thủ công.';
  }
  function addCatalogItem(x) {
    if(state.mode==='aluminum') {
      const weight=Number(x.weight)||0;
      state.aluminum.push({id:uid(),code:x.code||'',name:x.name||'Nhôm thanh',system:x.system||'',color:x.color||'',weight, spec:weight?`${formatWeight(weight)} kg/thanh`:(x.spec||''),qty:1,unit:x.unit||'Thanh',price:Number(x.price)||0});
    } else {
      state.accessories.push({id:uid(),code:x.code||'',name:x.name||'Phụ kiện',system:x.system||'',group:x.group||x.system||'',qty:1,unit:x.unit||'Cái',price:Number(x.price)||0});
    }
    if(state.mode==='accessory'&&!$('#includeAccessories').checked){$('#includeAccessories').checked=true;$('#includeAccessories').dispatchEvent(new Event('change'))}
    renderRows();calculate();notify('Đã thêm sản phẩm vào báo giá.');
  }
  function formatWeight(value) { return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:4}).format(Number(value)||0); }
  function addManualProduct() {
    const isAl=state.mode==='aluminum';const code=prompt('Nhập mã hàng (có thể để trống):','');if(code===null)return;
    const name=prompt('Nhập tên sản phẩm:',isAl?'Thanh nhôm mới':'Phụ kiện mới');if(!name?.trim())return;
    const priceRaw=prompt('Nhập đơn giá (VND):','0');if(priceRaw===null)return;const price=Math.max(0,Number(priceRaw.replace(/[,.\s]/g,''))||0);
    addCatalogItem({code:code.trim(),name:name.trim(),price,unit:isAl?'Thanh':'Cái',color:'Màu tiêu chuẩn',spec:'',group:'Phụ kiện cửa'});
  }
  async function loadCatalog() {
    // Tải độc lập từng danh mục để lỗi một tệp không làm mất cả hai danh sách.
    async function fetchFirstAvailable(paths) {
      let lastError = null;
      for (const path of paths) {
        try {
          const res = await fetch(`${path}?v=${Date.now()}`, {cache:'no-store'});
          if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
          return await res.json();
        } catch (err) { lastError = err; }
      }
      throw lastError || new Error('Không tìm thấy tệp dữ liệu.');
    }
    const [alResult, pkResult] = await Promise.allSettled([
      fetchFirstAvailable(['../../data/nhomthanh.json']),
      fetchFirstAvailable(['../../data/phukien.json', '../../data/phukien(1).json'])
    ]);
    const errors = [];
    if (alResult.status === 'fulfilled') {
      const raw = alResult.value;
      const rows = Array.isArray(raw) ? raw : (Array.isArray(raw.Data) ? raw.Data : []);
      state.catalog = normaliseRows(rows, 'aluminum');
    } else {
      state.catalog = [];
      errors.push('nhomthanh.json');
      console.error('Không tải được danh mục nhôm:', alResult.reason);
    }
    if (pkResult.status === 'fulfilled') {
      const raw = pkResult.value;
      const rows = Array.isArray(raw) ? raw : (Array.isArray(raw.Data) ? raw.Data : []);
      state.accessoryCatalog = normaliseRows(rows, 'accessory');
    } else {
      state.accessoryCatalog = [];
      errors.push('phukien.json hoặc phukien(1).json');
      console.error('Không tải được danh mục phụ kiện:', pkResult.reason);
    }
    state.catalogLoaded = state.catalog.length > 0 || state.accessoryCatalog.length > 0;
    renderCatalogOptions();
    if (errors.length) {
      $('#catalogStatus').textContent = `Đã tải một phần dữ liệu. Không tải được: ${errors.join(', ')}. Hãy kiểm tra tên tệp và thư mục.`;
    } else {
      $('#catalogStatus').textContent = `Đã tải ${state.catalog.length} mã nhôm và ${state.accessoryCatalog.length} mã phụ kiện.`;
    }
  }
  function normaliseRows(rows, kind) {
    if(!Array.isArray(rows)) return [];
    if(kind==='aluminum') return rows.map(r=>({
      code:String(r['Mã Hàng hóa'] ?? ''),
      name:String(r['Tên Hàng hóa'] ?? ''),
      system:String(r['Hệ Nhôm'] ?? ''),
      color:String(r['Màu'] ?? ''),
      weight:Number(r['Khối lượng (kg/thanh)']) || 0,
      unit:String(r['ĐVT'] ?? 'Thanh').trim() || 'Thanh',
      price:Number(r['Đơn giá']) || 0,
      spec:''
    })).filter(x=>x.code||x.name);
    return rows.map(r=>({
      code:String(r.code ?? ''),
      name:String(r.name ?? ''),
      system:String(r.system ?? ''),
      group:String(r.grp ?? r.system ?? ''),
      unit:String(r.unit ?? 'Cái').trim() || 'Cái',
      price:Number(r.price) || 0,
      color:'', weight:'', spec:''
    })).filter(x=>x.code||x.name);
  }
  function newQuote() {
    if(!confirm('Tạo phiếu báo giá mới? Các dòng hiện tại sẽ được làm mới.'))return;
    state.aluminum=[];state.accessories=[];renderRows();$('#customerSelect').value='';$('#selectedCustomerLabel').textContent='— Chọn khách hàng trong danh mục —';$('#customerName').value='';$('#customerPhone').value='';$('#customerContact').value='';$('#customerAddress').value='';$('#quoteNotes').value='';$('#discountAlValue').value='0';$('#discountAccValue').value='0';$('#discountAlType').value='percent';$('#discountAccType').value='percent';$('#vatRate').value='8';if($('#oldDebtEnabled'))$('#oldDebtEnabled').checked=false;if($('#oldDebtAmount'))$('#oldDebtAmount').value='0';if($('#vatEnabled')){$('#vatEnabled').checked=false;$('#vatRate').disabled=true;}$('#includeAccessories').checked=true;$('#includeAccessories').dispatchEvent(new Event('change'));
    const seq=String(Date.now()).slice(-3);$('#quoteCode').textContent=`BG-${String(today.getFullYear()).slice(-2)}${pad(today.getMonth()+1)}${pad(today.getDate())}-${seq}`;calculate();saveDraft();notify('Đã tạo phiếu báo giá mới.');
  }
  function buildQuotePayload() {
    const sums=calculate();
    return {company:{name:'CÔNG TY TNHH KINH DOANH TỔNG HỢP HẢI HÀ HƯNG'},quote:{code:$('#quoteCode').textContent,date:fmtDateISO(new Date()),validityDays:Number($('#validity').value)||15,salesperson:$('#salesperson').value},customer:{name:$('#customerName').value.trim(),phone:$('#customerPhone').value,contact:$('#customerContact').value,address:$('#customerAddress').value},aluminum:state.aluminum.map(x=>({...x})),accessoriesIncluded:$('#includeAccessories').checked,accessories:state.accessories.map(x=>({...x})),discount:{aluminum:{type:$('#discountAlType').value,value:Number($('#discountAlValue').value)||0,amount:sums.discountAl},accessories:{type:$('#discountAccType').value,value:Number($('#discountAccValue').value)||0,amount:sums.discountAccessories},type:'split',value:0,amount:sums.discount,selectedAccessoryIds:state.accessories.filter(x=>x.discountEligible).map(x=>x.id)},vatEnabled:$('#vatEnabled')?.checked===true,vatRate:$('#vatEnabled')?.checked?(Number($('#vatRate').value)||0):0,oldDebtEnabled:$('#oldDebtEnabled')?.checked===true,oldDebt:$('#oldDebtEnabled')?.checked?Math.max(0,Number($('#oldDebtAmount')?.value)||0):0,totals:sums,notes:$('#quoteNotes').value,deliveryTime:$('#deliveryTime').value,paymentTerms:$('#paymentTerms').value,savedAt:new Date().toISOString()};
  }

  window.__hhhPayload=buildQuotePayload;
  // Xuất workbook Excel XML (SpreadsheetML 2003): không phụ thuộc CDN/thư viện ngoài,
  // tải trực tiếp về máy và mở được bằng Microsoft Excel/LibreOffice.
  function exportQuoteExcel() {
    try {
      const p = buildQuotePayload();
      const q = p.quote || {}, c = p.customer || {}, t = p.totals || {};
      const n = v => Number(v) || 0;
      const fmtDate = v => { if (!v) return ''; const d = new Date(v + (String(v).length === 10 ? 'T00:00:00' : '')); return Number.isNaN(d.getTime()) ? String(v) : dateString(d); };
      const escXml = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
      const cell = (value, type) => `<Cell><Data ss:Type="${type || (typeof value === 'number' ? 'Number' : 'String')}">${escXml(value)}</Data></Cell>`;
      const row = values => `<Row>${values.map(v => Array.isArray(v) ? cell(v[0],v[1]) : cell(v)).join('')}</Row>`;
      const sheet = (name, rows) => `<Worksheet ss:Name="${escXml(name)}"><Table>${rows.join('')}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>`;
      const al = Array.isArray(p.aluminum) ? p.aluminum : [];
      const ac = p.accessoriesIncluded === false ? [] : (Array.isArray(p.accessories) ? p.accessories : []);
      // Sheet Nhôm thanh: bổ sung cột M (tên khách hàng) và N (ngày báo giá).
      // Lặp lại thông tin trên từng dòng để dễ lọc, sắp xếp và xử lý dữ liệu trong Google Sheets.
      const customerName = c.name || '';
      const quoteDate = fmtDate(q.date || new Date().toISOString().slice(0,10));
      const alRows = [row(['STT','Hệ','Mã hàng','Tên hàng','Màu sắc','Quy cách','ĐVT','Số lượng','Kg/thanh','Tổng khối lượng (kg)','Đơn giá (đ/kg)','Thành tiền (đ)','Tên khách hàng','Ngày tháng năm'])];
      al.forEach((x,i) => alRows.push(row([[i+1,'Number'],x.system||'',x.code||'',x.name||'',x.color||'',x.spec||'',x.unit||'Thanh',[n(x.qty),'Number'],[n(x.weight),'Number'],[n(x.qty)*n(x.weight),'Number'],[n(x.price),'Number'],[n(x.qty)*n(x.weight)*n(x.price),'Number'],customerName,quoteDate])));
      const acRows = [row(['STT','Mã hàng','Tên phụ kiện','Nhóm phụ kiện','ĐVT','Số lượng','Đơn giá (đ)','Thành tiền gốc (đ)','Chiết khấu riêng (%)','Tiền chiết khấu riêng (đ)','Được xét CK chung','Thành tiền sau CK riêng (đ)'])];
      ac.forEach((x,i) => { const gross=n(x.qty)*n(x.price), pct=Math.min(100,Math.max(0,n(x.discountPercent))), itemDiscount=gross*pct/100, commonEligible=!!x.discountEligible && pct===0 && p.accessoriesIncluded!==false; acRows.push(row([[i+1,'Number'],x.code||'',x.name||'',x.group||x.spec||'',x.unit||'Cái',[n(x.qty),'Number'],[n(x.price),'Number'],[gross,'Number'],[pct,'Number'],[itemDiscount,'Number'],commonEligible?'Có':'Không',[gross-itemDiscount,'Number']])); });
      // Sheet tổng hợp: gộp nhôm thanh và phụ kiện vào một bảng phẳng, dễ lọc/in/đưa vào Google Sheets.
      // Với nhôm, đơn giá theo ĐVT Thanh được quy đổi từ đơn giá/kg x kg/thanh để khớp thành tiền.
      const consolidatedRows = [row(['Khách hàng','Ngày tháng năm','STT','Tên (nhôm / phụ kiện)','Đơn vị tính','Đơn giá (đ)','Số lượng','Thành tiền (đ)'])];
      let consolidatedIndex = 1;
      al.forEach(x => {
        const qty=n(x.qty), weight=n(x.weight), pricePerKg=n(x.price);
        const unitPrice=weight*pricePerKg;
        consolidatedRows.push(row([customerName,quoteDate,[consolidatedIndex++,'Number'],x.name||x.code||'',x.unit||'Thanh',[unitPrice,'Number'],[qty,'Number'],[qty*unitPrice,'Number']]));
      });
      const commonEligibleAccessories = ac.filter(x => !!x.discountEligible && Math.min(100,Math.max(0,n(x.discountPercent)))===0);
      const commonEligibleBase = commonEligibleAccessories.reduce((sum,x)=>sum+n(x.qty)*n(x.price),0);
      const commonDiscountTotal = Math.min(commonEligibleBase, Math.max(0,n(p.discount?.accessories?.amount ?? t.discountAccessories)));
      ac.forEach(x => {
        const qty=n(x.qty), price=n(x.price), pct=Math.min(100,Math.max(0,n(x.discountPercent)));
        const gross=qty*price;
        const privateDiscount=gross*pct/100;
        const commonDiscountEligible=!!x.discountEligible && pct===0 && p.accessoriesIncluded!==false;
        // Phân bổ chiết khấu chung theo tỷ trọng giá trị từng phụ kiện đủ điều kiện,
        // để tổng các dòng trong sheet Tổng hợp khớp với tổng thanh toán.
        const allocatedCommonDiscount=commonDiscountEligible && commonEligibleBase>0 ? commonDiscountTotal*(gross/commonEligibleBase) : 0;
        const amount=Math.max(0,gross-privateDiscount-allocatedCommonDiscount);
        consolidatedRows.push(row([customerName,quoteDate,[consolidatedIndex++,'Number'],x.name||x.code||'',x.unit||'Cái',[qty ? amount/qty : price,'Number'],[qty,'Number'],[amount,'Number']]));
      });
      const summaryRows = [
        row(['PHIẾU BÁO GIÁ - HẢI HÀ HƯNG']),
        row(['Công ty',p.company?.name||'CÔNG TY TNHH KINH DOANH TỔNG HỢP HẢI HÀ HƯNG']),
        row(['Số báo giá',q.code||'']), row(['Ngày báo giá',fmtDate(q.date)]),
        row(['Khách hàng',c.name||'']), row(['Điện thoại',c.phone||'']),
        row(['Người liên hệ',c.contact||'']), row(['Địa chỉ',c.address||'']),
        row(['Nhân viên phụ trách',q.salesperson||'']), row(['Hiệu lực (ngày)',[n(q.validityDays),'Number']]),
        row(['Tổng nhôm thanh (đ)',[n(t.aluminumTotal),'Number']]),
        row(['Tổng phụ kiện (đ)',[p.accessoriesIncluded===false?0:n(t.accessoryTotal),'Number']]),
        row(['Tạm tính (đ)',[n(t.subtotal),'Number']]),
        row(['Chiết khấu nhôm (đ)',[n(p.discount?.aluminum?.amount ?? t.discountAl),'Number']]),
        row(['Chiết khấu phụ kiện chung (đ)',[n(p.discount?.accessories?.amount ?? t.discountAccessories),'Number']]),
        row(['Tổng chiết khấu (đ)',[n(p.discount?.amount ?? t.discount),'Number']]),
        row(['VAT (%)',[n(p.vatRate),'Number']]), row(['Tiền VAT (đ)',[n(t.vat),'Number']]),
        row(['Công nợ cũ (đ)',[p.oldDebtEnabled?n(p.oldDebt):0,'Number']]),
        row(['TỔNG THANH TOÁN (đ)',[n(t.grand),'Number']]),
        row(['Thời gian giao hàng',p.deliveryTime||'']), row(['Điều khoản thanh toán',p.paymentTerms||'']),
        row(['Ghi chú',p.notes||''])
      ];
      const paymentRows = [
        row(['Nội dung','Giá trị']),
        row(['Tổng nhôm thanh (đ)',[n(t.aluminumTotal),'Number']]),
        row(['Tổng phụ kiện (đ)',[p.accessoriesIncluded===false?0:n(t.accessoryTotal),'Number']]),
        row(['Tạm tính (đ)',[n(t.subtotal),'Number']]),
        row(['Chiết khấu nhôm (đ)',[n(p.discount?.aluminum?.amount ?? t.discountAl),'Number']]),
        row(['Chiết khấu phụ kiện chung (đ)',[n(p.discount?.accessories?.amount ?? t.discountAccessories),'Number']]),
        row(['Tổng chiết khấu (đ)',[n(p.discount?.amount ?? t.discount),'Number']]),
        row(['Thuế VAT (%)',[n(p.vatRate),'Number']]),
        row(['Tiền VAT (đ)',[n(t.vat),'Number']]),
        row(['Công nợ cũ (đ)',[p.oldDebtEnabled?n(p.oldDebt):0,'Number']]),
        row(['TỔNG THANH TOÁN (đ)',[n(t.grand),'Number']])
      ];
      const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40"><Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/></Style></Styles>${sheet('Tổng hợp',consolidatedRows)}${sheet('Báo giá',summaryRows)}${sheet('Nhôm thanh',alRows)}${sheet('Phụ kiện',acRows)}${sheet('Thanh toán',paymentRows)}</Workbook>`;
      const blob = new Blob(['\ufeff',xml],{type:'application/vnd.ms-excel;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download=`${(q.code||'Bao_gia_Hai_Ha_Hung').replace(/[^\w.-]+/g,'_')}.xls`;
      a.style.display='none'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1500);
      notify('Đã xuất file Excel báo giá. Kiểm tra thư mục Tải xuống (Downloads).');
    } catch (err) {
      console.error('Export Excel error:',err);
      notify('Xuất Excel chưa thành công. Vui lòng thử lại hoặc kiểm tra quyền tải xuống của trình duyệt.');
    }
  }

  const DRAFT_KEY='haihahung_quote_draft_v1';
  function saveDraft(){try{const payload=buildQuotePayload();localStorage.setItem(DRAFT_KEY,JSON.stringify(payload));}catch(e){console.warn('Không thể lưu bản nháp',e)}}
  function applyQuotePayload(p){
    if(!p)return;
    const q=p.quote||{},c=p.customer||{},d=p.discount||{};
    $('#quoteCode').textContent=q.code||$('#quoteCode').textContent;
    $('#customerName').value=c.name||'';$('#customerPhone').value=c.phone||'';$('#customerContact').value=c.contact||'';$('#customerAddress').value=c.address||'';
    $('#salesperson').value=q.salesperson||$('#salesperson').value;$('#validity').value=String(q.validityDays||15);
    $('#quoteNotes').value=p.notes??$('#quoteNotes').value;$('#deliveryTime').value=p.deliveryTime||'Theo thỏa thuận';$('#paymentTerms').value=p.paymentTerms||'Theo thỏa thuận';
    $('#discountAlValue').value=String(d.aluminum?.value??(d.type==='split'?0:d.value??0));$('#discountAlType').value=d.aluminum?.type||(d.type==='split'?'percent':d.type||'percent');
    $('#discountAccValue').value=String(d.accessories?.value??0);$('#discountAccType').value=d.accessories?.type||'percent';
    $('#vatEnabled').checked=p.vatEnabled===true;$('#vatRate').value=String(p.vatRate??8);$('#vatRate').disabled=!$('#vatEnabled').checked;
    $('#oldDebtEnabled').checked=p.oldDebtEnabled===true;$('#oldDebtAmount').value=String(p.oldDebt??0);
    $('#includeAccessories').checked=p.accessoriesIncluded!==false;
    state.aluminum=(p.aluminum||[]).map(x=>({...x,id:x.id||uid()}));state.accessories=(p.accessories||[]).map(x=>({...x,id:x.id||uid()}));
    renderRows();$('#includeAccessories').dispatchEvent(new Event('change'));calculate();
  }
  function restoreDraft(){
    try{const params=new URLSearchParams(location.search);const code=params.get('edit');let payload=null;
      if(code){const history=JSON.parse(localStorage.getItem('haihahung_quote_history')||'[]');payload=history.find(x=>x.quote?.code===code);if(payload){localStorage.setItem(DRAFT_KEY,JSON.stringify(payload));}}
      if(!payload)payload=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');
      if(payload){applyQuotePayload(payload);if(code)notify('Đã mở báo giá đã lưu: '+code);}
    }catch(e){console.warn('Không thể khôi phục bản nháp',e)}
  }

  function persistQuote(payload) {
    const key='haihahung_quote_history';
    const history=JSON.parse(localStorage.getItem(key)||'[]');
    const record={...payload,savedAt:new Date().toISOString()};
    const idx=history.findIndex(x=>x.quote?.code===record.quote?.code);
    if(idx>=0) history[idx]=record; else history.unshift(record);
    localStorage.setItem(key,JSON.stringify(history));
    window.HHH&&HHH.saveQuote(record).catch(e=>notify('Chưa lưu lên hệ thống: '+(e.message||e)));
  }
  function saveQuote() {
    const payload=buildQuotePayload();
    if(!payload.customer.name){$('#customerName').focus();notify('Vui lòng nhập tên khách hàng trước khi lưu.');return;}
    try { persistQuote(payload); localStorage.setItem(DRAFT_KEY,JSON.stringify(payload)); const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${payload.quote.code}.json`;a.click();URL.revokeObjectURL(a.href);notify('Đã lưu báo giá vào Lịch sử báo giá và xuất tệp JSON.'); }
    catch(err){notify('Không thể lưu báo giá. Hãy kiểm tra dung lượng lưu trữ trình duyệt.');}
  }
  function saveQuoteToDrive() {
    const payload=buildQuotePayload();
    if(!payload.customer.name){$('#customerName').focus();notify('Vui lòng nhập tên khách hàng trước khi lưu lên Drive.');return;}
    let endpoint=localStorage.getItem('haihahung_drive_webapp_url')||'';
    let driveToken=localStorage.getItem('haihahung_drive_save_token')||'';
    if(!endpoint) {
      endpoint=prompt('Dán URL Web App Google Apps Script đã triển khai (kết thúc bằng /exec):','');
      if(!endpoint)return;
      endpoint=endpoint.trim();
      if(!/^https:\/\/script\.google\.com\/macros\/s\/[^\s]+\/exec(?:\?.*)?$/.test(endpoint)) {notify('URL Apps Script chưa đúng. URL cần bắt đầu bằng https://script.google.com/macros/s/ và kết thúc bằng /exec.');return;}
      localStorage.setItem('haihahung_drive_webapp_url',endpoint);
    }
    if(!driveToken){driveToken=prompt('Nhập mã xác thực SAVE_TOKEN đã cấu hình trong Apps Script (khuyến nghị bắt buộc):','')||'';if(!driveToken)return;localStorage.setItem('haihahung_drive_save_token',driveToken);}
    try {
      const frame=$('#driveSaveFrame');
      const form=document.createElement('form');form.method='POST';form.action=endpoint;form.target=frame.name;form.style.display='none';
      const field=document.createElement('input');field.type='hidden';field.name='payload';field.value=JSON.stringify(payload);form.appendChild(field);
      const tokenField=document.createElement('input');tokenField.type='hidden';tokenField.name='token';tokenField.value=driveToken;form.appendChild(tokenField);
      document.body.appendChild(form);form.submit();form.remove();
      notify('Đã gửi báo giá lên Google Drive. Chờ xác nhận từ Apps Script…');
    } catch(err) { notify('Không thể gửi báo giá lên Drive. Hãy kiểm tra URL Web App.'); }
  }
  function notify(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.classList.remove('show'),3300)}
  init();
})();
