(()=>{'use strict';
const H=window.HHH;if(!H||!H.sb||!window.__hhhPayload)return;
const sb=H.sb,$=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nrm=s=>String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');
const fmt=n=>Number(n).toLocaleString('vi-VN',{maximumFractionDigits:2});
async function loadItems(){let a=[],f=0;for(;;){const r=await sb.from('items').select('id,code,name,fin,qty,unit').order('code').range(f,f+999);if(r.error)throw r.error;a=a.concat(r.data);if(r.data.length<1000)break;f+=1000}return a}
/* Đơn vị bán: báo giá có thể bán theo hộp/bộ… còn kho tính theo đơn vị kho (items.unit). Bảng quy đổi: item_units (supabase-update-15.sql).
   f = số đơn vị kho trên 1 đơn vị báo giá; null = chưa biết quy đổi. */
let IU={};
const UALIAS={cay:'thanh',cai:'chiec',pcs:'chiec',pc:'chiec',set:'bo'},uk=u=>{const k=nrm(u);return UALIAS[k]||k};
async function loadUnits(){const r=await sb.from('item_units').select('item_id,unit,factor');IU={};if(!r.error)r.data.forEach(u=>{(IU[String(u.item_id)]||(IU[String(u.item_id)]=[])).push({unit:u.unit,f:Number(u.factor)})})}
function factorOf(sel,unit){
  if(!sel)return 1;if(!unit||uk(unit)===uk(sel.unit))return 1;
  const o=(IU[String(sel.id)]||[]).find(x=>uk(x.unit)===uk(unit));return o?o.f:null;
}
const colorBad=(c,fin)=>{const a=nrm(c),b=nrm(fin);return !!a&&!!b&&!a.includes(b)&&!b.includes(a)};
let P,R,idx,QD=null;
function pick(c,color){if(!c.length)return null;return c.find(i=>!colorBad(color,i.fin))||c[0]}
function build(items){
  idx=new Map();items.forEach(i=>{const k=nrm(i.code);(idx.get(k)||idx.set(k,[]).get(k)).push(i)});
  const ls=[...P.aluminum.map(x=>({...x,al:true})),...(P.accessoriesIncluded===false?[]:P.accessories)];
  R=ls.filter(x=>Number(x.qty)>0&&(x.code||x.name)).map(x=>{
    let c=idx.get(nrm(x.code))||[];if(!c.length&&x.al&&/^n-/i.test(x.code||''))c=idx.get(nrm(x.code.replace(/^n-/i,'')))||[];
    const sel=pick(c,x.color),q=Number(x.qty)||0,pr=Number(x.price)||0;
    const v=x.al?q*(Number(x.weight)||0)*pr:q*pr*(1-Math.min(100,Math.max(0,Number(x.discountPercent)||0))/100);
    const f=factorOf(sel,x.unit);
    return{code:x.code,name:x.name,color:x.color||'',qty:q,unit:x.unit,cand:c,sel,f,fMan:false,on:!!sel&&f!==null,v}});
}
function draw(){
  const need={};R.forEach(r=>{if(r.on&&r.sel&&r.f)need[r.sel.id]=(need[r.sel.id]||0)+r.qty*r.f});
  let bad=0,n=0,nu=0;
  $('#slRows').innerHTML=R.map((r,i)=>{
    let st,cls='';const s=r.sel,bq=r.f?r.qty*r.f:0;
    if(!s){st='Không có trong kho (bỏ qua)';cls='color:#8a97ab'}
    else if(r.f===null){nu++;st='Chưa có quy đổi đơn vị: báo giá “'+esc(r.unit)+'”, kho tính “'+esc(s.unit)+'”. Nhập hệ số: 1 '+esc(r.unit)+' = <input type="number" class="sl-f" data-i="'+i+'" min="0" step="any" style="width:80px"> '+esc(s.unit);cls='color:#b7791f'}
    else if(r.on&&need[s.id]>Number(s.qty)){st='Thiếu: cần '+fmt(need[s.id])+', còn '+fmt(s.qty);cls='color:#d4472a;font-weight:600';bad++}
    else if(colorBad(r.color,s.fin)){st='Khác màu: báo giá “'+esc(r.color)+'”, kho “'+esc(s.fin)+'”';cls='color:#b7791f'}
    else{st=Number(s.qty)>=bq?'Đủ hàng':'Thiếu '+fmt(bq-Number(s.qty))+' (không chọn xuất)';cls=Number(s.qty)>=bq?'color:#16915f':'color:#d4472a'}
    if(s&&r.fMan&&r.f)st+='<br><small style="color:#b7791f">Hệ số 1 '+esc(r.unit)+' = '+fmt(r.f)+' '+esc(s.unit)+' chỉ áp dụng lần xuất này.</small> <button type="button" class="btn btn-secondary sl-fs" data-i="'+i+'">Lưu quy đổi cho mã này</button>';
    if(r.on&&s)n++;
    const sel=r.cand.length>1?`<select data-i="${i}" class="sl-m">${r.cand.map(c=>`<option value="${c.id}"${s&&c.id===s.id?' selected':''}>${esc(c.code)} · ${esc(c.fin||'')}</option>`).join('')}</select>`:(s?esc(s.code):'—');
    const conv=s&&r.f&&r.f!==1?`<br><small>= ${fmt(r.qty*r.f)} ${esc(s.unit)} trừ kho</small>`:'';
    return`<tr><td><input type="checkbox" class="sl-c" data-i="${i}"${r.on?' checked':''}${s&&r.f!==null?'':' disabled'}></td><td><b>${esc(r.code)}</b><br><small>${esc(r.name)}${r.color?' · '+esc(r.color):''}</small></td><td style="text-align:right">${fmt(r.qty)} ${esc(r.unit)}${conv}</td><td>${sel}</td><td style="text-align:right">${s?fmt(s.qty)+' '+esc(s.unit):'—'}</td><td style="${cls}">${st}</td></tr>`}).join('');
  const b=$('#slGo');b.disabled=bad>0||n===0;
  $('#slSum').textContent=bad?'Có '+bad+' dòng thiếu tồn: bỏ chọn dòng đó hoặc nhập thêm hàng trước.':(n?'Sẽ xuất '+n+' dòng.'+(nu?' Còn '+nu+' dòng chưa có quy đổi đơn vị (đang bỏ qua).':''):'Chưa có dòng nào được chọn để xuất.');
}
async function go(){
  const b=$('#slGo');b.disabled=true;$('#slErr').textContent='';
  const g={};R.filter(r=>r.on&&r.sel&&r.f).forEach(r=>{const o=g[r.sel.id]||(g[r.sel.id]={item_id:r.sel.id,qty:0,code:r.sel.code,rows:[]});o.qty+=r.qty*r.f;o.rows.push(r)});
  const grp=Object.values(g),lines=grp.map(o=>({item_id:o.item_id,qty:o.qty,code:o.code})),code=P.quote.code,sig='BG:'+code+'|'+lines.map(l=>nrm(l.code)+'x'+l.qty).sort().join(',');
  const call=src=>sb.rpc('submit_request',{p_kind:'out',p_source:src,p_party:P.customer.name||'',p_date:P.quote.date||'',p_note:'Từ báo giá '+code,p_sig:sig,p_lines:lines});
  // lưu trước để trigger kho tìm thấy báo giá; trạng thái do database cập nhật
  const qs=QD&&QD.status;
  if(qs==='returned'){b.disabled=false;$('#slErr').textContent='Báo giá đã hoàn kho toàn bộ, không xuất tiếp được. Hãy tạo báo giá mới.';return}
  // báo giá đã gửi kho bị khóa nội dung: xuất tiếp phần còn lại thì không lưu đè
  if(qs!=='export_pending'&&qs!=='exported')try{await H.saveQuote(P)}catch(e){b.disabled=false;$('#slErr').textContent='Chưa lưu được báo giá: '+(e.message||e);return}
  let r=await call('quote');if(r.error&&/source|check|violat/i.test(r.error.message))r=await call('image');
  if(r.error){b.disabled=false;$('#slErr').textContent=/DUPLICATE|duplicate key|_sig/i.test(r.error.message)?'Báo giá này (cùng mặt hàng) đã được tạo phiếu xuất trước đó.':'Chưa trừ tồn, lỗi: '+r.error.message;return}
  // Ghi đơn vị bán + hệ số vào dòng phiếu: hoàn kho sau này dùng hệ số này để quy giá trị trừ nợ
  let um='';
  const sl=grp.map(o=>{const r0=o.rows[0],same=o.rows.every(x=>uk(x.unit)===uk(r0.unit)&&x.f===r0.f);
    return same?{code:o.code,item_id:String(o.item_id),sale_qty:o.rows.reduce((a,x)=>a+x.qty,0),sale_unit:r0.unit||r0.sel.unit,sale_factor:r0.f}:{code:o.code,item_id:String(o.item_id),sale_qty:o.qty,sale_unit:r0.sel.unit,sale_factor:1}});
  if(r.data&&r.data.id&&sl.some(x=>x.sale_factor!==1)){
    const sv=await sb.rpc('save_order_sale',{p_id:r.data.id,p_sig:sig,p_customer_id:null,p_count:null,p_lines:sl});
    if(sv.error)um='<p style="color:#d4472a">Đã xuất kho nhưng chưa ghi được đơn vị bán: '+esc(sv.error.message)+'. Hoàn kho sau này có thể lệch giá trị, hãy báo quản trị.</p>';
  }
  $('#slBody').innerHTML=um+'<p style="color:#16915f;font-weight:700">'+(r.data&&r.data.status==='pending'?'Đã gửi phiếu xuất chờ duyệt. Tồn kho chỉ trừ và công nợ chỉ tính khi quản lý duyệt.':'Đã xuất kho thành công, đã tính công nợ.')+'</p><p>Xem chi tiết ở mục Chờ duyệt / Lịch sử giao dịch của kho.</p>';b.remove();
}
/* ---------- Hoàn kho theo báo giá: phiếu NHẬP chờ duyệt, sig 'HK:<mã>|...'.
   Giá trị trừ nợ do database tính khi duyệt (quote_unit_value); ở đây chỉ ước tính cùng công thức. ---------- */
let RT=[];
const REASONS=['Khách trả hàng','Khách hủy đơn','Khách đổi mã','Giao thừa','Khác'];
const qk=s=>String(s||'').toLowerCase().replace(/^\s*n-/,'').replace(/[^a-z0-9]/g,'');
function unitValue(d,code,sf){ // giống public.quote_unit_value
  const p=d.payload||{},n=x=>Number(x)||0;
  const ls=[...(p.aluminum||[]).map(x=>({k:qk(x.code),q:n(x.qty),v:n(x.qty)*n(x.weight)*n(x.price)})),
    ...(p.accessoriesIncluded===false?[]:(p.accessories||[])).map(x=>({k:qk(x.code),q:n(x.qty),v:n(x.qty)*n(x.price)*(1-Math.min(100,Math.max(0,n(x.discountPercent)))/100)}))];
  const all=ls.reduce((a,x)=>a+x.v,0),m=ls.filter(x=>x.k===qk(code)),mq=m.reduce((a,x)=>a+x.q,0);
  return all>0&&mq>0?m.reduce((a,x)=>a+x.v,0)/(mq*(sf||1))*n(d.total)/all:0;
}
async function drawReturn(d){
  const code=P.quote.code,lk=k=>sb.from('requests').select('id,status,created_at,request_lines(item_id,code,name,qty,unit,sale_factor)').like('sig',k+':'+code+'|%').in('status',['pending','approved']);
  const [bg,hk]=await Promise.all([lk('BG'),lk('HK')]);
  if(bg.error||hk.error){$('#slRet').innerHTML='<p style="color:#d4472a">Không tải được phiếu kho của báo giá: '+esc((bg.error||hk.error).message)+'</p>';return}
  const out=new Map(),back={},K=c=>String(c||'').toUpperCase(),add=(c,q)=>back[K(c)]=(back[K(c)]||0)+Number(q);
  bg.data.filter(x=>x.status==='approved').forEach(x=>x.request_lines.forEach(l=>{if(!l.item_id)return;const o=out.get(K(l.code))||{...l,qty:0,sf:0};o.qty+=Number(l.qty);if(Number(l.sale_factor)>0)o.sf=Math.max(o.sf,Number(l.sale_factor));out.set(K(l.code),o)}));
  // đã hoàn = mọi lần đã ghi vào báo giá (hủy xuất ở kho + phiếu hoàn đã duyệt) + phiếu hoàn đang chờ
  (d.returns||[]).forEach(h=>(h.lines||[]).forEach(l=>add(l.code,l.qty)));
  const pend=hk.data.filter(x=>x.status==='pending');pend.forEach(x=>x.request_lines.forEach(l=>add(l.code,l.qty)));
  RT=[...out.values()].map(l=>({...l,left:Math.max(0,l.qty-(back[K(l.code)]||0)),u:unitValue(d,l.code,l.sf||1),n:0}));
  const ln=ls=>ls.map(l=>esc(l.code)+' × '+fmt(l.qty)).join(', '),src={void:'hủy xuất ở kho',request:'phiếu hoàn'};
  $('#slRet').innerHTML=`<h3 style="margin:18px 0 6px">Hoàn kho theo báo giá</h3>
   ${(d.returns||[]).map(h=>`<p style="margin:2px 0;color:#16915f">✔ ${new Date(h.at).toLocaleString('vi-VN')} · ${src[h.source]||'phiếu hoàn'}: trừ nợ ${fmt(h.amount)} đ · ${ln(h.lines||[])}</p>`).join('')}
   ${pend.map(x=>`<p style="margin:2px 0;color:#b7791f">⏳ Phiếu hoàn chờ duyệt (${new Date(x.created_at).toLocaleString('vi-VN')}): ${ln(x.request_lines)}</p>`).join('')}
   ${RT.some(x=>x.left>0)?`<div class="table-wrap"><table class="data-table"><thead><tr><th>MÃ TRONG KHO</th><th>ĐÃ XUẤT</th><th>CÒN HOÀN ĐƯỢC</th><th>SỐ LƯỢNG HOÀN</th><th>ƯỚC TÍNH TRỪ NỢ</th></tr></thead><tbody>${RT.map((x,i)=>`<tr><td><b>${esc(x.code)}</b><br><small>${esc(x.name||'')}</small></td><td style="text-align:right">${fmt(x.qty)} ${esc(x.unit||'')}</td><td style="text-align:right">${fmt(x.left)}</td><td><input type="number" class="rt-n" data-r="${i}" min="0" max="${x.left}" step="any" value="0"${x.left>0?'':' disabled'} aria-label="Số lượng hoàn ${esc(x.code)}" style="width:90px"></td><td style="text-align:right" id="rtV${i}">0 đ${x.u?'':'<br><small style="color:#b7791f">mã không khớp báo giá</small>'}</td></tr>`).join('')}</tbody></table></div>
   <p><label>Lý do <select id="rtWhy">${REASONS.map(x=>`<option>${x}</option>`).join('')}</select></label> <input id="rtNote" placeholder="Ghi chú (không bắt buộc)" aria-label="Ghi chú hoàn kho" style="min-width:240px"></p>
   <p id="rtSum"></p><p id="rtErr" style="color:#d4472a"></p><button type="button" id="rtGo" class="btn btn-primary" disabled>Gửi phiếu hoàn kho (chờ duyệt)</button>`
   :'<p>Không còn hàng nào để hoàn.</p>'}`;
  const box=$('#slRet');if(!$('#rtGo'))return;
  box.oninput=e=>{const i=+e.target.dataset.r,x=RT[i];if(!x)return;x.n=Number(e.target.value)||0;$('#rtV'+i).textContent=fmt(Math.round(x.n*x.u))+' đ';
    const bad=RT.some(r=>r.n<0||r.n>r.left+1e-9),t=RT.reduce((a,r)=>a+Math.round(r.n*r.u),0),all=!pend.length&&RT.every(r=>Math.abs(r.n-r.left)<1e-9);
    $('#rtSum').textContent=bad?'Số lượng hoàn không được vượt số còn hoàn được.':all?'Hoàn toàn bộ hàng đã xuất: khi duyệt, báo giá chuyển "Đã hoàn kho", công nợ của đơn về 0.':'Ước tính trừ công nợ khi được duyệt: '+fmt(t)+' đ (hệ thống tính chính thức theo giá báo giá).';
    $('#rtGo').disabled=bad||!RT.some(r=>r.n>0)};
  $('#rtGo').onclick=goReturn;
}
async function goReturn(){
  const b=$('#rtGo');b.disabled=true;$('#rtErr').textContent='';
  const code=P.quote.code,ls=RT.filter(x=>x.n>0),sig='HK:'+code+'|'+Date.now();
  const note='Hoàn kho báo giá '+code+' · '+$('#rtWhy').value+($('#rtNote').value.trim()?' — '+$('#rtNote').value.trim():'');
  const call=src=>sb.rpc('submit_request',{p_kind:'in',p_source:src,p_party:P.customer.name||'',p_date:new Date().toISOString().slice(0,10),p_note:note,p_sig:sig,p_lines:ls.map(x=>({item_id:x.item_id,qty:x.n,code:x.code}))});
  let r=await call('quote');if(r.error&&/source|check|violat/i.test(r.error.message))r=await call('image');
  if(r.error){b.disabled=false;$('#rtErr').textContent='Chưa tạo được phiếu hoàn: '+r.error.message;return}
  $('#slRet').innerHTML='<p style="color:#16915f;font-weight:700">'+(r.data&&r.data.status==='pending'?'Đã gửi phiếu hoàn kho chờ duyệt. Khi quản lý duyệt: cộng lại tồn kho và trừ công nợ báo giá '+esc(code)+'.':'Đã hoàn kho và trừ công nợ báo giá '+esc(code)+'.')+'</p>';
}
async function open(){
  P=window.__hhhPayload();
  if(!P.quote.code){alert('Chưa có mã báo giá.');return}
  const m=document.createElement('div');m.className='modal-backdrop';m.id='slModal';
  m.innerHTML=`<div class="modal" style="max-width:920px;width:96%"><div class="modal-head"><div><h2>Kiểm tra tồn kho · ${esc(P.quote.code)}</h2><p>Khách: ${esc(P.customer.name||'chưa nhập')}</p></div><button type="button" id="slX" class="btn btn-secondary">Đóng</button></div><div id="slBody" style="padding:0 20px 20px;overflow:auto"><p id="slNote"></p><div class="table-wrap"><table class="data-table"><thead><tr><th></th><th>MÃ / TÊN</th><th>CẦN</th><th>MÃ TRONG KHO</th><th>TỒN</th><th>TÌNH TRẠNG</th></tr></thead><tbody id="slRows"><tr><td colspan="6">Đang tải tồn kho…</td></tr></tbody></table></div><p id="slSum"></p><p id="slErr" style="color:#d4472a"></p><div id="slRet"></div></div><div style="padding:0 20px 20px;text-align:right"><button type="button" id="slGo" class="btn btn-primary" disabled>Tạo phiếu xuất kho</button></div></div>`;
  document.body.appendChild(m);$('#slX').onclick=()=>m.remove();$('#slGo').onclick=go;
  m.onchange=e=>{const i=+e.target.dataset.i;if(isNaN(i))return;const r=R[i];
    if(e.target.classList.contains('sl-c'))r.on=e.target.checked;
    else if(e.target.classList.contains('sl-f')){const v=parseFloat(String(e.target.value).replace(',','.'));if(v>0){r.f=v;r.fMan=true;r.on=true}}
    else{r.sel=r.cand.find(c=>String(c.id)===e.target.value);r.f=factorOf(r.sel,r.unit);r.fMan=false;r.on=r.f!==null}draw()};
  // Lưu hệ số vừa nhập vào bảng quy đổi của mã (dùng cho các lần sau)
  m.onclick=async e=>{const b=e.target.closest('.sl-fs');if(!b)return;const r=R[+b.dataset.i];if(!r||!r.sel||!(r.f>0))return;b.disabled=true;
    const x=await sb.from('item_units').insert({item_id:r.sel.id,unit:r.unit,factor:r.f});
    if(x.error){b.disabled=false;$('#slErr').textContent='Chưa lưu được quy đổi: '+(x.error.code==='23505'?'đơn vị này đã có ở mã này.':x.error.message);return}
    $('#slErr').textContent='';await loadUnits();R.forEach(q=>{if(q.sel&&q.fMan&&q.sel.id===r.sel.id&&uk(q.unit)===uk(r.unit))q.fMan=false});draw()};
  try{
    const [items,,q]=await Promise.all([loadItems(),loadUnits(),sb.from('quotes').select('status,exported_at,total,returned_amount,returns,payload').eq('code',P.quote.code).maybeSingle()]);
    build(items);draw();const d=QD=q.data;
    if(d&&['exported','export_pending','returned'].includes(d.status))$('#slNote').innerHTML='<b style="color:#b7791f">'+esc(H.stLabel(d.status,d.total,d.returned_amount))+' · phiếu xuất tạo lúc '+new Date(d.exported_at).toLocaleString('vi-VN')+'.</b> Xuất lại có thể trừ tồn hai lần.';
    if(d&&d.status==='exported')await drawReturn(d);
    if(d&&d.status==='returned'){$('#slGo').disabled=true;$('#slSum').textContent='Báo giá đã hoàn kho toàn bộ, công nợ của đơn = 0. Muốn bán lại hãy tạo báo giá mới.'}
  }catch(e){$('#slRows').innerHTML='<tr><td colspan="6" style="color:#d4472a">Không tải được tồn kho: '+esc(e.message||e)+'</td></tr>'}
}
const btn=document.createElement('button');btn.type='button';btn.className='btn btn-secondary';btn.id='stockCheckBtn';btn.textContent='▦ Tồn kho / Xuất kho';btn.onclick=open;
const box=$('.heading-actions');if(box)box.insertBefore(btn,$('#saveQuoteBtn'));
})();
