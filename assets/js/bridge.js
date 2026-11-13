(()=>{'use strict';
const me=document.currentScript,route=me&&me.dataset.route;
if(top===self){if(route)location.replace('../../index.html#/'+route);return}
const st=document.createElement('style');
st.textContent='.sidebar,.topbar,.mobile-nav-backdrop,.page-footer,.mobile-menu-btn,.help-card{display:none!important}.app-shell{display:block!important}.main-content{margin:0!important;max-width:none!important;width:auto!important;padding-top:4px!important}body{background:transparent!important}';
document.head.appendChild(st);document.documentElement.classList.add('embedded');
try{parent.postMessage({hhh:'route',route},location.origin)}catch(e){}
const C=window.APP_CONFIG||{};
const sb=window.supabase&&C.SUPABASE_URL?window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_KEY):null;
const total=p=>Math.max(0,Number(p&&p.totals&&(p.totals.grand??p.totals.total)||0)-Number(p&&p.totals&&p.totals.oldDebt||0));

async function all(t){let a=[],f=0;for(;;){const r=await sb.from(t).select('*').order('id').range(f,f+999);if(r.error)throw r.error;a=a.concat(r.data);if(r.data.length<1000)break;f+=1000}return a}
const SRC={
 nhomthanh:async()=>({Data:(await all('catalog_aluminum')).map(r=>({'Hệ Nhôm':r.system,'Mã Hàng hóa':r.code,'Tên Hàng hóa':r.name,'ĐVT':r.unit,'Màu':r.color,'Khối lượng (kg/thanh)':Number(r.weight_kg),'Đơn giá':Number(r.price)}))}),
 phukien:async()=>(await all('catalog_accessories')).map(r=>({system:r.system,code:r.code,name:r.name,unit:r.unit,grp:r.grp,price:Number(r.price)})),
 customers:async()=>(await all('customers')).map(r=>({MaKhachHang:r.code,TenKhachHang:r.name,SoDienThoai:r.phone,DiaChi:r.address,Ghichu:r.note,id:r.code,name:r.name,phone:r.phone,address:r.address,note:r.note}))};
const _f=window.fetch.bind(window);
window.fetch=(u,o)=>{const m=/data\/(nhomthanh|phukien|customers)\.json/.exec(String(u));if(!m||!sb)return _f(u,o);
 return SRC[m[1]]().then(d=>new Response(JSON.stringify(d),{status:200,headers:{'Content-Type':'application/json'}})).catch(e=>{console.warn(e);return new Response('{}',{status:500})})};
const ST={draft:'Nháp',confirmed:'Đã chốt',export_pending:'Chờ duyệt xuất kho',exported:'Đã xuất kho',returned:'Đã hoàn kho',cancelled:'Đã hủy'};
window.HHH={sb,ST,
  // Nhãn trạng thái dùng chung cho mọi trang: hoàn kho hiện kèm số tiền đã trừ công nợ.
  stLabel(st,total,ret){ret=Number(ret)||0;if(st==='returned')return 'Đã hoàn kho toàn bộ';if(st==='exported'&&ret>0)return 'Đã xuất kho · hoàn '+Math.round(ret).toLocaleString('vi-VN')+' đ';return ST[st]||ST.draft},
  async listQuotes(){if(!sb)throw new Error('no-supabase');const r=await sb.from('quotes').select('payload,status,total,returned_amount').order('updated_at',{ascending:false}).limit(5000);if(r.error)throw r.error;return r.data.map(x=>({...x.payload,_st:x.status,_total:x.total,_ret:x.returned_amount}))},
  async saveQuote(p){if(!sb)return;const q=p.quote||{},c=p.customer||{};if(!q.code)return;
    const r=await sb.from('quotes').upsert({code:q.code,customer_name:c.name||'',customer_phone:c.phone||'',total:total(p),payload:p,updated_at:new Date().toISOString()},{onConflict:'code'});if(r.error)throw r.error;try{await sb.rpc('link_quote_customer',{p_code:q.code})}catch(e){}}};
})();
