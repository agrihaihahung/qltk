// Chạy: node tests/test-report.mjs  (kiểm tra logic lọc/tổng hợp phía trình duyệt của trang Báo cáo, không cần Supabase)
// Phần SQL (supabase-update-17.sql, supabase-update-18.sql) không chạy ở đây: xem câu KIỂM TRA cuối mỗi file.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const h=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=h.slice(h.indexOf('/* =================== BÁO CÁO'),h.indexOf('/* =================== PHÂN QUYỀN'));
const el=()=>({innerHTML:'',textContent:'',value:'',hidden:false,classList:{toggle(){}},set onclick(f){},set onchange(f){},set oninput(f){}});
const E={};const $=s=>E[s]||(E[s]=el());
globalThis.document={querySelectorAll:()=>[]};
const nrm=s=>String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');
const fmt=n=>Number(n).toLocaleString('vi-VN',{maximumFractionDigits:2});
const esc=s=>String(s==null?'':s);
const items=[{id:1,code:'K55-01',name:'Cửa đi',type:'Thanh định hình',spec:'Xingfa 55 · 6m',fin:'Trắng',unit:'thanh'},{id:2,code:'PK-1',name:'Khóa',type:'Phụ kiện',spec:'',fin:'',unit:'chiếc'}];
const R=(o)=>({item_id:null,user_email:'a@x',note:'',grp:'g',src:'quote',ref:'BG-1',cust:'Anh Nam',value:null,...o});
const sales=[
  R({id:1,created_at:'2026-11-05T03:00:00Z',code:'K55-01',qty:10,item_id:1,grp:'g1',value:1000}),
  R({id:2,created_at:'2026-11-05T03:00:01Z',code:'PK-1',qty:5,item_id:2,grp:'g1',value:500}),
  R({id:3,created_at:'2026-11-06T03:00:00Z',code:'K55-01',qty:2,item_id:1,grp:'g2',src:'image',ref:'r1',cust:'anh nam',value:null}),     // chưa có giá
  R({id:4,created_at:'2026-11-07T03:00:00Z',code:'PK-1',qty:1,item_id:2,grp:'g3',cust:'Chị Lan',value:200}),
  R({id:null,created_at:'2026-11-08T03:00:00Z',code:'PK-1',qty:-2,item_id:null,grp:'HK|BG-1|x',src:'return',cust:'Anh Nam',value:-200})];  // hoàn kho: số âm
const S2=(o)=>({id:null,item_id:1,user_email:'k@x',note:'',grp:'s',ref:null,party:'',value:null,...o});
const stock=[
  S2({id:10,created_at:'2026-11-01T03:00:00Z',code:'K55-01',qty:100,grp:'in1',typ:'in',src:'in',party:'NCC Việt'}),
  S2({id:11,created_at:'2026-11-02T03:00:00Z',code:'PK-1',qty:50,item_id:2,grp:'in2',typ:'in',src:'in',party:''}),                      // nhập không ghi nhà cung cấp
  S2({id:12,created_at:'2026-11-09T03:00:00Z',code:'K55-01',qty:3,grp:'rt1',typ:'return',src:'hk',ref:'BG-1',party:'Anh Nam',value:300}),
  S2({id:13,created_at:'2026-11-10T03:00:00Z',code:'PK-1',qty:1,item_id:2,grp:'rt2',typ:'return',src:'void',party:'Chị Lan',value:null})];
const views={report_sales:sales,report_stock:stock};
const sb={from:t=>{const data=views[t];const q={select:()=>q,order:()=>q,range:()=>Promise.resolve({data})};return q}};
const fetchAll=async mk=>({data:(await mk().range(0,999)).data});
const f=new Function('$','nrm','fmt','esc','S','sb','fetchAll','itemById','sysOf','dateVi','rpcMsg',code+';return {RP,loadRpt,rpFiltered,rpOrders,rpOrdN,rpSum,rpRows,rpDraw}');
const S={items},{RP,loadRpt,rpFiltered,rpOrders,rpOrdN,rpSum,rpRows,rpDraw}=f($,nrm,fmt,esc,S,sb,fetchAll,id=>items.find(i=>i.id===id),i=>String(i.spec).split('·')[0].trim(),t=>t,e=>e.message);
await loadRpt();
assert.equal(RP.sales.rows.length,5);
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
// Hàng nhập vào / hàng hoàn tồn: cùng view report_stock, tách theo typ
RP.f={codes:[],cust:[],mode:'order'};
RP.type='in';assert.equal(rpRows().length,2);assert.equal(rpFiltered().length,2);
assert.equal(rpRows().find(r=>r.code==='PK-1').cust,'(không ghi nhà cung cấp)');
RP.f={codes:[],cust:['NCC Việt'],mode:'order'};assert.equal(rpFiltered().length,1);
RP.f={codes:[],cust:[],mode:'order'};
RP.type='ret';assert.equal(rpRows().length,2);assert.equal(rpSum(rpFiltered(),'amt'),300);   // chỉ dòng có giá mới cộng
RP.f={codes:[],cust:[],mode:'order',sys:'Xingfa 55'};assert.equal(rpFiltered().length,1);
// Vẽ đủ 4 loại (+ 2 cách xem doanh thu khách) không lỗi, và nội dung có số liệu
RP.f={codes:[],cust:[],mode:'order'};
for(const [t,m] of [['sold','order'],['cust','order'],['cust','line'],['in','order'],['ret','order']]){RP.type=t;RP.f.mode=m;rpDraw();assert.ok(E['#rpBody'].innerHTML.includes('<tr>'),t);assert.ok(E['#rpKpi'].innerHTML.includes('stat'),t)}
RP.type='in';rpDraw();assert.ok(!E['#rpHead'].innerHTML.includes('Giá trị'));   // hàng nhập vào không có cột giá trị
RP.type='ret';rpDraw();assert.ok(E['#rpHead'].innerHTML.includes('Giá trị'));
views.report_stock=undefined;                                                    // thiếu view: báo rõ cần chạy SQL nào
RP.stock={err:{message:'relation "report_stock" does not exist'}};RP.type='in';rpDraw();assert.ok(E['#rpBody'].innerHTML.includes('update-18'));
console.log('OK');
