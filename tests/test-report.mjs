// Chạy: node tests/test-report.mjs  (kiểm tra logic lọc/tổng hợp phía trình duyệt của trang Báo cáo, không cần Supabase)
// Phần SQL (supabase-update-17.sql) không chạy ở đây: xem câu KIỂM TRA cuối file SQL.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const h=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=h.slice(h.indexOf('/* =================== BÁO CÁO'),h.indexOf('/* =================== PHÂN QUYỀN'));
const el=()=>({innerHTML:'',textContent:'',value:'',hidden:false,selectedOptions:[],options:[],set onclick(f){},set onchange(f){}});
const E={};const $=s=>E[s]||(E[s]=el());
globalThis.document={querySelectorAll:()=>[]};
const nrm=s=>String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');
const fmt=n=>Number(n).toLocaleString('vi-VN',{maximumFractionDigits:2});
const esc=s=>String(s==null?'':s);
const items=[{id:1,code:'K55-01',name:'Cửa đi',type:'Thanh định hình',spec:'Xingfa 55 · 6m',fin:'Trắng',unit:'thanh'},{id:2,code:'PK-1',name:'Khóa',type:'Phụ kiện',spec:'',fin:'',unit:'chiếc'}];
const R=(o)=>({item_id:null,user_email:'a@x',note:'',grp:'g',src:'quote',ref:'BG-1',cust:'Anh Nam',value:null,...o});
const data=[
  R({id:1,created_at:'2026-11-05T03:00:00Z',code:'K55-01',qty:10,item_id:1,grp:'g1',value:1000}),
  R({id:2,created_at:'2026-11-05T03:00:01Z',code:'PK-1',qty:5,item_id:2,grp:'g1',value:500}),
  R({id:3,created_at:'2026-11-06T03:00:00Z',code:'K55-01',qty:2,item_id:1,grp:'g2',src:'image',ref:'r1',cust:'anh nam',value:null}),     // chưa có giá
  R({id:4,created_at:'2026-11-07T03:00:00Z',code:'PK-1',qty:1,item_id:2,grp:'g3',cust:'Chị Lan',value:200}),
  R({id:null,created_at:'2026-11-08T03:00:00Z',code:'PK-1',qty:-2,item_id:null,grp:'HK|BG-1|x',src:'return',cust:'Anh Nam',value:-200})];  // hoàn kho: số âm
const sb={from:t=>{assert.equal(t,'report_sales');const q={select:()=>q,order:()=>q,range:()=>Promise.resolve({data})};return q}};
const fetchAll=async mk=>({data:(await mk().range(0,999)).data});
const f=new Function('$','nrm','fmt','esc','S','sb','fetchAll','itemById','sysOf','dateVi','rpcMsg',code+';return {RP,loadRpt,rpFiltered,rpOrders,rpOrdN,rpSum}');
const S={items},{RP,loadRpt,rpFiltered,rpOrders,rpOrdN,rpSum}=f($,nrm,fmt,esc,S,sb,fetchAll,id=>items.find(i=>i.id===id),i=>String(i.spec).split('·')[0].trim(),t=>t,e=>e.message);
await loadRpt();
assert.equal(RP.rows.length,5);
RP.f={codes:[],cust:[],mode:'order'};
const all=rpFiltered();
assert.equal(rpOrdN(all),3);                      // hoàn kho không tính là đơn
assert.equal(rpSum(all,'amt'),1500);              // 1000+500+200-200: doanh thu ròng
assert.equal(all.filter(r=>!r.hasP).length,1);    // 1 dòng chưa có giá, không bị tính thành 0 đ đã biết
RP.f={codes:[],cust:['ANH NAM'],mode:'order',sys:'Xingfa 55'};   // khách không phân biệt hoa/thường, lọc theo hệ
assert.equal(rpFiltered().length,2);
RP.f={codes:['PK-1'],cust:[],mode:'order',from:'2026-11-06'};    // lọc mã + từ ngày
assert.equal(rpFiltered().length,2);
RP.f={codes:[],cust:[],mode:'order',to:'2026-11-05'};            // đến ngày (cả ngày cuối)
assert.equal(rpOrders(rpFiltered()).length,1);
console.log('OK');
