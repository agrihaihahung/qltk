/* =================== ĐỀ XUẤT ĐẶT HÀNG + ĐƠN ĐẶT HÀNG =================== */
const PO={sup:'',allOut:false,q:{},on:new Set(),qs:'',ft:'',fs:'',fc:'',st:'need',tab:'sug',orders:undefined,hisSt:''};
const POST={ordered:'Đã đặt',received:'Đã nhận hàng',cancelled:'Đã hủy'};
const supOf=i=>(S.sup||[]).find(s=>sid(s.id)===sid(i.supplier_id));
const poBase=i=>PO.st==='all'||(PO.st==='low'?low(i):PO.st==='out'?isOut(i):(low(i)||(isOut(i)&&(PO.allOut||Number(i.min)>0))));
function poOpen(){const m=new Map();(PO.orders||[]).filter(o=>o.status==='ordered').forEach(o=>(o.lines||[]).forEach(l=>m.set(sid(l.item_id),(m.get(sid(l.item_id))||0)+Number(l.qty||0))));return m}
const poMk=(i,op)=>({i,sp:supOf(i),open:op.get(sid(i.id))||0,qty:PO.q[sid(i.id)]??Math.max(1,Math.ceil((i.min>0?i.min:LOW_LIMIT)*3-i.qty)),on:PO.on.has(sid(i.id))});
function poRows(){const op=poOpen(),q=PO.qs.toLowerCase();
  return S.items.filter(i=>poBase(i)&&(!PO.ft||i.type===PO.ft)&&(!PO.fs||sysOf(i)===PO.fs)&&(!PO.fc||(PO.fc==='__none'?!i.fin:i.fin===PO.fc))&&(!q||[i.code,i.name,i.spec,i.fin].join(' ').toLowerCase().includes(q))).map(i=>poMk(i,op))}
const poSel=()=>{const op=poOpen();return S.items.filter(i=>PO.on.has(sid(i.id))).map(i=>poMk(i,op))};
const poKey=x=>x.sp?sid(x.sp.id):'none';
function poGroupsOf(rows,f){const m=new Map();
  rows.filter(x=>!f||poKey(x)===f).forEach(x=>{const k=poKey(x);if(!m.has(k))m.set(k,[]);m.get(k).push(x)});
  const nm=k=>k==='none'?'\uffff':(S.sup.find(s=>sid(s.id)===k)||{name:''}).name;
  return [...m.entries()].sort((a,b)=>nm(a[0]).localeCompare(nm(b[0]),'vi'))}
const poGroups=()=>poGroupsOf(poRows(),PO.sup);
const poDraft=()=>poGroupsOf(poSel().filter(x=>x.qty>0));
async function loadPO(){const r=await sb.from('purchase_orders').select('*').order('id',{ascending:false}).limit(300);PO.orders=r.error?null:r.data}
function poFacets(){
  const base=S.items.filter(i=>!PO.ft||i.type===PO.ft);
  const cnt=f=>{const m=new Map();base.forEach(i=>{const k=f(i);if(k)m.set(k,(m.get(k)||0)+1)});return[...m].sort((a,b)=>a[0].localeCompare(b[0],'vi'))};
  const fill=(el,cur,all,rows,extra)=>{el.innerHTML='<option value="">'+all+'</option>'+rows.map(([k,n])=>`<option value="${esc(k)}">${esc(k)} (${n})</option>`).join('')+(extra||'');el.value=[...el.options].some(o=>o.value===cur)?cur:''};
  $('#poFt').innerHTML='<option value="">Tất cả loại</option>'+TYPES.map(x=>`<option>${x}</option>`).join('');$('#poFt').value=PO.ft;
  fill($('#poFs'),PO.fs,'Tất cả hệ nhôm',cnt(sysOf));PO.fs=$('#poFs').value;
  const none=base.filter(i=>!i.fin).length;
  fill($('#poFc'),PO.fc,'Tất cả màu',cnt(i=>i.fin),none?`<option value="__none">(Không có màu) (${none})</option>`:'');PO.fc=$('#poFc').value;
  $('#poFilt').innerHTML='<option value="">Tất cả nhà cung cấp</option><option value="none">Chưa có nhà cung cấp</option>'+S.sup.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');$('#poFilt').value=PO.sup;
  $('#poSt').value=PO.st;$('#poOut').checked=PO.allOut;$('#poOut').disabled=PO.st!=='need';
  $('#poReset').hidden=!(PO.qs||PO.ft||PO.fs||PO.fc||PO.sup||PO.st!=='need');
}
function renderPO(){
  $('#poErr').hidden=S.sup!==null;
  const sug=PO.tab==='sug';$('#poSug').hidden=!sug||S.sup===null;$('#poHis').hidden=sug;
  document.querySelectorAll('#poTabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===PO.tab));
  $('#poHisN').textContent=PO.orders&&PO.orders.length?'('+PO.orders.length+')':'';
  const sel=S.sup===null?[]:poSel();$('#poMake').textContent='Tạo đơn đặt hàng'+(sel.length?' ('+sel.length+')':'');
  if(!sug)renderPOHis();
  if(S.sup===null){$('#poGroups').innerHTML='';return}
  poFacets();
  const gs=poGroups(),shown=gs.flatMap(g=>g[1]),tot=sel.reduce((a,x)=>a+x.qty*x.i.price,0);
  $('#poSum').innerHTML=shown.length+' mã đang hiện · <span class="po-sel">'+sel.length+' mã đã chọn</span>'+(tot?' · ước tính '+fmt(tot)+' đ':'');
  $('#poGroups').innerHTML=gs.length?gs.map(([k,rows])=>{
    const sp=k==='none'?null:S.sup.find(s=>sid(s.id)===k),on=rows.filter(x=>x.on),tot=on.reduce((a,x)=>a+x.qty*x.i.price,0);
    return `<div class="pog"><div class="pog-h"><div><b>${sp?esc(sp.name):'Chưa có nhà cung cấp'}</b><small>${sp&&sp.phone?esc(sp.phone)+' · ':''}${on.length}/${rows.length} mã được chọn${tot?' · ước tính '+fmt(tot)+' đ':''}${sp?'':' · chọn nhà cung cấp ở cột cuối để gom đơn'}</small></div>
    <div class="acts"><button class="sm" data-po="copy" data-k="${esc(k)}"${on.length?'':' disabled'}>Sao chép tin Zalo</button>${sp&&sp.phone?`<button class="sm btn-out" data-po="zalo" data-k="${esc(k)}">Mở Zalo</button>`:''}<button class="sm" data-po="xls" data-k="${esc(k)}"${on.length?'':' disabled'}>Tải Excel</button></div></div>
    <div class="wrap" style="border:0;border-radius:0"><table style="min-width:760px"><thead><tr><th><input type="checkbox" class="pca" data-k="${esc(k)}" aria-label="Chọn cả nhóm"${on.length===rows.length?' checked':''}></th><th>Mã / Tên</th><th class="num">Tồn</th><th class="num">Tối thiểu</th><th class="num">Gợi ý đặt</th><th>Nhà cung cấp</th></tr></thead><tbody>${rows.map(x=>`<tr><td><input type="checkbox" class="pc" data-id="${esc(x.i.id)}"${x.on?' checked':''}></td>
    <td><div class="n2">${esc(x.i.name)}</div><small><code>${esc(x.i.code)}</code>${x.i.fin?' · '+esc(x.i.fin):''}</small></td><td class="num">${fmt(x.i.qty)} ${esc(x.i.unit)}${x.open?`<small class="po-open">Đang đặt ${fmt(x.open)}</small>`:''}</td><td class="num">${fmt(x.i.min)}</td>
    <td class="num">${fmt(x.qty)} ${esc(x.i.unit)}</td>
    <td><select class="ps" data-id="${esc(x.i.id)}"><option value="">— chọn —</option>${S.sup.map(s=>`<option value="${esc(s.id)}"${x.sp&&sid(x.sp.id)===sid(s.id)?' selected':''}>${esc(s.name)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div></div>`}).join('')
    :'<div class="empty">Không có mã nào khớp bộ lọc. Chọn “Tất cả vật tư” ở ô tình trạng nếu muốn đặt cả mã còn đủ hàng.</div>';
}
function poMsg(sp,rows){
  return 'Chào '+(sp?sp.name:'anh/chị')+', bên Hải Hà Hưng muốn đặt hàng ngày '+new Date().toLocaleDateString('vi-VN')+':\n'
   +rows.map((x,n)=>(n+1)+'. '+x.i.code+' - '+x.i.name+(x.i.fin?' ('+x.i.fin+')':'')+': '+fmt(x.qty)+' '+x.i.unit).join('\n')+'\nNhờ anh/chị báo giá và thời gian giao hàng giúp em. Cảm ơn!';
}
async function copyText(t){try{await navigator.clipboard.writeText(t)}catch(e){const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove()}}
function poXlsx(keys){
  const wb=XLSX.utils.book_new(),hd=['STT','Mã','Tên vật tư','Màu / bề mặt','Đơn vị','Tồn hiện tại','Số lượng đặt','Đơn giá nhập','Thành tiền','Nhà cung cấp','Hệ nhôm','Kg/thanh','Khối lượng (kg)'],used=new Set();
  const sheet=(rows,name)=>{const ws=XLSX.utils.aoa_to_sheet([hd].concat(rows.map((x,n)=>[n+1,x.i.code,x.i.name,x.i.fin||'',x.i.unit,x.i.qty,x.qty,x.i.price||'',x.i.price?x.qty*x.i.price:'',x.sp?x.sp.name:'',sysOf(x.i)||'',Number(x.i.weight_kg)||'',(Number(x.i.weight_kg)||0)*x.qty||''])));
    ws['!cols']=[{wch:5},{wch:18},{wch:50},{wch:16},{wch:8},{wch:11},{wch:12},{wch:13},{wch:14},{wch:22}];
    let n=name.replace(/[\\\/?*\[\]:]/g,' ').slice(0,28)||'Sheet',u=n,c=2;while(used.has(u))u=n+' '+c++;used.add(u);XLSX.utils.book_append_sheet(wb,ws,u)};
  const gs=poGroupsOf(poSel().filter(x=>x.qty>0)).filter(g=>!keys||keys.includes(g[0]));
  if(!gs.length){toast('Chưa chọn mã nào để đặt.');return}
  if(!keys||gs.length>1)sheet(gs.flatMap(g=>g[1]),'Tất cả');
  gs.forEach(g=>sheet(g[1],g[0]==='none'?'Chưa có NCC':g[1][0].sp.name));
  XLSX.writeFile(wb,'de-xuat-dat-hang-'+new Date().toISOString().slice(0,10)+'.xlsx');
}
/* ----- Đơn đặt hàng: tạo, lưu, in ----- */
const isoToday=()=>new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
const poD=s=>s?new Date(s+'T00:00:00').toLocaleDateString('vi-VN'):'……………';
function poBuild(gs){const h={order_date:$('#poDate').value||isoToday(),expected_date:$('#poDue').value||null,deliver_to:$('#poTo').value.trim(),note:$('#poNote').value.trim()};
  return gs.map(([k,rows])=>{const sp=rows[0].sp,lines=rows.map(x=>({item_id:x.i.id,code:x.i.code,name:x.i.name,fin:x.i.fin||'',unit:x.i.unit||'',qty:x.qty,price:x.i.price||0,weight:Number(x.i.weight_kg)||0,system:sysOf(x.i)||''}));
    return {...h,supplier_id:sp?String(sp.id):null,supplier_name:sp?sp.name:'',supplier_phone:sp?sp.phone||'':'',lines,total:lines.reduce((a,l)=>a+l.qty*l.price,0),status:'ordered'}})}
function poPrint(orders){
  const w=window.open('','_blank');if(!w){toast('Trình duyệt đang chặn cửa sổ in. Hãy cho phép popup rồi thử lại.');return}
  const logo=new URL('assets/images/logo-hai-ha-hung.png',location.href).href;
  const page=o=>{
    const ls=(o.lines||[]).map(l=>{const it=itemById(l.item_id)||{},w=Number(l.weight!=null?l.weight:it.weight_kg)||0,sy=l.system!=null?l.system:(sysOf(it)||'');return{...l,w,sy,kg:w*Number(l.qty||0)}});
    const hp=ls.some(l=>Number(l.price)>0),hw=ls.some(l=>l.kg>0),nc=5+(hw?2:0)+(hp?2:0);
    const gm=new Map();ls.forEach(l=>{if(!gm.has(l.sy))gm.set(l.sy,[]);gm.get(l.sy).push(l)});
    const gk=[...gm.keys()].sort((a,b)=>!a?1:!b?-1:a.localeCompare(b,'vi')),useG=gk.some(k=>k);
    const hl=k=>/h[ệe]\s/i.test(k)?k:'Hệ '+k;const sum=(g,f)=>g.reduce((a,l)=>a+f(l),0),amt=l=>Number(l.qty)*Number(l.price||0);
    let n=0;
    const row=l=>`<tr><td>${++n}</td><td>${esc(l.code)}</td><td class="l">${esc(l.name)}${l.fin?' <i>('+esc(l.fin)+')</i>':''}</td><td>${esc(l.unit)}</td><td class="r">${fmt(l.qty)}</td>${hw?`<td class="r">${l.w?fmt(l.w):''}</td><td class="r">${l.kg?fmt(l.kg):''}</td>`:''}${hp?`<td class="r">${l.price?fmt(l.price):''}</td><td class="r">${l.price?fmt(amt(l)):''}</td>`:''}</tr>`;
    const body=gk.map(k=>{const g=gm.get(k),us=new Set(g.map(l=>l.unit)),kg=sum(g,l=>l.kg),am=sum(g,amt),lb=k?esc(hl(k)):'khác';
      return (useG?`<tr class="gh"><td colspan="${nc}" class="l"><b>${k?esc(hl(k)):'Khác'}</b></td></tr>`:'')+g.map(row).join('')
       +(useG?`<tr class="gs"><td colspan="4" class="r">Cộng ${lb}</td><td class="r"><b>${us.size===1?fmt(sum(g,l=>Number(l.qty))):''}</b></td>${hw?`<td></td><td class="r"><b>${kg?fmt(kg):''}</b></td>`:''}${hp?`<td></td><td class="r"><b>${am?fmt(am):''}</b></td>`:''}</tr>`:'')}).join('');
    const foot=(hw||hp)?`<tfoot><tr><td colspan="5" class="r"><b>Tổng cộng${hp?' (ước tính)':''}</b></td>${hw?`<td></td><td class="r"><b>${fmt(sum(ls,l=>l.kg))}</b></td>`:''}${hp?`<td></td><td class="r"><b>${fmt(sum(ls,amt))}</b></td>`:''}</tr></tfoot>`:'';
    const wk=ls.filter(l=>l.kg>0),sm=hw?gk.map(k=>[k,wk.filter(l=>l.sy===k)]).filter(g=>g[1].length):[];
    const stat=sm.length?`<p class="st">Thống kê khối lượng nhôm theo hệ</p><table class="sm"><thead><tr><th class="l">Hệ nhôm</th><th>Số thanh</th><th>Khối lượng (kg)</th></tr></thead><tbody>${sm.map(([k,g])=>`<tr><td class="l">${k?esc(k):'Khác'}</td><td class="r">${fmt(sum(g,l=>Number(l.qty)))}</td><td class="r">${fmt(sum(g,l=>l.kg))}</td></tr>`).join('')}</tbody><tfoot><tr><td class="l"><b>Tổng khối lượng nhôm</b></td><td class="r"><b>${fmt(sum(wk,l=>Number(l.qty)))}</b></td><td class="r"><b>${fmt(sum(wk,l=>l.kg))}</b></td></tr></tfoot></table>`:'';
    return `<section class="pg"><header><img src="${logo}" alt=""><div><b>CÔNG TY TNHH KINH DOANH TỔNG HỢP HẢI HÀ HƯNG</b><p>Địa chỉ: QL1A, Xã Thăng Bình, TP Đà Nẵng</p><p>Điện thoại: 0918 210 031 • Email: mailcv.30@gmail.com</p></div></header>
    <h1>ĐƠN ĐẶT HÀNG</h1><p class="c">Số: <b>${esc(o.po_no||'')}</b> &nbsp;•&nbsp; Ngày đặt: ${poD(o.order_date)}</p>
    <div class="info"><div><span>Nhà cung cấp</span><b>${esc(o.supplier_name||'(Chưa chọn nhà cung cấp)')}</b>${o.supplier_phone?'<small>ĐT / Zalo: '+esc(o.supplier_phone)+'</small>':''}</div><div><span>Giao đến</span><b>${esc(o.deliver_to||'—')}</b><small>Ngày giao dự kiến: ${poD(o.expected_date)}</small></div></div>
    <table><thead><tr><th>STT</th><th>Mã</th><th class="l">Tên vật tư</th><th>ĐVT</th><th>SL đặt</th>${hw?'<th>Kg/thanh</th><th>Khối lượng (kg)</th>':''}${hp?'<th>Đơn giá</th><th>Thành tiền</th>':''}</tr></thead><tbody>${body}</tbody>${foot}</table>
    ${stat}
    ${o.note?'<p class="note"><b>Ghi chú:</b> '+esc(o.note)+'</p>':''}
    <div class="sign"><div><b>Người lập đơn</b><small>(Ký, ghi rõ họ tên)</small></div><div><b>Nhà cung cấp xác nhận</b><small>(Ký, ghi rõ họ tên)</small></div></div></section>`};
  const css='*{box-sizing:border-box}body{font:13px/1.45 Arial,Helvetica,sans-serif;color:#111;margin:0}.bar{padding:10px;text-align:center;background:#eef2f8}.bar button{padding:8px 18px;font-size:14px;cursor:pointer}.pg{width:210mm;min-height:297mm;margin:0 auto;padding:14mm 14mm 12mm;page-break-after:always;position:relative}.pg:last-child{page-break-after:auto}header{display:flex;gap:14px;align-items:center;border-bottom:2px solid #111;padding-bottom:8px}header img{height:64px}header b{font-size:15px}header p{margin:2px 0;font-size:12px}h1{text-align:center;font-size:22px;margin:14px 0 4px;letter-spacing:1px}.c{text-align:center;margin:0 0 12px}.info{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}.info>div{border:1px solid #999;padding:8px 10px;border-radius:4px}.info span{display:block;font-size:11px;color:#555;text-transform:uppercase}.info b,.info small{display:block}table{width:100%;border-collapse:collapse}th,td{border:1px solid #666;padding:5px 6px;text-align:center;vertical-align:top}th{background:#f0f0f0}td.l,th.l{text-align:left}td.r{text-align:right}.note{margin:12px 0}.sign{display:flex;justify-content:space-around;margin-top:28px;text-align:center}.sign div{width:42%;min-height:90px}.sign b,.sign small{display:block}.sign small{color:#555}tr.gh td{background:#e3ebf7}tr.gs td{background:#f6f6f6}.st{font-weight:bold;margin:14px 0 4px}table.sm{width:62%}@page{size:A4;margin:0}@media print{.bar{display:none}}';
  w.document.open();w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(orders.map(o=>o.po_no||'Đơn đặt hàng').join(', '))}</title><style>${css}</style></head><body><div class="bar"><button onclick="print()">In / Lưu PDF</button></div>${orders.map(page).join('')}${'<scr'+'ipt>'}window.onload=()=>setTimeout(()=>print(),400)${'<'+'/scr'+'ipt>'}</body></html>`);w.document.close();
}
function poTotUpd(){const s=poSel().filter(x=>x.qty>0),tot=s.reduce((a,x)=>a+x.qty*x.i.price,0),kg=s.reduce((a,x)=>a+x.qty*(Number(x.i.weight_kg)||0),0);
  $('#poTot').textContent=s.length+' mã sẽ vào đơn'+(kg?' · tổng khối lượng nhôm '+fmt(kg)+' kg':'')+(tot?' · ước tính '+fmt(tot)+' đ':'')}
function poPrev(){
  const gs=poGroupsOf(poSel());if(!gs.length){$('#dPO').close();renderPO();return}
  $('#poPrev').innerHTML=gs.map(([k,rows])=>`<div class="wrap" style="border:1px solid var(--line);margin-bottom:10px"><div class="pog-h"><div><b>${rows[0].sp?esc(rows[0].sp.name):'Chưa chọn nhà cung cấp'}</b><small>${rows.length} mã${rows[0].sp?'':' · vẫn tạo được đơn, hoặc chọn nhà cung cấp ở cột cuối để gom đúng đơn'}</small></div></div>
    <table style="min-width:640px"><thead><tr><th>Mã / Tên</th><th class="num">Tồn</th><th>Số lượng đặt</th><th>Nhà cung cấp</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td><div class="n2">${esc(x.i.name)}</div><small><code>${esc(x.i.code)}</code>${x.i.fin?' · '+esc(x.i.fin):''}</small></td><td class="num">${fmt(x.i.qty)} ${esc(x.i.unit)}${x.open?`<small class="po-open">Đang đặt ${fmt(x.open)}</small>`:''}</td>
    <td><input type="number" class="dq" min="0" step="any" value="${x.qty}" data-id="${esc(x.i.id)}" style="width:90px"> ${esc(x.i.unit)}</td>
    <td><select class="ds" data-id="${esc(x.i.id)}"><option value="">— chọn —</option>${S.sup.map(s=>`<option value="${esc(s.id)}"${x.sp&&sid(x.sp.id)===sid(s.id)?' selected':''}>${esc(s.name)}</option>`).join('')}</select></td>
    <td class="num"><button class="sm danger dx" data-id="${esc(x.i.id)}" title="Bỏ mã này khỏi đơn">✕</button></td></tr>`).join('')}</tbody></table></div>`).join('');
  poTotUpd();
}
$('#poPrev').oninput=e=>{const t=e.target;if(!t.classList.contains('dq'))return;PO.q[t.dataset.id]=Math.max(0,pf(t.value)||0);poTotUpd()};
$('#poPrev').onchange=async e=>{const t=e.target;if(!t.classList.contains('ds'))return;
  const r=await sb.from('items').update({supplier_id:t.value||null}).eq('id',t.dataset.id);
  if(r.error){toast(rpcMsg(r.error));return}const i=itemById(t.dataset.id);if(i)i.supplier_id=t.value||null;poPrev();renderPO()};
$('#poPrev').onclick=e=>{const b=e.target.closest('.dx');if(!b)return;PO.on.delete(b.dataset.id);poPrev();renderPO()};
function renderPOHis(){
  const body=$('#poHisRows');
  if(PO.orders===undefined){body.innerHTML='<tr><td colspan="6" class="empty">Đang tải…</td></tr>';return}
  if(PO.orders===null){$('#poHisS').textContent='';body.innerHTML='<tr><td colspan="6" class="empty">Chưa cài bảng đơn đặt hàng. Hãy chạy file supabase-update-23.sql trong SQL Editor rồi tải lại trang.</td></tr>';return}
  const list=PO.orders.filter(o=>!PO.hisSt||o.status===PO.hisSt);
  $('#poHisS').textContent=list.length+' đơn'+(list.length<PO.orders.length?' / '+PO.orders.length:'');
  body.innerHTML=list.length?list.map(o=>`<tr><td><b>${esc(o.po_no)}</b><small>${poD(o.order_date)}${o.created_by?' · '+esc(o.created_by):''}</small></td><td>${esc(o.supplier_name||'(Chưa chọn)')}</td><td class="num">${(o.lines||[]).length}</td><td class="num">${Number(o.total)?fmt(o.total)+' đ':'—'}</td>
    <td><select class="pst" data-id="${esc(o.id)}">${Object.entries(POST).map(([k,v])=>`<option value="${k}"${o.status===k?' selected':''}>${v}</option>`).join('')}</select></td>
    <td class="num"><div class="acts"><button class="sm" data-ph="print" data-id="${esc(o.id)}">Xem / In</button>${isBoss()?`<button class="sm danger" data-ph="del" data-id="${esc(o.id)}">Xóa</button>`:''}</div></td></tr>`).join(''):'<tr><td colspan="6" class="empty">Chưa có đơn đặt hàng nào.</td></tr>';
}
$('#poGroups').onchange=async e=>{
  const t=e.target;
  if(t.classList.contains('pca')){const g=poGroups().find(x=>x[0]===t.dataset.k);if(g)g[1].forEach(x=>t.checked?PO.on.add(sid(x.i.id)):PO.on.delete(sid(x.i.id)));renderPO();return}
  const id=t.dataset.id;if(!id)return;
  if(t.classList.contains('pc')){t.checked?PO.on.add(id):PO.on.delete(id);renderPO()}
  else if(t.classList.contains('pq')){PO.q[id]=Math.max(0,pf(t.value)||0);renderPO()}
  else if(t.classList.contains('ps')){const r=await sb.from('items').update({supplier_id:t.value||null}).eq('id',id);
    if(r.error){toast(rpcMsg(r.error));return}const i=itemById(id);if(i)i.supplier_id=t.value||null;renderPO()}
};
$('#poGroups').onclick=async e=>{
  const b=e.target.closest('button[data-po]');if(!b)return;
  const g=poGroupsOf(poSel().filter(x=>x.qty>0)).find(x=>x[0]===b.dataset.k);if(!g)return;const rows=g[1],sp=rows[0]&&rows[0].sp;
  if(b.dataset.po==='copy'){await copyText(poMsg(sp,rows));toast('Đã sao chép tin nhắn. Dán vào Zalo để gửi.')}
  else if(b.dataset.po==='zalo'){await copyText(poMsg(sp,rows));toast('Đã sao chép tin nhắn, đang mở Zalo. Dán tin vào khung chat.');window.open('https://zalo.me/'+String(sp.phone).replace(/[^\d]/g,''),'_blank','noopener')}
  else poXlsx([b.dataset.k]);
};
$('#poQ').oninput=e=>{PO.qs=e.target.value.trim();renderPO()};
$('#poFt').onchange=e=>{PO.ft=e.target.value;renderPO()};$('#poFs').onchange=e=>{PO.fs=e.target.value;renderPO()};$('#poFc').onchange=e=>{PO.fc=e.target.value;renderPO()};
$('#poSt').onchange=e=>{PO.st=e.target.value;renderPO()};$('#poFilt').onchange=e=>{PO.sup=e.target.value;renderPO()};$('#poOut').onchange=e=>{PO.allOut=e.target.checked;renderPO()};
$('#poReset').onclick=()=>{PO.qs=PO.ft=PO.fs=PO.fc=PO.sup='';PO.st='need';PO.allOut=false;$('#poQ').value='';renderPO()};
$('#poAll').onclick=()=>{poRows().forEach(x=>PO.on.add(sid(x.i.id)));renderPO()};
$('#poNone').onclick=()=>{PO.on.clear();renderPO()};
$('#poTabs').onclick=e=>{const b=e.target.closest('button[data-t]');if(!b)return;PO.tab=b.dataset.t;renderPO();if(PO.tab==='his')loadPO().then(()=>renderPO())};
$('#poHisSt').onchange=e=>{PO.hisSt=e.target.value;renderPOHis()};
$('#poHisRows').onchange=async e=>{const t=e.target;if(!t.classList.contains('pst'))return;
  const r=await sb.from('purchase_orders').update({status:t.value}).eq('id',t.dataset.id);
  if(r.error){toast(rpcMsg(r.error));await loadPO();renderPO();return}
  const o=PO.orders.find(x=>sid(x.id)===sid(t.dataset.id));if(o)o.status=t.value;toast('Đã cập nhật trạng thái đơn.');renderPO()};
$('#poHisRows').onclick=async e=>{const b=e.target.closest('button[data-ph]');if(!b)return;const o=PO.orders.find(x=>sid(x.id)===sid(b.dataset.id));if(!o)return;
  if(b.dataset.ph==='print')poPrint([o]);
  else if(confirm('Xóa đơn '+o.po_no+'? Thao tác này không hoàn tác được.')){const r=await sb.from('purchase_orders').delete().eq('id',o.id);if(r.error){toast(rpcMsg(r.error));return}await loadPO();renderPO()}};
$('#poMake').onclick=()=>{
  if(S.sup===null){toast('Hãy chạy supabase-update-2.sql trước.');return}
  const gs=poDraft();if(!gs.length){toast('Hãy tích chọn ít nhất một mã (số lượng lớn hơn 0) để tạo đơn.');return}
  $('#poDate').value=isoToday();$('#poDue').value='';$('#poNote').value='';$('#poTo').value=localStorage.getItem('hhh_po_to')||'Kho Hải Hà Hưng';
  $('#ePO').textContent='';poPrev();$('#dPO').showModal()};
$('#poClose').onclick=()=>{$('#dPO').close();renderPO()};
$('#poTry').onclick=()=>poDraft().length?poPrint(poBuild(poDraft()).map((o,n)=>({...o,po_no:'(Bản nháp '+(n+1)+')'}))):($('#ePO').textContent='Hãy nhập số lượng lớn hơn 0 cho ít nhất một mã.');
$('#poSave').onclick=async()=>{
  const os=poBuild(poDraft());if(!os.length){$('#ePO').textContent='Hãy nhập số lượng lớn hơn 0 cho ít nhất một mã.';return}$('#ePO').textContent='';$('#poSave').disabled=true;
  const r=await sb.from('purchase_orders').insert(os).select();$('#poSave').disabled=false;
  if(r.error){$('#ePO').textContent=/purchase_orders/.test(r.error.message||'')&&/(relation|schema cache|does not exist)/.test(r.error.message||'')?'Chưa cài bảng đơn đặt hàng. Hãy chạy file supabase-update-23.sql rồi tải lại trang.':rpcMsg(r.error);return}
  try{localStorage.setItem('hhh_po_to',$('#poTo').value.trim())}catch(x){}
  PO.on.clear();$('#dPO').close();await loadPO();renderPO();poPrint(r.data);toast('Đã tạo '+r.data.length+' đơn đặt hàng. Xem lại ở thẻ “Đơn đã tạo”.')};
$('#poXls').onclick=()=>poXlsx(null);$('#toPO').onclick=()=>go('po');
