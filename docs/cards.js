/* Gera cards 9:16 (1080x1920) com os KPIs, para stories/reels. Tudo em Canvas, no navegador. */
const CARD_W=1080, CARD_H=1920;
const CL={bg:"#04070a",amber:"#ffb340",green:"#3ff0a8",cyan:"#57d7ff",mut:"#7b938d",ink:"#e6efec",line:"#1c2e29",panel:"#0b1216"};
let WORLD=null;

const kmfmt=v=> v>=1e6 ? (v/1e6).toFixed(2).replace(".",",")+"m" : v>=1e3 ? Math.round(v/1e3)+"k" : ""+Math.round(v);
const colYear=(y,ymin,ymax)=>`hsl(${190-150*(y-ymin)/Math.max(1,ymax-ymin)},85%,60%)`;
function gcpts(a,b,n=40){const R=x=>x*Math.PI/180,G=x=>x*180/Math.PI;
  const la1=R(a[0]),lo1=R(a[1]),la2=R(b[0]),lo2=R(b[1]);
  const d=2*Math.asin(Math.sqrt(Math.sin((la2-la1)/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin((lo2-lo1)/2)**2));
  if(!d) return [a,b]; const P=[];
  for(let i=0;i<=n;i++){const f=i/n,A=Math.sin((1-f)*d)/Math.sin(d),B=Math.sin(f*d)/Math.sin(d);
    const x=A*Math.cos(la1)*Math.cos(lo1)+B*Math.cos(la2)*Math.cos(lo2),
          y=A*Math.cos(la1)*Math.sin(lo1)+B*Math.cos(la2)*Math.sin(lo2),z=A*Math.sin(la1)+B*Math.sin(la2);
    P.push([G(Math.atan2(z,Math.sqrt(x*x+y*y))),G(Math.atan2(y,x))]);}
  for(let i=1;i<P.length;i++){let dl=P[i][1]-P[i-1][1]; if(dl>180)P[i][1]-=360; else if(dl<-180)P[i][1]+=360;}
  return P;}

function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
function T(c,t,x,y,font,color,align="left"){c.font=font;c.fillStyle=color;c.textAlign=align;c.fillText(t,x,y);}

function header(c,handle){
  T(c,"✈  INSTA FLIGHT LOG",60,90,'700 34px Orbitron, sans-serif',CL.amber,"left");
  T(c,handle||"",CARD_W-60,90,'26px "Share Tech Mono", monospace',CL.mut,"right");
  c.strokeStyle=CL.line;c.lineWidth=2;c.beginPath();c.moveTo(60,120);c.lineTo(CARD_W-60,120);c.stroke();
}
function footer(c){
  c.strokeStyle=CL.line;c.lineWidth=2;c.beginPath();c.moveTo(60,CARD_H-90);c.lineTo(CARD_W-60,CARD_H-90);c.stroke();
  T(c,"gerado com Insta Flight Log",60,CARD_H-52,'22px "Share Tech Mono", monospace',CL.mut,"left");
  T(c,"eduardogama-zero.github.io/insta-flight-log",CARD_W-60,CARD_H-52,'22px "Share Tech Mono", monospace',CL.cyan,"right");
}
function bg(c){c.fillStyle=CL.bg;c.fillRect(0,0,CARD_W,CARD_H);
  const g=c.createRadialGradient(CARD_W/2,CARD_H*0.35,200,CARD_W/2,CARD_H/2,CARD_H*0.75);
  g.addColorStop(0,"rgba(20,40,45,.18)");g.addColorStop(1,"rgba(0,0,0,0)");c.fillStyle=g;c.fillRect(0,0,CARD_W,CARD_H);}

function tile(c,x,y,w,h,label,value,accent){
  const g=c.createLinearGradient(0,y,0,y+h);g.addColorStop(0,"#0b1216");g.addColorStop(1,"#06090c");
  c.fillStyle=g;roundRect(c,x,y,w,h,18);c.fill();c.strokeStyle=CL.line;c.lineWidth=2;c.stroke();
  T(c,label.toUpperCase(),x+28,y+52,'22px "Share Tech Mono", monospace',CL.mut,"left");
  c.save();c.shadowColor=accent;c.shadowBlur=22;
  T(c,value,x+28,y+h-40,'700 78px Orbitron, sans-serif',accent,"left");c.restore();
}

function cardResumo(c,D){
  bg(c);header(c,D.handle);
  const cu=D.cum[D.ymax];
  c.save();c.shadowColor="rgba(87,215,255,.25)";c.shadowBlur=24;
  T(c,"INSTA FLIGHT LOG",60,300,'900 72px Orbitron, sans-serif',CL.ink,"left");c.restore();
  T(c,"MEU MAPA DE VIAGENS",62,360,'30px "Share Tech Mono", monospace',CL.green,"left");
  T(c,`PERÍODO ${D.first?D.first.slice(0,4):D.ymin}–${D.ymax}`,62,410,'26px "Share Tech Mono", monospace',CL.mut,"left");
  const x0=60,w=(CARD_W-120-30)/2,h=250,gap=30,y0=480;
  const tiles=[["países",""+cu[0],CL.amber],["cidades",""+cu[1],CL.amber],
    ["voos",""+cu[3],CL.green],["horas de voo",cu[5].toLocaleString("pt-BR"),CL.green],
    ["km voados",kmfmt(cu[4]),CL.green],["custo est.",(D.currency||"R$")+" "+kmfmt(cu[6]),CL.amber]];
  tiles.forEach((t,i)=>{const col=i%2,row=(i/2|0);tile(c,x0+col*(w+gap),y0+row*(h+gap),w,h,t[0],t[1],t[2]);});
  footer(c);
}

function drawMap(c,x0,y0,w,h,D){
  const proj=(lat,lon)=>[x0+(lon+180)/360*w, y0+(85-Math.max(-85,Math.min(85,lat)))/170*h];
  c.save();roundRect(c,x0,y0,w,h,16);c.clip();
  c.fillStyle="#060a0d";c.fillRect(x0,y0,w,h);
  // graticule
  c.strokeStyle="rgba(40,70,64,.35)";c.lineWidth=1;
  for(let lon=-150;lon<=150;lon+=30){const a=proj(-85,lon),b=proj(85,lon);c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke();}
  for(let lat=-60;lat<=60;lat+=30){const a=proj(lat,-180),b=proj(lat,180);c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke();}
  // continents
  c.fillStyle="#0f1a1e";c.strokeStyle="rgba(60,110,100,.4)";c.lineWidth=1;
  for(const ring of WORLD){ c.beginPath(); let started=false,prev=null;
    for(const [lon,lat] of ring){ const p=proj(lat,lon);
      if(prev && Math.abs(lon-prev)>180){ c.closePath(); started=false; }
      if(!started){c.moveTo(p[0],p[1]);started=true;} else c.lineTo(p[0],p[1]); prev=lon; }
    c.closePath(); c.fill(); c.stroke(); }
  // routes
  c.lineWidth=1.4;c.strokeStyle="rgba(255,179,64,.5)";
  for(const l of D.legs){ const pts=gcpts(l.a,l.b); c.beginPath(); let prev=null,started=false;
    for(const q of pts){ const p=proj(q[0],q[1]);
      if(prev && Math.abs(q[1]-prev)>180){started=false;}
      if(!started){c.moveTo(p[0],p[1]);started=true;} else c.lineTo(p[0],p[1]); prev=q[1]; }
    c.stroke(); }
  // points
  for(const pt of D.points){ const p=proj(pt[0],pt[1]); c.fillStyle=colYear(pt[2],D.ymin,D.ymax);
    c.beginPath();c.arc(p[0],p[1],2.6,0,7);c.fill(); }
  c.restore();
  c.strokeStyle=CL.line;c.lineWidth=2;roundRect(c,x0,y0,w,h,16);c.stroke();
}
function cardMapa(c,D){
  bg(c);header(c,D.handle);
  T(c,"MINHAS ROTAS",60,230,'900 84px Orbitron, sans-serif',CL.ink,"left");
  c.save();c.shadowColor="rgba(255,179,64,.3)";c.shadowBlur=20;
  T(c,kmfmt(D.summary.total_km)+" km",60,330,'700 68px Orbitron, sans-serif',CL.amber,"left");c.restore();
  T(c,`${String(D.summary.earth_laps).replace(".",",")}× a volta da Terra · ${D.cum[D.ymax][3]} voos`,62,388,
    '28px "Share Tech Mono", monospace',CL.mut,"left");
  drawMap(c,60,470,CARD_W-120,CARD_W-120,D); // quadrado
  const yb=470+(CARD_W-120)+70;
  T(c,`${D.cum[D.ymax][0]} países`,60,yb,'700 52px Orbitron, sans-serif',CL.green,"left");
  T(c,`${D.cum[D.ymax][1]} cidades`,CARD_W-60,yb,'700 52px Orbitron, sans-serif',CL.green,"right");
  footer(c);
}

function cardTop(c,D){
  bg(c);header(c,D.handle);
  T(c,"ONDE EU",60,240,'900 96px Orbitron, sans-serif',CL.ink,"left");
  T(c,"MAIS FUI",60,340,'900 96px Orbitron, sans-serif',CL.amber,"left");
  const rows=D.country_stats.slice(0,8); const mx=Math.max(...rows.map(r=>r.n),1);
  let y=470; const x=60,w=CARD_W-120,rh=150;
  rows.forEach((r,i)=>{
    T(c,String(i+1).padStart(2,"0"),x,y+58,'700 46px Orbitron, sans-serif',CL.mut,"left");
    T(c,r.name,x+90,y+44,'40px "Share Tech Mono", monospace',CL.ink,"left");
    // barra
    const bx=x+90,bw=w-90-140,bh=16,by=y+70;
    c.fillStyle="#0e1a17";roundRect(c,bx,by,bw,bh,8);c.fill();
    const g=c.createLinearGradient(bx,0,bx+bw,0);g.addColorStop(0,CL.cyan);g.addColorStop(1,CL.amber);
    c.fillStyle=g;roundRect(c,bx,by,Math.max(10,bw*r.n/mx),bh,8);c.fill();
    T(c,String(r.n),x+w,y+58,'700 44px Orbitron, sans-serif',CL.green,"right");
    y+=rh;
  });
  footer(c);
}

function cardRecords(c,D){
  bg(c);header(c,D.handle);
  T(c,"RECORDES",60,270,'900 100px Orbitron, sans-serif',CL.amber,"left");
  let y=400; const x=60,w=CARD_W-120,rh=(CARD_H-90-420)/D.records.length;
  D.records.forEach(([k,v])=>{
    const g=c.createLinearGradient(0,y,0,y+rh-24);g.addColorStop(0,"#0b1216");g.addColorStop(1,"#06090c");
    c.fillStyle=g;roundRect(c,x,y,w,rh-24,16);c.fill();c.strokeStyle=CL.line;c.lineWidth=2;c.stroke();
    T(c,k.toUpperCase(),x+34,y+56,'24px "Share Tech Mono", monospace',CL.mut,"left");
    // valor (quebra se longo)
    c.font='700 46px Orbitron, sans-serif';c.fillStyle=CL.ink;c.textAlign="left";
    let val=v; if(c.measureText(val).width>w-68){ c.font='700 36px Orbitron, sans-serif'; }
    T(c,val,x+34,y+rh-58,c.font,CL.ink,"left");
    y+=rh;
  });
  footer(c);
}

async function ensureReady(){
  if(!WORLD) WORLD=await fetch("data/world.json").then(r=>r.json());
  try{ await document.fonts.load('900 90px Orbitron'); await document.fonts.load('24px "Share Tech Mono"');
       await document.fonts.ready; }catch(e){}
}
function makeCanvas(fn,D){ const cv=document.createElement("canvas"); cv.width=CARD_W;cv.height=CARD_H;
  fn(cv.getContext("2d"),D); return cv; }

async function generateCards(D){
  if(!D){ alert("Gere o painel primeiro."); return; }
  const modal=document.getElementById("cardsModal"), gal=document.getElementById("cardsGallery");
  gal.innerHTML="<div class='cLoading'>gerando…</div>"; modal.style.display="flex";
  await ensureReady();
  const defs=[["resumo",cardResumo],["mapa",cardMapa],["top-destinos",cardTop],["recordes",cardRecords]];
  const cards=defs.map(([name,fn])=>({name,cv:makeCanvas(fn,D)}));
  window.__cards=cards;
  gal.innerHTML="";
  for(const {name,cv} of cards){
    const wrap=document.createElement("div");wrap.className="cItem";
    const img=new Image(); img.src=cv.toDataURL("image/png"); img.className="cImg";
    const btn=document.createElement("button");btn.className="cDl";btn.textContent="baixar "+name+".png";
    btn.onclick=()=>cv.toBlob(bl=>{const a=document.createElement("a");a.href=URL.createObjectURL(bl);
      a.download=`flightlog-${name}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);},"image/png");
    wrap.appendChild(img);wrap.appendChild(btn);gal.appendChild(wrap);
  }
}
async function downloadAllCards(){ if(!window.__cards) return;
  for(const {name,cv} of window.__cards){ await new Promise(res=>cv.toBlob(bl=>{
    const a=document.createElement("a");a.href=URL.createObjectURL(bl);a.download=`flightlog-${name}.png`;a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);res();},400);},"image/png")); } }
