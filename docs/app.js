/* insta-travel-map — pipeline no navegador (sem servidor, sem instalação).
   Porta a lógica do CLI Python para JS. Nada sai do navegador. */
const ARGS = { currency:"R$", rate_dom:0.65, rate_intl:0.42, rate_intl_exec:1.40, exec_legs:0, trip_gap:21 };
let CITIES=null, CC2=null;

const $ = s => document.querySelector(s);
const status = m => { const el=$("#status"); if(el) el.innerHTML=m; };

function hav(a,b){const R=6371,rad=Math.PI/180;
  const dlat=(b[0]-a[0])*rad, dlon=(b[1]-a[1])*rad, la1=a[0]*rad, la2=b[0]*rad;
  const h=Math.sin(dlat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dlon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));}
function fixMojibake(s){ if(!s) return "";
  try{ const b=new Uint8Array([...s].map(c=>c.charCodeAt(0)));
       return new TextDecoder("utf-8",{fatal:true}).decode(b); }catch(e){ return s; } }
const yOf = d => parseInt(String(d).slice(0,4),10);
const dstr = ts => new Date(ts*1000).toISOString().slice(0,10);
const dayDiff = (a,b)=>Math.round((new Date(b)-new Date(a))/86400000);

// ---------------- extrair pontos do(s) zip ----------------
function gpsFromItem(it){ const mm=it.media_metadata||{};
  for(const k of ["video_metadata","photo_metadata"]){ const vm=mm[k]||{}; const ex=vm.exif_data||[];
    for(const e of ex){ const la=e.latitude, lo=e.longitude;
      if(typeof la==="number"&&typeof lo==="number"&&(la||lo)) return [la,lo]; } }
  return null; }
function* iterItems(data){
  if(data&&typeof data==="object"&&!Array.isArray(data)){
    for(const k of ["ig_stories","ig_reels_media","ig_igtv_media"]) if(data[k]){ yield* data[k]; return; }
    yield data; return; }
  if(Array.isArray(data)) yield* data; }

async function extractFromZips(files){
  const rows=[]; let handle=null;
  for(const f of files){
    const zip=await JSZip.loadAsync(f);
    const names=Object.keys(zip.files);
    for(const name of names){
      if(zip.files[name].dir) continue;
      // detectar usuário
      if(!handle && /personal_information\/.*\.json$/i.test(name)){
        try{ const t=await zip.files[name].async("string");
          const m=t.match(/"value"\s*:\s*"(@?[A-Za-z0-9._]{2,30})"/);
          const mm=t.match(/(?:Nome de usu[^"]*|Username)[^{]*?"value"\s*:\s*"([^"]+)"/);
          if(mm) handle="@"+fixMojibake(mm[1]); } catch(e){}
      }
      if(!/your_instagram_activity\/media\/.*\.json$/i.test(name)) continue;
      let data; try{ data=JSON.parse(await zip.files[name].async("string")); }catch(e){ continue; }
      const src=name.split("/").pop().replace(".json","");
      const push=(it,ptitle)=>{ const g=gpsFromItem(it); if(!g) return;
        const ts=it.creation_timestamp||0; if(!ts) return;
        rows.push({lat:g[0],lon:g[1],ts,title:fixMojibake(it.title||ptitle||""),source:src}); };
      for(const e of iterItems(data)){
        if(e&&Array.isArray(e.media)){ for(const m of e.media) push(m,e.title||""); }
        else if(e&&typeof e==="object") push(e,e.title||""); }
    }
  }
  // dedupe
  const seen=new Set(), ded=[];
  for(const r of rows){ const k=r.lat.toFixed(5)+","+r.lon.toFixed(5)+","+r.ts;
    if(seen.has(k)) continue; seen.add(k); ded.push(r); }
  ded.sort((a,b)=>a.ts-b.ts);
  return {points:ded, handle};
}

// ---------------- cluster (grid single-linkage 30km) ----------------
function cluster(points, thr=30){
  const cell=0.3, grid=new Map(), key=(x,y)=>x+"|"+y;
  points.forEach((r,i)=>{ const k=key(Math.floor(r.lat/cell),Math.floor(r.lon/cell));
    if(!grid.has(k)) grid.set(k,[]); grid.get(k).push(i); });
  const parent=points.map((_,i)=>i);
  const find=x=>{ while(parent[x]!==x){ parent[x]=parent[parent[x]]; x=parent[x]; } return x; };
  const uni=(a,b)=>{ const ra=find(a),rb=find(b); if(ra!==rb) parent[rb]=ra; };
  for(const [k,idxs] of grid){ const [cx,cy]=k.split("|").map(Number); const neigh=[];
    for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++){ const g=grid.get(key(cx+dx,cy+dy)); if(g) neigh.push(...g); }
    for(const i of idxs) for(const j of neigh){ if(j<=i) continue;
      if(hav([points[i].lat,points[i].lon],[points[j].lat,points[j].lon])<=thr) uni(i,j); } }
  const cl=new Map();
  points.forEach((r,i)=>{ const f=find(i); if(!cl.has(f)) cl.set(f,[]); cl.get(f).push(r); });
  const out=[];
  for(const items of cl.values()){
    const lat=items.reduce((s,x)=>s+x.lat,0)/items.length, lon=items.reduce((s,x)=>s+x.lon,0)/items.length;
    const ds=items.map(x=>dstr(x.ts)).sort();
    out.push({lat,lon,n:items.length,first:ds[0],last:ds[ds.length-1]}); }
  out.sort((a,b)=>b.n-a.n);
  return out;
}
// ---------------- geocode offline (cidade mais próxima) ----------------
function geocode(places){
  const RAD=45; // dentro deste raio, prefere a cidade mais populosa (evita bairros)
  for(const c of places){ let best=null,bd=1e9, pop=null,popVal=-1;
    for(const city of CITIES){ const d=hav([c.lat,c.lon],[city[1],city[2]]);
      if(d<bd){bd=d;best=city;}
      if(d<=RAD && (city[4]||0)>popVal){popVal=city[4]||0;pop=city;} }
    const chosen = pop || best;
    const cc=chosen?chosen[3]:""; c.city=chosen?chosen[0]:""; c.cc=cc; c.country=CC2[cc]||cc;
    c.label=[c.city,c.country].filter(Boolean).join(", ")||`(${c.lat.toFixed(2)},${c.lon.toFixed(2)})`; }
  return places;
}

// ---------------- build D (mirror do Python) ----------------
function buildEverything(points, places){
  const M=[]; // sem entradas manuais na versão web
  const snap=(lat,lon)=>{ let best=null,bd=1e9;
    for(const pl of places){ const d=hav([lat,lon],[pl.lat,pl.lon]); if(d<bd){bd=d;best=pl;} }
    return (best&&bd<=60)?[best.label,best.lat,best.lon,best.country||""]:[`(${lat.toFixed(2)},${lon.toFixed(2)})`,lat,lon,""]; };
  for(const p of points){ const [l,la,lo,ct]=snap(p.lat,p.lon); p.label=l;p.plat=la;p.plon=lo;p.country=ct;p.day=dstr(p.ts); }
  const byday=new Map();
  for(const p of points){ if(!byday.has(p.day)) byday.set(p.day,[]); byday.get(p.day).push(p); }
  const daily=[];
  for(const day of [...byday.keys()].sort()){ const arr=byday.get(day);
    const cnt=new Map(); for(const x of arr) cnt.set(x.label,(cnt.get(x.label)||0)+1);
    let lab=null,mx=-1; for(const [k,v] of cnt) if(v>mx){mx=v;lab=k;}
    const rep=arr.find(x=>x.label===lab); daily.push({day,label:lab,lat:rep.plat,lon:rep.plon,country:rep.country}); }
  const stays=[];
  for(const d of daily){ if(stays.length&&stays[stays.length-1].label===d.label) stays[stays.length-1].end=d.day;
    else stays.push({label:d.label,lat:d.lat,lon:d.lon,country:d.country,start:d.day,end:d.day}); }
  const home=places.reduce((a,b)=>b.n>a.n?b:a,places[0]); const HOME=new Set([home.label]);
  const home_country=home.country||"";
  const FK=300; const legs=[]; let fk=0;
  for(let i=0;i<stays.length-1;i++){ const a=stays[i],b=stays[i+1]; const d=hav([a.lat,a.lon],[b.lat,b.lon]);
    if(d<1) continue; const f=d>=FK;
    legs.push({km:d,flight:f,ts:b.start,a:[a.lat,a.lon],b:[b.lat,b.lon],a_ctry:a.country,b_ctry:b.country});
    if(f) fk+=d; }
  const fl=legs.filter(l=>l.flight);
  // buckets por ano
  const yfl={},ykm={};
  for(const l of fl){ const y=yOf(l.ts); yfl[y]=(yfl[y]||0)+1; ykm[y]=(ykm[y]||0)+l.km; }
  // custo (doméstico = país da base)
  const isDom=(x,y)=>x&&x===home_country&&y===home_country;
  const costLegs=fl.map(l=>[l.km,isDom(l.a_ctry,l.b_ctry),1]);
  const domkm=costLegs.filter(x=>x[1]).reduce((s,x)=>s+x[0]*x[2],0);
  const intl=costLegs.filter(x=>!x[1]).map(x=>[x[0],x[2]]).sort((a,b)=>b[0]-a[0]);
  const intlkm=intl.reduce((s,x)=>s+x[0]*x[1],0);
  let base=domkm*ARGS.rate_dom+intlkm*ARGS.rate_intl, prem=0, left=ARGS.exec_legs;
  for(const [k,r] of intl){ const take=Math.min(r,left); if(take<=0) break; prem+=(ARGS.rate_intl_exec-ARGS.rate_intl)*k*take; left-=take; }
  const cost_total=base+prem, cost_rate=cost_total/Math.max(1,domkm+intlkm);
  // cumulativo
  const allplaces=places.map(p=>({country:p.country||"",city:p.city||"",first:p.first}));
  const ymin=Math.min(...allplaces.map(a=>yOf(a.first))), ymax=Math.max(...allplaces.map(a=>yOf(a.first)));
  const cum={};
  for(let Y=ymin;Y<=ymax;Y++){ const ap=allplaces.filter(a=>yOf(a.first)<=Y);
    let kmv=0,fv=0; for(const y in ykm) if(+y<=Y) kmv+=ykm[y]; for(const y in yfl) if(+y<=Y) fv+=yfl[y];
    cum[Y]=[new Set(ap.filter(a=>a.country).map(a=>a.country)).size,
            new Set(ap.filter(a=>a.city).map(a=>a.city+"|"+a.country)).size,
            ap.length, fv, Math.round(kmv), Math.round(kmv/800+0.5*fv), Math.round(kmv*cost_rate)]; }
  // trips
  const trips=[];
  const close=run=>{ if(!run.length) return; const route=[];
    for(const s of run){ const nm=s.label.split(",")[0]; if(!route.length||route[route.length-1]!==nm) route.push(nm); }
    let km=hav([home.lat,home.lon],[run[0].lat,run[0].lon]);
    for(let i=0;i<run.length-1;i++) km+=hav([run[i].lat,run[i].lon],[run[i+1].lat,run[i+1].lon]);
    km+=hav([run[run.length-1].lat,run[run.length-1].lon],[home.lat,home.lon]);
    const lats=run.map(s=>s.lat),lons=run.map(s=>s.lon);
    trips.push({start:run[0].start,end:run[run.length-1].end,days:dayDiff(run[0].start,run[run.length-1].end)+1,
      route,countries:[...new Set(run.map(s=>s.country).filter(Boolean))].sort(),km:Math.round(km),
      b:[Math.min(...lats),Math.min(...lons),Math.max(...lats),Math.max(...lons)]}); };
  let cur=[];
  for(const s of stays){ if(HOME.has(s.label)){ close(cur); cur=[]; }
    else{ if(cur.length&&dayDiff(cur[cur.length-1].end,s.start)>ARGS.trip_gap){ close(cur); cur=[]; } cur.push(s); } }
  close(cur); trips.sort((a,b)=>a.start<b.start?1:-1);
  // year rows / country stats
  const yr_rows=[];
  for(let y=ymin;y<=ymax;y++) yr_rows.push({y,
    places:new Set(stays.filter(s=>yOf(s.start)===y).map(s=>s.label)).size,
    countries:new Set(stays.filter(s=>yOf(s.start)===y&&s.country).map(s=>s.country)).size,
    flights:yfl[y]||0, flight_km:Math.round(ykm[y]||0)});
  const farthest=points.reduce((a,b)=>hav([home.lat,home.lon],[b.lat,b.lon])>hav([home.lat,home.lon],[a.lat,a.lon])?b:a,points[0]);
  const far_km=Math.round(hav([home.lat,home.lon],[farthest.lat,farthest.lon]));
  const c=cum[ymax];
  const summary={home:home.label,farthest:farthest.label||"",far_km,first:(daily[0]?daily[0].day:""),
    hours_low:Math.round(fl.reduce((s,l)=>s+l.km/850+0.3,0)),hours_high:Math.round(fl.reduce((s,l)=>s+l.km/750+0.75,0)),
    days_mid:Math.round(c[5]/24*10)/10, earth_laps:Math.round(c[4]/40075*10)/10, total_km:c[4]};
  const bycc={};
  for(const pl of places){ const k=pl.country||"?"; const b=bycc[k]||(bycc[k]={n:0,pl:0,first:"9999",last:"0"});
    b.n+=pl.n;b.pl+=1;b.first=pl.first<b.first?pl.first:b.first;b.last=pl.last>b.last?pl.last:b.last; }
  const country_stats=Object.entries(bycc).map(([name,v])=>({name,...v})).sort((a,b)=>b.n-a.n);
  const places_full=[...places].sort((a,b)=>b.n-a.n);
  // records
  const nearLabel=c2=>{ let best=null,bd=1e9; for(const pl of places){ const d=hav([c2[0],c2[1]],[pl.lat,pl.lon]); if(d<bd){bd=d;best=pl;} } return best?best.label.split(",")[0]:"?"; };
  const alllegs=fl.map(l=>[Math.round(l.km),l.a,l.b]);
  const lf=alllegs.length?alllegs.reduce((a,b)=>b[0]>a[0]?b:a):[0,[0,0],[0,0]];
  const busy=yr_rows.length?yr_rows.reduce((a,b)=>b.flight_km>a.flight_km?b:a):{y:"-",flight_km:0,flights:0};
  const topcity=places.reduce((a,b)=>b.n>a.n?b:a,places[0]);
  const longest=trips.filter(t=>t.days).reduce((a,b)=>(!a||b.days>a.days)?b:a,null);
  const fmt=n=>n.toLocaleString("pt-BR");
  const records=[
   ["Voo mais longo",`${nearLabel(lf[1])} → ${nearLabel(lf[2])} · ${fmt(lf[0])} km`],
   ["Cidade mais visitada",`${topcity.city||topcity.label.split(",")[0]} · ${topcity.n} mídias`],
   ["Ano mais intenso",`${busy.y} · ${Math.round(busy.flight_km/1000)} mil km · ${busy.flights} voos`],
   ["Ponto mais distante",`${summary.farthest.split(",")[0]} · ${fmt(summary.far_km)} km`],
   ["Viagem mais longa",longest?`${longest.days} dias · ${longest.route.slice(0,3).join("/")} · ${longest.start.slice(0,7)}`:"—"],
   ["Total de viagens",`${trips.length} jornadas reconstruídas`],
  ];
  const D={points:[],places:places.map(p=>({label:p.label,lat:p.lat,lon:p.lon,n:p.n,first:p.first,last:p.last})),
    legs:[],year:yr_rows,ymin,ymax,cum,trips,records,summary,currency:ARGS.currency,
    country_stats,places_full};
  for(const p of points){ let t=(p.title||"").replace(/\n/g," ").trim(); if(t.length>130) t=t.slice(0,127)+"…";
    D.points.push([+p.lat.toFixed(4),+p.lon.toFixed(4),yOf(p.day),p.source.slice(0,2),t]); }
  const legc=new Map();
  for(const l of fl){ const k=[l.a[0].toFixed(2),l.a[1].toFixed(2),l.b[0].toFixed(2),l.b[1].toFixed(2)].join(",");
    legc.set(k,(legc.get(k)||0)+1); }
  D.legs=[...legc.keys()].map(k=>{const[a,b,c,d]=k.split(",").map(Number);return{a:[a,b],b:[c,d]};});
  return D;
}

// ---------------- orquestração ----------------
async function loadData(){
  if(CITIES&&CC2) return;
  status("carregando base de cidades…");
  const [ci,cc]=await Promise.all([fetch("data/cities.json").then(r=>r.json()),
                                   fetch("data/cc2country.json").then(r=>r.json())]);
  CITIES=ci; CC2=cc;
}
async function run(files, handleOverride){
  try{
    await loadData();
    status("lendo o backup…");
    const {points,handle}=await extractFromZips(files);
    if(!points.length){ status("⚠️ Nenhuma mídia com GPS encontrada. (O Instagram só grava EXIF em parte das mídias.)"); return; }
    status(`${points.length} mídias com GPS · agrupando…`);
    await new Promise(r=>setTimeout(r,10));
    let places=cluster(points);
    status(`${places.length} lugares · nomeando (offline)…`);
    await new Promise(r=>setTimeout(r,10));
    places=geocode(places);
    status("montando o painel…");
    const D=buildEverything(points,places);
    D.handle=handleOverride||handle||"MEU MAPA";
    $("#uploader").style.display="none";
    $("#app").style.display="flex";
    window.__D=D;
    boot(D);
    $("#genCards").style.display="block";
  }catch(e){ console.error(e); status("❌ Erro: "+e.message); }
}

// ---------------- UI ----------------
window.addEventListener("DOMContentLoaded",()=>{
  const drop=$("#drop"), file=$("#file");
  drop.addEventListener("click",()=>file.click());
  file.addEventListener("change",e=>{ if(e.target.files.length) run([...e.target.files]); });
  ["dragover","dragenter"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("over");}));
  ["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("over");}));
  drop.addEventListener("drop",e=>{ const f=[...e.dataTransfer.files].filter(x=>x.name.endsWith(".zip")); if(f.length) run(f); });
  $("#genCards").addEventListener("click",()=>generateCards(window.__D));
  $("#cardsClose").addEventListener("click",()=>$("#cardsModal").style.display="none");
  $("#cardsAll").addEventListener("click",downloadAllCards);
  const dl=$("#demoLink");
  if(dl) dl.addEventListener("click",async e=>{ e.preventDefault();
    status("carregando demonstração…");
    try{ const blob=await fetch("data/sample.zip").then(r=>r.blob());
      run([new File([blob],"sample.zip")],"@viajante_demo"); }
    catch(err){ status("não consegui carregar a demo: "+err.message); } });
});
