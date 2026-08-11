
function boot(D){
const CUR=(D.currency||'R$');
document.getElementById('hHandle').textContent=D.handle||'MAPA';
document.getElementById('hWindow').textContent=(D.first||D.ymin)+' / '+D.ymax;
{const _y=document.getElementById('yr');_y.min=D.ymin;_y.max=D.ymax;_y.value=D.ymax;}
document.getElementById('ylMin').textContent=D.ymin;document.getElementById('ylMax').textContent=D.ymax;
function km(v){ if(v>=1e6) return (v/1e6).toFixed(2).replace('.',',')+'m'; if(v>=1e3) return Math.round(v/1e3)+'k'; return (''+Math.round(v)); }
function color(y){const t=(y-D.ymin)/Math.max(1,D.ymax-D.ymin);return `hsl(${190-150*t},85%,60%)`;}
const map=L.map('map',{worldCopyJump:true,preferCanvas:true,zoomSnap:0.25,zoomDelta:0.5,wheelPxPerZoomLevel:140,wheelDebounceTime:30,attributionControl:false}).setView([-5,-40],3);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);
// year color legend gradient
document.querySelector('#ylegend .bar').style.background=`linear-gradient(90deg,${color(D.ymin)},${color((D.ymin+D.ymax)/2)},${color(D.ymax)})`;

function updateHero(Y){const c=D.cum[Y]||D.cum[D.ymax];
 document.getElementById('hero').innerHTML=`
 <div class="k"><span>países</span><b>${c[0]}</b></div>
 <div class="k"><span>cidades</span><b>${c[1]}</b></div>
 <div class="k"><span>waypoints</span><b>${c[2]}</b></div>
 <div class="k b2"><span>voos · legs</span><b>${c[3]}</b></div>
 <div class="k b2"><span>flt time · h</span><b>${c[5].toLocaleString('pt-BR')}</b></div>
 <div class="k b2"><span>dist · km</span><b>${km(c[4])}</b></div>`;
 const cst=c[6];
 document.getElementById('cost').innerHTML=
  `<div class="cl">custo est. em passagens<br>&middot; quase tudo econômica</div>`+
  `<div><div class="cv">${CUR} ${km(cst)}</div><div class="ch">~${CUR} ${Math.round(cst/Math.max(1,c[5]))}/h</div></div>`;}
const s=D.summary;
document.getElementById('foot').innerHTML=
 `BASE <b>${s.home.split(',')[0]}</b> &middot; MAIS DISTANTE <b>${s.farthest.split(',')[0]}</b> (${s.far_km.toLocaleString('pt-BR')} km)<br>`+
 `FLT TIME faixa ${s.hours_low.toLocaleString('pt-BR')}&ndash;${s.hours_high.toLocaleString('pt-BR')}h &middot; EST. &ge;300 km, 800 km/h + 0,5 h/perna &middot; SRC EXIF/GPS`;

const ROUTE='#ffb340';
function gc(a,b,n=48){const R=x=>x*Math.PI/180,G=x=>x*180/Math.PI;const la1=R(a[0]),lo1=R(a[1]),la2=R(b[0]),lo2=R(b[1]);
 const d=2*Math.asin(Math.sqrt(Math.sin((la2-la1)/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin((lo2-lo1)/2)**2));if(d===0)return[a,b];
 const P=[];for(let i=0;i<=n;i++){const f=i/n,A=Math.sin((1-f)*d)/Math.sin(d),B=Math.sin(f*d)/Math.sin(d);
  const x=A*Math.cos(la1)*Math.cos(lo1)+B*Math.cos(la2)*Math.cos(lo2),y=A*Math.cos(la1)*Math.sin(lo1)+B*Math.cos(la2)*Math.sin(lo2),z=A*Math.sin(la1)+B*Math.sin(la2);
  P.push([G(Math.atan2(z,Math.sqrt(x*x+y*y))),G(Math.atan2(y,x))]);}
 for(let i=1;i<P.length;i++){let dl=P[i][1]-P[i-1][1];if(dl>180)P[i][1]-=360;else if(dl<-180)P[i][1]+=360;}return P;}
const legLayer=L.layerGroup(),ptLayer=L.layerGroup(),plLayer=L.layerGroup(),cityLayer=L.layerGroup();
let heat=L.heatLayer([],{radius:18,blur:24,minOpacity:.30,maxZoom:9,gradient:{0.15:'#0b3d91',0.35:'#57d7ff',0.55:'#3ff0a8',0.75:'#ffb340',1:'#ff5a52'}});
let mode='routes',maxY=D.ymax;
function drawRoutes(){legLayer.clearLayers();ptLayer.clearLayers();plLayer.clearLayers();
 for(const l of D.legs) L.polyline(gc(l.a,l.b),{color:ROUTE,weight:1.1,opacity:.32}).addTo(legLayer);
 for(const p of D.points){if(p[2]>maxY)continue;L.circleMarker([p[0],p[1]],{radius:2.3,color:color(p[2]),weight:0,fillOpacity:.65}).bindPopup(`<b>${p[2]||''}</b> ${p[3]||''}<br>${p[4]||''}`).addTo(ptLayer);}
 for(const pl of D.places){if(pl.first&&+pl.first.slice(0,4)>maxY)continue;const r=Math.min(24,4+Math.sqrt(pl.n)*2);
  L.circleMarker([pl.lat,pl.lon],{radius:r,color:ROUTE,weight:1,fillColor:ROUTE,fillOpacity:.09}).bindPopup(`<b>${pl.label}</b><br>${pl.n} mídias · ${pl.first} → ${pl.last}`).addTo(plLayer);}}
function drawHeat(){heat.setLatLngs(D.points.filter(p=>p[2]<=maxY).map(p=>[p[0],p[1],0.7]));}
function drawCities(){cityLayer.clearLayers();for(const pl of D.places){if(pl.first&&+pl.first.slice(0,4)>maxY)continue;
  L.circleMarker([pl.lat,pl.lon],{radius:2.6,color:'#04070a',weight:.8,fillColor:'#eafff8',fillOpacity:.95}).bindPopup(`<b>${pl.label}</b><br>${pl.n} mídias · ${pl.first} → ${pl.last}`).addTo(cityLayer);}}
const T={pts:document.getElementById('tPts'),legs:document.getElementById('tLegs'),places:document.getElementById('tPlaces')};
function applyRouteToggles(){if(mode!=='routes')return;T.pts.checked?map.addLayer(ptLayer):map.removeLayer(ptLayer);T.legs.checked?map.addLayer(legLayer):map.removeLayer(legLayer);T.places.checked?map.addLayer(plLayer):map.removeLayer(plLayer);}
function setMode(m){mode=m;const on=m==='routes';
 document.getElementById('bRoutes').classList.toggle('on',on);document.getElementById('bHeat').classList.toggle('on',!on);
 document.getElementById('toggles').style.visibility=on?'visible':'hidden';document.getElementById('ylegend').style.display=on?'block':'none';
 document.getElementById('legend').innerHTML=on?'<i></i>rota de voo &middot; &#9679; m&iacute;dia geolocalizada':'&#128293; densidade &middot; &#9679; cada cidade visitada';
 if(on){map.removeLayer(heat);map.removeLayer(cityLayer);drawRoutes();applyRouteToggles();}
 else{[legLayer,ptLayer,plLayer].forEach(l=>map.removeLayer(l));drawHeat();drawCities();map.addLayer(heat);map.addLayer(cityLayer);}}
Object.values(T).forEach(c=>c.onchange=applyRouteToggles);
document.getElementById('bRoutes').onclick=()=>setMode('routes');document.getElementById('bHeat').onclick=()=>setMode('heat');

const pane=document.getElementById('pane'),qbox=document.getElementById('q');
function filterPane(){const v=qbox.value.toLowerCase();pane.querySelectorAll('.row,.rec').forEach(r=>{r.style.display=r.textContent.toLowerCase().includes(v)?'':'none';});}
function renderTrips(){pane.innerHTML='';for(const t of D.trips){const r=document.createElement('div');r.className='row trip';
  const dur=t.days?`${t.days}d`:'—';const rt=t.route.join(' › ');
  r.innerHTML=`<div><span class="nm">${t.start.slice(0,7)} · ${dur}</span><div class="rt">${rt}</div><span class="dt">${t.countries.join(', ')}</span></div><span class="ct">${km(t.km)}</span>`;
  r.onclick=()=>map.flyToBounds([[t.b[0],t.b[1]],[t.b[2],t.b[3]]],{padding:[40,40],maxZoom:7});pane.appendChild(r);}filterPane();}
function renderPlaces(){pane.innerHTML='';for(const c of D.country_stats){const g=document.createElement('div');g.className='grp';g.textContent=`${c.name} — ${c.n}`;pane.appendChild(g);
  D.places_full.filter(p=>(p.country||'?')===c.name).forEach(p=>{const r=document.createElement('div');r.className='row';
   r.innerHTML=`<span class="nm">${p.city||p.label}<br><span class="dt">${p.first} → ${p.last}</span></span><span class="ct">${p.n}</span>`;r.onclick=()=>map.flyTo([p.lat,p.lon],8);pane.appendChild(r);});}filterPane();}
function renderCountries(){pane.innerHTML='';const g=document.createElement('div');g.className='grp';g.textContent=`${D.country_stats.length} países`;pane.appendChild(g);
 for(const c of D.country_stats){const r=document.createElement('div');r.className='row';r.innerHTML=`<span class="nm">${c.name}<br><span class="dt">${c.first} → ${c.last} · ${c.pl} lugares</span></span><span class="ct">${c.n}</span>`;
  const pl=D.places_full.find(p=>p.country===c.name);if(pl)r.onclick=()=>map.flyTo([pl.lat,pl.lon],5);pane.appendChild(r);}filterPane();}
function renderYears(){pane.innerHTML='';const mx=Math.max(...D.year.map(y=>y.flight_km))||1;const g=document.createElement('div');g.className='grp';g.textContent='km voados por ano (GPS)';pane.appendChild(g);
 for(const y of D.year){const d=document.createElement('div');d.className='ybar';d.innerHTML=`<span class="y">${y.y}</span><span class="bar" style="width:${Math.max(2,y.flight_km/mx*150)}px"></span><span class="v">${km(y.flight_km)} · ${y.flights}voos · ${y.countries}p</span>`;pane.appendChild(d);}filterPane();}
function renderRecords(){pane.innerHTML='';for(const [k2,v] of D.records){const d=document.createElement('div');d.className='rec';d.innerHTML=`<div class="rk">${k2}</div><div class="rv">${v}</div>`;pane.appendChild(d);}filterPane();}
const R={trips:renderTrips,places:renderPlaces,countries:renderCountries,years:renderYears,records:renderRecords};
let curTab='trips';R.trips();
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));t.classList.add('on');curTab=t.dataset.t;R[curTab]();});
qbox.oninput=filterPane;

const yr=document.getElementById('yr'),yv=document.getElementById('yrval');
function setYear(y){y=Math.max(D.ymin,Math.min(D.ymax,y));maxY=y;yr.value=y;yv.textContent=y;updateHero(y);
 if(mode==='routes'){drawRoutes();applyRouteToggles();}else{drawHeat();drawCities();}}
yr.oninput=()=>setYear(+yr.value);
// replay
let playing=false,timer=null;const pb=document.getElementById('play');
function stopPlay(){playing=false;clearInterval(timer);pb.innerHTML='&#9654;';}
function tick(){if(maxY>=D.ymax){stopPlay();return;}setYear(maxY+1);}
pb.onclick=()=>{if(playing){stopPlay();return;}if(maxY>=D.ymax)setYear(D.ymin);playing=true;pb.innerHTML='&#10073;&#10073;';timer=setInterval(tick,850);};

updateHero(D.ymax);setYear(D.ymax);
map.fitBounds(L.latLngBounds(D.points.map(p=>[p[0],p[1]])).pad(0.08));
setTimeout(()=>map.invalidateSize(),80);
}
