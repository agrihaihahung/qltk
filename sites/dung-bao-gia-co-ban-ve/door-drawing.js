/* ============================================================
   DOOR DRAWING ENGINE — TRƯỢT QUAY
   Hình tự co giãn theo tỷ lệ W/H nhập vào; có kích thước ngang và cao.
   Bố cục cửa 4 cánh + ô fix bám theo ảnh mẫu:
     - 2 cánh trượt ở giữa (mỗi cánh ~27% bề rộng), tay nắm đôi dạng "[ ]"
       đặt thấp hơn tâm cửa (~61% chiều cao).
     - 2 cánh ngoài là cánh cố định, vẽ chữ V (chevron) có đỉnh hướng ra ngoài.
     - Ô fix phía trên chia 3 khoang, thanh đố nằm đúng giữa đố đứng của cánh trượt.
   Hệ slim 1 chiều: system.oneWay=true, system.slim=true, system.openSide='left'|'right'.
   Phân biệt 2 kiểu cửa slim 1 chiều:
     - TRƯỢT QUAY : system.swing=true (mặc định) -> có 1 cánh quay ở phía mở (vẽ chữ V +
                    mũi tên gập "trượt rồi quay"); các cánh còn lại là cánh trượt (mũi tên thẳng).
     - TRƯỢT THƯỜNG: system.swing=false -> KHÔNG có chữ V; cánh ở phía mở là cánh cố định
                    (không mũi tên), các cánh còn lại trượt về phía đó.
   API: DoorDrawing.render({svg, width, height, system})
   ============================================================ */
(function(global){
  'use strict';
  const STYLE = {
    frame:'#a5a9a8', frameEdge:'#6d7473', glass:'#b0f5e8',
    glassEdge:'#6f7877', glassHighlight:'#8fdcd0',
    bevelTop:'#bcc0bf', bevelBottom:'#a0a4a3', bevelLeft:'#b2b6b5', bevelRight:'#9fa3a2',
    movement:'#2d6cb5', handle:'#141c2b',
    dimension:'#34495e'
  };
  const GEOMETRY = {
    viewBox:{width:800,height:600},
    // Vùng tối đa dành cho khung cửa, chừa lề cho đường kích thước.
    fit:{left:90,top:70,width:640,height:450},
    // Các tỷ lệ đo từ ảnh mẫu
    fixPaneRatio:0.146,      // chiều cao khoang kính ô fix / chiều cao lòng khung
    fixTotalRatio:0.182,     // ô fix + thanh ngang / chiều cao lòng khung
    slideLeafRatio:0.27,     // bề rộng mỗi cánh trượt / bề rộng lòng khung (4 cánh)
    handleCenterRatio:0.61,  // vị trí tâm tay nắm theo chiều cao cánh (từ trên xuống)
    handleHeightRatio:0.18,
    dimensionOffset:25
  };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  /* ---------- Primitive ---------- */
  function rect(x,y,w,h,fill,stroke=STYLE.frameEdge,sw=1,extra=''){
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
  }
  function line(x1,y1,x2,y2,stroke=STYLE.frameEdge,sw=1,extra=''){
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
  }
  function polygon(points,fill,stroke=STYLE.frameEdge,sw=1){
    return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  }

  /* ---------- Khung có vát mép 45° (dùng cho khung bao và cánh) ---------- */
  function bevelFrame(x,y,w,h,b,glass,glassStroke=STYLE.glassEdge){
    let s=rect(x,y,w,h,STYLE.frame,STYLE.frameEdge,1);
    const e='#7b8282', sw=.6;
    s+=polygon(`${x},${y} ${x+w},${y} ${x+w-b},${y+b} ${x+b},${y+b}`,STYLE.bevelTop,e,sw);
    s+=polygon(`${x},${y+h} ${x+w},${y+h} ${x+w-b},${y+h-b} ${x+b},${y+h-b}`,STYLE.bevelBottom,e,sw);
    s+=polygon(`${x},${y} ${x+b},${y+b} ${x+b},${y+h-b} ${x},${y+h}`,STYLE.bevelLeft,e,sw);
    s+=polygon(`${x+w},${y} ${x+w-b},${y+b} ${x+w-b},${y+h-b} ${x+w},${y+h}`,STYLE.bevelRight,e,sw);
    if(glass){
      s+=rect(x+b,y+b,w-2*b,h-2*b,glass,glassStroke,.8);
      if(w-2*b>8&&h-2*b>8)
        s+=rect(x+b+2,y+b+2,w-2*b-4,h-2*b-4,'none',STYLE.glassHighlight,.4);
    }
    return s;
  }

  /* ---------- Ký hiệu chuyển động ---------- */
  // Mũi tên đặc: dir=1 hướng sang phải, dir=-1 sang trái
  function drawArrow(cx,cy,len,head,dir){
    const tipX=cx+dir*len/2, tailX=cx-dir*len/2, hh=head*.68;
    let s=line(tailX,cy,tipX-dir*head*.6,cy,STYLE.movement,1.3);
    s+=polygon(`${tipX},${cy} ${tipX-dir*head},${cy-hh} ${tipX-dir*head},${cy+hh}`,STYLE.movement,STYLE.movement,.4);
    return s;
  }
  // Mũi tên gập (trượt rồi quay) cho cánh quay: đi ngang theo dir rồi gập xuống, đầu mũi tên chỉ xuống
  function drawBentArrow(cx,cy,len,head,dir){
    const vl=len*.5, ys=cy-vl/2;
    const xs=cx-dir*len/2, xe=cx+dir*len/2, hh=head*.68;
    let s=`<polyline points="${xs},${ys} ${xe},${ys} ${xe},${ys+vl-head*.6}" fill="none" stroke="${STYLE.movement}" stroke-width="1.3" stroke-linejoin="round"/>`;
    s+=polygon(`${xe},${ys+vl} ${xe-hh},${ys+vl-head} ${xe+hh},${ys+vl-head}`,STYLE.movement,STYLE.movement,.4);
    return s;
  }
  // Chữ V cánh cố định: đỉnh tại apexX, hai đầu tại farX (trên & dưới kính)
  function drawChevron(apexX,farX,topY,botY){
    const midY=(topY+botY)/2;
    return line(farX,topY,apexX,midY,STYLE.movement,1.2)+line(apexX,midY,farX,botY,STYLE.movement,1.2);
  }

  /* ---------- Tay nắm "[ ]" ---------- */
  // side='left' vẽ "[" ; side='right' vẽ "]"
  function drawBracket(x0,cy,hw,hh,side){
    const y0=cy-hh/2, ft=Math.max(3,hh*.09), bt=Math.max(2,hw*.32);
    let d;
    if(side==='left'){
      d=`M${x0} ${y0} H${x0+hw} V${y0+ft} H${x0+bt} V${y0+hh-ft} H${x0+hw} V${y0+hh} H${x0} Z`;
    } else {
      d=`M${x0+hw} ${y0} H${x0} V${y0+ft} H${x0+hw-bt} V${y0+hh-ft} H${x0} V${y0+hh} H${x0+hw} Z`;
    }
    return `<path d="${d}" fill="${STYLE.handle}" stroke="${STYLE.handle}" stroke-width=".8" stroke-linejoin="round"/>`;
  }
  function drawHandlePair(c,y,h,w,s){
    const hw=Math.min(w*.0154,s*.62), gap=hw*.35;
    const hh=h*GEOMETRY.handleHeightRatio, cy=y+h*GEOMETRY.handleCenterRatio;
    return drawBracket(c-gap-hw,cy,hw,hh,'left')+drawBracket(c+gap,cy,hw,hh,'right');
  }

  /* ---------- Cánh cửa ---------- */
  function drawFourLeaf(x,y,w,h,s){
    const c=x+w/2, lw=w*GEOMETRY.slideLeafRatio;
    const slideLx=c-lw, slideRx=c+lw;
    const gTop=y+s, gBot=y+h-s;
    let out='';
    // Hai cánh ngoài (cố định) – kéo dài vào dưới đố của cánh trượt
    out+=bevelFrame(x,y,slideLx+s-x,h,s,STYLE.glass);
    out+=drawChevron(x+s+1.5,slideLx+s/2,gTop,gBot);
    const rx=slideRx-s;
    out+=bevelFrame(rx,y,x+w-rx,h,s,STYLE.glass);
    out+=drawChevron(x+w-s-1.5,slideRx-s/2,gTop,gBot);
    // Hai cánh trượt ở giữa
    out+=bevelFrame(slideLx,y,lw,h,s,STYLE.glass);
    out+=bevelFrame(c,y,lw,h,s,STYLE.glass);
    out+=line(c,y+1,c,y+h-1,'#4f5758',1);
    // Mũi tên đối nhau
    const gw=lw-2*s, len=gw*.4, head=gw*.12, cy=y+h/2;
    out+=drawArrow(c-lw/2,cy,len,head,1);
    out+=drawArrow(c+lw/2,cy,len,head,-1);
    out+=drawHandlePair(c,y,h,w,s);
    return {svg:out, mullions:[slideLx+s/2, slideRx-s/2]};
  }
  function drawTwoLeaf(x,y,w,h,s){
    const c=x+w/2, gTop=y+s, gBot=y+h-s;
    let out='';
    // Cánh phải cố định (vẽ trước), cánh trái trượt đè lên
    const rx=c-s/2;
    out+=bevelFrame(rx,y,x+w-rx,h,s,STYLE.glass);
    out+=drawChevron(x+w-s-1.5,c+s/2,gTop,gBot);
    out+=bevelFrame(x,y,w/2+s/2,h,s,STYLE.glass);
    out+=line(c,y+1,c,y+h-1,'#4f5758',1);
    const gx0=x+s, gx1=c-s/2, gw=gx1-gx0;
    out+=drawArrow((gx0+gx1)/2,y+h/2,Math.min(gw*.4,70),Math.min(gw*.12,22),1);
    out+=drawHandlePair(c,y,h,w,s);
    return {svg:out, mullions:[]};
  }

  // Cửa slim 1 chiều (n cánh bằng nhau, các cánh trượt về cùng một phía = phía mở).
  // swing=true  -> TRƯỢT QUAY: 4 cánh chia 2:2 (bỏ qua openSide), 2 cánh thì 1 cánh quay theo openSide. 4 cánh: 2 cánh ngoài là cánh quay (chữ V + mũi tên gập),
  //                các cánh còn lại là cánh trượt (mũi tên thẳng).
  // swing=false -> TRƯỢT THƯỜNG: không có chữ V; cánh ngoài cùng phía mở là cánh cố định
  //                (không mũi tên), các cánh còn lại trượt (mũi tên thẳng).
  // side='left' : phía mở bên trái (cánh đặc biệt là cánh đầu tiên); 'right': đối xứng.
  function drawOneWay(x,y,w,h,s,n,side,swing){
    const lw=(w+(n-1)*s)/n, step=lw-s;
    const gTop=y+s, gBot=y+h-s, cy=y+h/2;
    const dir=side==='right'?1:-1;
    const edgeIdx=side==='right'?n-1:0;           // cánh ngoài cùng phía mở
    const gw=lw-2*s, len=Math.min(gw*.4,70), head=Math.min(gw*.12,22);
    let out='';
    for(let i=0;i<n;i++) out+=bevelFrame(x+i*step,y,lw,h,s,STYLE.glass);
    if(swing&&n!==4){
      // TRƯỢT QUAY 2 cánh (không chia 2:2): 1 cánh quay ở phía mở (chữ V + mũi tên gập),
      // các cánh còn lại trượt về phía mở (mũi tên thẳng).
      if(side==='right') out+=drawChevron(x+w-s-1.5,x+edgeIdx*step+s/2,gTop,gBot);
      else out+=drawChevron(x+s+1.5,x+lw-s/2,gTop,gBot);
      for(let i=0;i<n;i++){
        const cx=x+i*step+lw/2;
        out+=i===edgeIdx?drawBentArrow(cx,cy,len,head,dir):drawArrow(cx,cy,len,head,dir);
      }
      return {svg:out, mullions:[]};
    }
    if(swing){
      // TRƯỢT QUAY 4 cánh chia 2:2 (theo bản vẽ mẫu):
      //  - 2 cánh ngoài cùng là cánh QUAY: chữ V đỉnh hướng ra ngoài + mũi tên gập
      //  - các cánh giữa trượt ngược chiều nhau ra 2 bên (nửa trái ←, nửa phải →)
      const half=n/2;
      out+=drawChevron(x+s+1.5,x+lw-s/2,gTop,gBot);                       // cánh quay trái
      out+=drawChevron(x+w-s-1.5,x+(n-1)*step+s/2,gTop,gBot);             // cánh quay phải
      for(let i=0;i<n;i++){
        const cx=x+i*step+lw/2;
        if(i===half-.5){ continue; }                                      // n lẻ: cánh giữa cố định
        const d=i<half?-1:1;
        if(i===0||i===n-1) out+=drawBentArrow(cx,cy,len,head,d);          // trượt rồi quay
        else out+=drawArrow(cx,cy,len,head,d);
      }
      return {svg:out, mullions:[]};
    }
    for(let i=0;i<n;i++){
      const cx=x+i*step+lw/2;
      if(i!==edgeIdx) out+=drawArrow(cx,cy,len,head,dir);   // trượt thường: cánh phía mở cố định
    }
    return {svg:out, mullions:[]};
  }

  /* ---------- Render ---------- */
  function render(config){
    const svg=config.svg, w=Math.max(100,Number(config.width)||2800), h=Math.max(100,Number(config.height)||2400);
    const system=config.system||{}, panels=Number(system.panels)||2;
    const vb=GEOMETRY.viewBox, fit=GEOMETRY.fit;
    // Tỷ lệ khung trên hình luôn theo W/H, không làm méo cửa.
    const aspect=w/h;
    let frameW=fit.width, frameH=frameW/aspect;
    if(frameH>fit.height){frameH=fit.height;frameW=frameH*aspect;}
    frameW=Math.max(70,frameW); frameH=Math.max(90,frameH);
    const x=fit.left+(fit.width-frameW)/2, y=fit.top+(fit.height-frameH)/2;

    // Độ dày theo tỷ lệ ảnh mẫu
    const u=Math.min(frameW,frameH);
    const t=clamp(u*.016,5,14);      // khung bao
    const s=clamp(u*.028,8,22)*(system.slim?.62:1);  // đố / thanh cánh (slim: mảnh hơn)
    const ix=x+t, iy=y+t, iw=frameW-2*t, ih=frameH-2*t;

    let out=`<rect x="0" y="0" width="${vb.width}" height="${vb.height}" fill="#fff"/>`;

    // Kích thước ngang
    const dimY=y-18;
    out+=line(x,dimY,x+frameW,dimY,STYLE.dimension,1,'stroke-dasharray="3 2"');
    out+=line(x,dimY-5,x,dimY+5,STYLE.dimension,1);
    out+=line(x+frameW,dimY-5,x+frameW,dimY+5,STYLE.dimension,1);
    out+=`<text x="${x+frameW/2}" y="${dimY-7}" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#172033">${w} mm</text>`;
    // Kích thước cao
    const dimX=x-25;
    out+=line(dimX,y,dimX,y+frameH,STYLE.dimension,1,'stroke-dasharray="3 2"');
    out+=line(dimX-5,y,dimX+5,y,STYLE.dimension,1);
    out+=line(dimX-5,y+frameH,dimX+5,y+frameH,STYLE.dimension,1);
    out+=`<text x="${dimX-8}" y="${y+frameH/2}" text-anchor="middle" transform="rotate(-90 ${dimX-8} ${y+frameH/2})" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#172033">${h} mm</text>`;

    // Khung bao (không kính, phần lòng sẽ được vẽ đè lên)
    out+=bevelFrame(x,y,frameW,frameH,t,null);

    // Vùng cánh
    let doorY=iy, doorH=ih, mullions=[];
    const leafFn=system.oneWay
      ? (a,b,c,d,e)=>drawOneWay(a,b,c,d,e,panels,system.openSide||'left',system.swing!==false)
      : (panels===4?drawFourLeaf:drawTwoLeaf);

    if(system.fix){
      const paneH=ih*GEOMETRY.fixPaneRatio;
      const totalH=ih*GEOMETRY.fixTotalRatio;
      doorY=iy+totalH; doorH=ih-totalH;
      const leaf=leafFn(ix,doorY,iw,doorH,s);
      mullions=leaf.mullions;

      // Nền ô fix
      out+=rect(ix,iy,iw,totalH,STYLE.frame,STYLE.frameEdge,1);
      // Các khoang kính ô fix (chia theo đố của cánh trượt khi 4 cánh)
      const q=Math.max(2.5,s*.2), mw=s*.65;
      const cuts=[ix,...mullions.flatMap(m=>[m-mw/2,m+mw/2]),ix+iw];
      for(let i=0;i<cuts.length;i+=2){
        const px=cuts[i], pw=cuts[i+1]-cuts[i];
        out+=rect(px+q,iy+q,pw-2*q,paneH-q,STYLE.glass,STYLE.glassEdge,.8);
        out+=rect(px+q+2,iy+q+2,pw-2*q-4,paneH-q-4,'none',STYLE.glassHighlight,.4);
      }
      // Thanh ngang (transom) có 2 đường gờ như ảnh mẫu
      const ty=iy+paneH;
      out+=rect(ix,ty,iw,totalH-paneH,STYLE.frame,STYLE.frameEdge,1);
      out+=line(ix,ty+(totalH-paneH)*.28,ix+iw,ty+(totalH-paneH)*.28,'#7b8282',.7);
      out+=line(ix,ty+(totalH-paneH)*.5,ix+iw,ty+(totalH-paneH)*.5,'#7b8282',.5);
      out+=leaf.svg;
    } else {
      out+=leafFn(ix,doorY,iw,doorH,s).svg;
    }

    svg.setAttribute('viewBox',`0 0 ${vb.width} ${vb.height}`);
    svg.setAttribute('preserveAspectRatio','xMidYMid meet');
    svg.innerHTML=out;
    return {width:w,height:h,panels,aspect};
  }

  /* ---------- Quy tắc đặt tên ảnh mặt cắt (khớp thư mục assets) ----------
       Cửa thường         : {số cánh}-{inside|outside}              vd: 2-inside, 4-outside
       Slim 2 cánh        : slim-2-{inside|outside}-{left|right}    vd: slim-2-inside-left, slim-2-outside-right
       Slim 4 cánh        : slim-4-{inside|outside}                 vd: slim-4-inside, slim-4-outside
     - inside/outside : hướng mở (bản vẽ kỹ thuật trang 2)
     - left/right     : chiều mở cánh, CHỈ dùng cho slim 2 cánh (slim 4 cánh chia 2:2 đối xứng)
     Tên ảnh = tên trên + phần mở rộng (.png). */
  const SECTION_DIRS=['inside','outside'], SECTION_SIDES=['left','right'];

  function sectionName(o){
    o=o||{};
    const n=Number(o.panels)||2;
    const dir=SECTION_DIRS.includes(o.openDir)?o.openDir:'outside';
    const side=SECTION_SIDES.includes(o.openSide)?o.openSide:'left';
    if(o.slim) return n===2?`slim-2-${dir}-${side}`:`slim-${n}-${dir}`;
    return `${n}-${dir}`;
  }
  // Tách tên ngược lại thành cấu hình; trả về null nếu sai cấu trúc
  function parseSectionName(name){
    const t=String(name||'').replace(/\.[a-z0-9]+$/i,'');
    let m=/^slim-2-(inside|outside)-(left|right)$/.exec(t);
    if(m) return {slim:true,panels:2,openDir:m[1],openSide:m[2]};
    m=/^slim-(\d+)-(inside|outside)$/.exec(t);
    if(m&&+m[1]!==2) return {slim:true,panels:+m[1],openDir:m[2],openSide:null};
    m=/^(\d+)-(inside|outside)$/.exec(t);
    return m?{slim:false,panels:+m[1],openDir:m[2],openSide:null}:null;
  }
  // Giữ để tương thích code gọi cũ: chỉ trả về đúng 1 tên theo quy tắc trên
  function sectionCandidates(o){ return [sectionName(o)]; }

  global.DoorDrawing={render,STYLE,GEOMETRY,sectionName,parseSectionName,sectionCandidates};
})(window);
