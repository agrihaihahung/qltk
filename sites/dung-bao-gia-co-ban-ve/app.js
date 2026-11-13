/* UI controller — form and preview. Drawing geometry lives in door-drawing.js */
const $ = id => document.getElementById(id);
const systems = {
 'sliding-turn-4-fix':{title:'BẢN VẼ KỸ THUẬT SẢN XUẤT CỬA ĐI TRƯỢT QUAY 4 CÁNH CÓ Ô FIX',panels:4,type:'4C-FIX (Trượt quay)',code:'TQ-4C-FIX',arrows:true,fix:true},
 'sliding-turn-2-fix':{title:'BẢN VẼ KỸ THUẬT SẢN XUẤT CỬA ĐI TRƯỢT QUAY 2 CÁNH CÓ Ô FIX',panels:2,type:'2C-FIX (Trượt quay)',code:'TQ-2C-FIX',arrows:true,fix:true},
 'sliding-turn-4':{title:'BẢN VẼ KỸ THUẬT SẢN XUẤT CỬA ĐI TRƯỢT QUAY 4 CÁNH',panels:4,type:'4C-N (Trượt quay)',code:'TQ-4C',arrows:true},
 'sliding-2':{title:'BẢN VẼ KỸ THUẬT SẢN XUẤT CỬA TRƯỢT QUAY 2 CÁNH',panels:2,type:'2C (Cửa lùa)',code:'L-2C',arrows:true},
 'sliding-3':{title:'BẢN VẼ KỸ THUẬT SẢN XUẤT CỬA LÙA 3 CÁNH',panels:3,type:'3C (Cửa lùa)',code:'L-3C',arrows:true},
 'slim-oneway-2':{title:'BẢN VẼ KỸ THUẬT SẢN XUẤT CỬA ĐI TRƯỢT QUAY SLIM 1 CHIỀU 2 CÁNH',panels:2,type:'2C Slim (Trượt quay 1 chiều)',code:'TQS-2C',arrows:true,oneWay:true,slim:true,imageGroup:'slim-2'},
 'slim-oneway-4':{title:'BẢN VẼ KỸ THUẬT SẢN XUẤT CỬA ĐI TRƯỢT QUAY SLIM 1 CHIỀU 4 CÁNH',panels:4,type:'4C Slim (Trượt quay 1 chiều)',code:'TQS-4C',arrows:true,oneWay:true,slim:true,imageGroup:'slim-4'},
 'swing-2':{title:'BẢN VẼ KỸ THUẬT SẢN XUẤT CỬA MỞ QUAY 2 CÁNH',panels:2,type:'2C (Mở quay)',code:'MQ-2C',arrows:false},
 'swing-1':{title:'BẢN VẼ KỸ THUẬT SẢN XUẤT CỬA MỞ QUAY 1 CÁNH',panels:1,type:'1C (Mở quay)',code:'MQ-1C',arrows:false}
};
function currentSide(){return $('openSide').value==='right'?'right':'left';}
function makeDrawingCode(){
 const s=systems[$('system').value];
 const w=Math.max(100,+$('width').value||2800);
 const h=Math.max(100,+$('height').value||2400);
 const side=s.oneWay?(currentSide()==='left'?'-T':'-P'):'';
 return `BVSX: ${s.code}${side}-${w}x${h}`;
}
function draw(){
 const w=Math.max(100,+$('width').value||2800),h=Math.max(100,+$('height').value||2400),s=systems[$('system').value];
 $('codeInput').value=makeDrawingCode();
 window.DoorDrawing.render({svg:$('doorSvg'),width:w,height:h,system:Object.assign({},s,{openSide:currentSide()})});
 $('vWidth').textContent=w+' mm';$('vHeight').textContent=h+' mm';$('vType').textContent=s.type;
 $('vTitle').textContent=s.title;
 $('vCode').textContent=makeDrawingCode();
}
function updateLayout(){
 const layout=$('layout').value;
 document.body.classList.toggle('layout-landscape',layout==='landscape');
 document.body.classList.toggle('layout-portrait',layout==='portrait');
 let style=document.getElementById('dynamicPageStyle');
 if(!style){style=document.createElement('style');style.id='dynamicPageStyle';document.head.appendChild(style);}
 style.textContent=layout==='landscape'?'@page{size:A4 landscape;margin:0}':'@page{size:A4 portrait;margin:0}';
}
function update(){
 updateLayout();draw();
 const map={company:'vCompany',address:'vAddress',brand:'vBrand',profile:'vProfile',leaf:'vLeaf',color:'vColor',lock:'vLock',glass:'vGlass',hardware:'vHardware',maker:'vMaker',notes:'vNotes',approver:'vApprover'};
 for(const [a,b] of Object.entries(map))$(b).textContent=$(a).value;
 $('vFooterCompany').textContent=$('company').value;$('vFooterAddress').textContent=$('address').value;
 $('vProject').textContent='Công trình: '+systems[$('system').value].type+' - Khách hàng';
 // Đồng bộ dữ liệu sang trang 2. Kích thước bóc tách là ước tính tham khảo.
 const sys=systems[$('system').value], isFix=!!sys.fix, count=sys.panels;
 $('p2Company').textContent=$('company').value+' - SƠ ĐỒ MẶT CẮT SẢN XUẤT';
 $('p2Profile').textContent=$('profile').value+' '+$('brand').value;
 $('p2Dimensions').textContent=`${Math.max(100,+$('width').value||2800)} × ${Math.max(100,+$('height').value||2400)} mm`;
 const W=Math.max(100,+$('width').value||2800), H=Math.max(100,+$('height').value||2400);
 const panelsKey=count===4?'4':'2';
 const direction=$('openingDirection') ? $('openingDirection').value : 'outside';
 const side=currentSide();
 $('openSideWrap').style.display=sys.oneWay?'':'none';
 const fallback=`assets/${panelsKey}-${direction}.png`;
 // Thứ tự ưu tiên ảnh slim: đúng hướng+chiều -> đúng chiều -> ảnh slim chung -> ảnh hệ thường
 const cands=sys.oneWay?[
  `assets/${sys.imageGroup}-${direction}-${side}.png`,
  `assets/${sys.imageGroup}-${side}.png`,
  `assets/${sys.imageGroup}.png`,
  fallback]:[fallback];
 const want=cands.join('|');
 const img=$('p2OriginalDrawing');
 if(img.dataset.want!==want){
  img.dataset.want=want;
  let k=0;
  const load=()=>{img.src=cands[k];};
  img.onload=()=>{$('imgHint').textContent=(sys.oneWay&&k===cands.length-1)?`Chưa có ảnh slim cho lựa chọn này (${cands[0]}) — đang dùng ảnh tạm ${cands[k]}.`:'';};
  img.onerror=()=>{if(k<cands.length-1){k++;load();}};
  load();
 }
 $('p2DrawingTitle').textContent=`BẢN VẼ KỸ THUẬT HỆ CỬA — ${direction==='outside'?'MỞ NGOÀI':'MỞ TRONG'}`+(sys.oneWay?` — MỞ QUA ${side==='left'?'TRÁI':'PHẢI'}`:'');
 $('p2DoorType').textContent=sys.type;
 $('p2SizeCell').textContent=`${W} × ${H} mm`;
 $('p2BrandCell').textContent=$('brand').value;
 $('p2ProfileCell').textContent=$('profile').value;
 $('p2LeafCell').textContent=$('leaf').value;
 $('p2GlassCell').textContent=$('glass').value;
 $('p2FooterCompany').textContent=$('company').value+' - XƯỞNG SẢN XUẤT';
 $('p2Code').textContent=makeDrawingCode().replace('BVSX: ','')+'-P2';

 let d=$('date').value;if(d){const [y,m,day]=d.split('-');$('vDate').textContent=`${day}-${m}-${y}`;}
}
function resetExample(){
 $('system').value='sliding-turn-4';$('width').value=2800;$('height').value=2400;
 $('brand').value='Kögen';$('profile').value='Hệ TQ-86';$('leaf').value='35 x 86 mm';$('color').value='Ghi Xám';update();
}
document.querySelectorAll('input,select,textarea').forEach(el=>{el.addEventListener('input',update);el.addEventListener('change',update);});
update();
