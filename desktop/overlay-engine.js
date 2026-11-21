// Shared playground overlay engine. Generated into desktop/plugin.js and playground HTML.
const LotMapOverlay = (() => {
'use strict';
const stations=[['you','Вы'],['model','Модель'],['memory','Память'],['files','Файлы'],['shell','Терминал'],['web','Веб'],['browser','Браузер'],['agents','Агенты'],['skills','Навыки'],['hooks','Хуки']];
const locations=[['hermes','HERMES'],...stations], ns='http://www.w3.org/2000/svg';
const point=i=>({x:230+176*Math.sin(i*2*Math.PI/10),y:212-164*Math.cos(i*2*Math.PI/10)});
const position=id=>id==='hermes'?{x:230,y:212}:point(stations.findIndex(x=>x[0]===id));
const obstacles=locations.flatMap(([id,name])=>{const p=position(id);if(id==='hermes')return [{id,type:'circle',x:p.x,y:p.y,r:55}];return [{id,type:'circle',x:p.x,y:p.y,r:36},{id,type:'rect',x:p.x-Math.max(20,name.length*4.2)-4,y:p.y+27,w:2*(Math.max(20,name.length*4.2)+4),h:28}];});
const elt=(tag,attrs={})=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e};
function blocked(p,origin,dest){if(p.x<5||p.x>455||p.y<5||p.y>425)return true;return obstacles.some(o=>o.id!==origin&&o.id!==dest&&(o.type==='circle'?Math.hypot(p.x-o.x,p.y-o.y)<=o.r+2:p.x>=o.x-2&&p.x<=o.x+o.w+2&&p.y>=o.y-2&&p.y<=o.y+o.h+2));}
function clearSegment(a,b,origin,dest){const n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/1.5);for(let i=0;i<=n;i++)if(blocked({x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n},origin,dest))return false;return true;}
// A* generates deterministic alternative candidates; string-pulling and rounded
// quadratic corners are accepted only after collision testing the actual curve.
function route(origin,dest,lane=0){const A=position(origin),B=position(dest),step=5,cols=93,rows=87;const idx=(x,y)=>y*cols+x,xy=k=>({x:(k%cols)*step,y:Math.floor(k/cols)*step});const start=idx(Math.round(A.x/step),Math.round(A.y/step)),goal=idx(Math.round(B.x/step),Math.round(B.y/step));const dist=new Float64Array(cols*rows);dist.fill(Infinity);dist[start]=0;const prev=new Int32Array(cols*rows);prev.fill(-1);let open=[start],closed=new Uint8Array(cols*rows);const side=lane===0?0:(lane%2?1:-1)*Math.ceil(lane/2);const score=k=>{let p=xy(k);return dist[k]+Math.hypot(p.x-B.x,p.y-B.y)};while(open.length){let bi=0;for(let i=1;i<open.length;i++)if(score(open[i])<score(open[bi]))bi=i;const k=open.splice(bi,1)[0];if(closed[k])continue;if(k===goal)break;closed[k]=1;const p=xy(k);for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]]){let x=k%cols+dx,y=Math.floor(k/cols)+dy;if(x<1||x>=cols-1||y<1||y>=rows-1)continue;let n=idx(x,y),q=xy(n);if(closed[n]||!clearSegment(p,q,origin,dest))continue;const cross=((q.x-A.x)*(B.y-A.y)-(q.y-A.y)*(B.x-A.x))/(Math.hypot(B.x-A.x,B.y-A.y)||1);const desired=side*28;const bias=Math.min(1,Math.abs(cross-desired)/150)*.65;const center=Math.hypot(q.x-230,q.y-212)/240;const g=dist[k]+Math.hypot(dx,dy)*step*(1+bias+center*.12);if(g<dist[n]){dist[n]=g;prev[n]=k;open.push(n)}}}if(start!==goal&&prev[goal]<0)return null;let points=[B];for(let k=goal;k!==start;k=prev[k])points.push(xy(k));points.push(A);points.reverse();let reduced=[points[0]];for(let i=0;i<points.length-1;){let j=i+1;while(j+1<points.length&&Math.hypot(points[j+1].x-points[i].x,points[j+1].y-points[i].y)<46&&clearSegment(points[i],points[j+1],origin,dest))j++;reduced.push(points[j]);i=j;}
// Trim the endpoints to their visible rims, without changing their stations.
function trim(ps,r){const a=ps[0];while(ps.length>2&&Math.hypot(ps[1].x-a.x,ps[1].y-a.y)<r)ps.splice(1,1);const b=ps[1],d=Math.hypot(b.x-a.x,b.y-a.y);ps[0]={x:a.x+(b.x-a.x)*r/d,y:a.y+(b.y-a.y)*r/d};}trim(reduced,origin==='hermes'?43:26);reduced.reverse();trim(reduced,dest==='hermes'?43:26);reduced.reverse();
// Keep the A* detour as straight segments rather than smoothing its bends.
for(let i=1;i<reduced.length;i++)if(!clearSegment(reduced[i-1],reduced[i],origin,dest))return null;
return `M${reduced[0].x} ${reduced[0].y}`+reduced.slice(1).map(p=>` L${p.x} ${p.y}`).join('');}

// Vary the sampled guide with irregular offsets; only the tested line segments are rendered.
function pathSamples(d){const nums=d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number),vertices=[];for(let i=0;i<nums.length;i+=2)vertices.push({x:nums[i],y:nums[i+1]});const lengths=[],total=vertices.slice(1).reduce((n,p,i)=>{const len=Math.hypot(p.x-vertices[i].x,p.y-vertices[i].y);lengths.push(len);return n+len},0);return Array.from({length:21},(_,i)=>{let distance=total*i/20,j=0;while(j<lengths.length-1&&distance>lengths[j])distance-=lengths[j++];const t=lengths[j]?distance/lengths[j]:0,a=vertices[j],b=vertices[j+1];return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}});}

// Symmetric nearest-point distance compares geometry, not SVG command strings.
function different(a,b){const directed=(x,y)=>Math.max(...x.map(p=>Math.min(...y.map(q=>Math.hypot(p.x-q.x,p.y-q.y)))));return Math.max(directed(a,b),directed(b,a))>=8;}
function curved(origin,dest,offset){
  const a=position(origin),z=position(dest),dx=z.x-a.x,dy=z.y-a.y,dist=Math.hypot(dx,dy),nx=-dy/dist,ny=dx/dist;
  const b={x:a.x+dx/3+nx*offset,y:a.y+dy/3+ny*offset},c={x:a.x+2*dx/3+nx*offset,y:a.y+2*dy/3+ny*offset};
  const rim=(p,q,r)=>{const d=Math.hypot(q.x-p.x,q.y-p.y);return {x:p.x+(q.x-p.x)*r/d,y:p.y+(q.y-p.y)*r/d}};
  const start=rim(a,b,origin==='hermes'?43:26),end=rim(z,c,dest==='hermes'?43:26);
  const sample=t=>{const u=1-t;return {x:u*u*u*start.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*end.x,y:u*u*u*start.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*end.y}};
  // Use a visibly broken polyline; test the actual straight segments, not a curve.
  const vertices=Array.from({length:8},(_,i)=>{const t=i/7,p=sample(t);if(i===0||i===7)return p;const jitter=Math.sin(i*7.31+offset*.19)*Math.min(13,dist*.055)*Math.sin(Math.PI*t);return {x:p.x+nx*jitter,y:p.y+ny*jitter}});
  // A zero offset would be straight; skip it in favour of bent alternatives.
  if(!offset)return null;
  for(let i=1;i<vertices.length;i++)if(!clearSegment(vertices[i-1],vertices[i],origin,dest))return null;
  const d=`M${vertices[0].x} ${vertices[0].y}`+vertices.slice(1).map(p=>` L${p.x} ${p.y}`).join('');
  return {d,samples:pathSamples(d)};
}

function create(svg, onChange=()=>{}) {
// Routes are calculated in a worker; cycling spreads consecutive flights.
const candidateCache=new Map();
const workerSource=`'use strict';const stations=${JSON.stringify(stations)},locations=${JSON.stringify(locations)},obstacles=${JSON.stringify(obstacles)};const point=${point.toString()},position=${position.toString()},blocked=${blocked.toString()},clearSegment=${clearSegment.toString()},route=${route.toString()},curved=${curved.toString()},pathSamples=${pathSamples.toString()},different=${different.toString()};onmessage=e=>{const {key,origin,destination}=e.data;try{const paths=[];for(const offset of [0,55,-55,28,-28,80,-80,110,-110,165,-165]){const p=curved(origin,destination,offset);if(p&&!paths.some(q=>q.samples&&Math.max(...p.samples.map((v,i)=>Math.hypot(v.x-q.samples[i].x,v.y-q.samples[i].y)))<8))paths.push({...p,lane:offset})}if(paths.length<4)for(let lane=0;lane<5;lane++){const d=route(origin,destination,lane);if(d){const samples=pathSamples(d);if(paths.every(p=>different(samples,p.samples)))paths.push({d,lane:'astar'+lane,samples})}}postMessage({key,paths})}catch(error){postMessage({key,error:String(error)})}}`;
let worker;try{const url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));try{worker=new Worker(url)}finally{URL.revokeObjectURL(url)}}catch(e){worker=null}
const pendingRoutes=new Map();
if(worker){worker.onmessage=e=>{const {key,paths,error}=e.data, pending=pendingRoutes.get(key);if(!pending)return;pendingRoutes.delete(key);clearTimeout(pending.timer);if(error||!paths.length){pending.reject(new Error(error||'безопасный маршрут не найден'));return}candidateCache.set(key,paths);pending.resolve(paths)};worker.onerror=()=>{for(const p of pendingRoutes.values()){clearTimeout(p.timer);p.reject(new Error('ошибка расчёта маршрута'))}pendingRoutes.clear();worker.terminate();worker=null}};
function candidates(origin,destination){const key=origin+'→'+destination;if(candidateCache.has(key))return Promise.resolve(candidateCache.get(key));if(pendingRoutes.has(key))return pendingRoutes.get(key).promise;if(!worker)return Promise.reject(new Error('Worker недоступен'));let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});const timer=setTimeout(()=>{const p=pendingRoutes.get(key);if(p){pendingRoutes.delete(key);p.reject(new Error('тайм-аут расчёта маршрута'))}},15000);pendingRoutes.set(key,{promise,resolve,reject,timer});worker.postMessage({key,origin,destination});return promise}

const flights=elt('g',{class:'flights','data-lm-overlay':'', 'pointer-events':'none'});svg.insertBefore(flights,svg.querySelector('[data-lm-key="active-badges"]'));
const active=new Map(), seen=new Set(), routeSequences=new Map(); let dead=false, raf;
function launch({id,origin,destination,startedAt=Date.now(),endedAt,failed=false}) {
  if(dead||seen.has(id)||origin===destination||!locations.some(x=>x[0]===origin)||!locations.some(x=>x[0]===destination)) return;
  seen.add(id); if(seen.size>4096)seen.delete(seen.values().next().value); const key=origin+'→'+destination, sequence=routeSequences.get(key)||0;routeSequences.set(key,sequence+1);
  const f={id,origin,destination,startedAt,endedAt,failed,pending:true};active.set(id,f);onChange();
  candidates(origin,destination).then(options=>{if(dead||!active.has(id))return;
    if(f.endedAt && Date.now()-f.endedAt>=800){active.delete(id);onChange();return}
    const {d,lane}=options[sequence%options.length], g=elt('g',{class:'flight','data-flight':id,'data-origin':origin,'data-destination':destination,'data-lane':lane,'data-reused':sequence>=options.length?'true':'false'}), color=destination==='memory'?'#a5e6dc':'#f0c595';
    const path=elt('path',{d,fill:'none',stroke:color,'stroke-width':'1.5',opacity:'.35'}),dots=[2,1,0].map(k=>elt('circle',{class:'pulse-dot','data-tail':k,r:Math.round(3.8*(1-.27*k)*10)/10,fill:color,opacity:1-.36*k})),satellite=elt('circle',{class:'satellite',r:4,fill:color,stroke:destination==='memory'?'#62c7ba':'#e1ac6e','stroke-width':1.5});
    g.append(path,...dots,satellite);flights.append(g);
    Object.assign(f,{pending:false,g,path,dots,satellite,slot:null,returning:false});onChange();
  }).catch(error=>{if(dead)return;active.delete(id);onChange(error)});
}
function end(id,endedAt=Date.now(),failed=false){const f=active.get(id);if(f&&!f.endedAt){f.endedAt=endedAt;f.failed=failed}}
function frame(now){if(dead)return;const wall=Date.now();let changed=false;for(const [id,f] of active){if(f.pending)continue;const elapsed=wall-f.startedAt;
 if(elapsed<0){for(const dot of f.dots)dot.style.display='none';f.satellite.style.display='none';continue}f.satellite.style.display='';
 if(f.endedAt && wall>=f.endedAt&&!f.returning){f.returning=true;f.satellite.remove();const color=f.failed?'#e8654f':'#a8d9b5';for(const dot of f.dots){const k=Number(dot.dataset.tail);dot.setAttribute('fill',color);dot.setAttribute('r',Math.round(2.6*(1-.27*k)*10)/10)}f.g.dataset.outcome=f.failed?'error':'success';changed=true}
 if(f.returning&&wall-f.endedAt>=800){f.g.remove();active.delete(id);changed=true;continue}
 for(const dot of f.dots){const k=Number(dot.dataset.tail),age=f.returning?wall-f.endedAt:elapsed,progress=Math.max(0,Math.min(1,(age-k*45)/800)),travel=f.returning?1-progress:progress;dot.style.display=age>=k*45&&(f.returning||elapsed<800)?'':'none';const p=f.path.getPointAtLength(travel*f.path.getTotalLength());dot.setAttribute('cx',p.x);dot.setAttribute('cy',p.y)}
 if(!f.returning){const p=position(f.destination),nearest=Math.min(...locations.filter(([id])=>id!==f.destination).map(([id])=>{const q=position(id);return Math.hypot(p.x-q.x,p.y-q.y)})),outer=Math.max(0,nearest/2-4.75),spacing=9.5,capacity=Math.max(0,Math.floor((outer-9.5)/spacing)+1);
 // Fixed concentric slots never shift when other calls finish. Overflow waits
 // invisibly for a slot instead of overlapping another orbit or crossing the cap.
 if(f.slot===null){const occupied=new Set([...active.values()].filter(x=>x!==f&&x.destination===f.destination&&!x.returning&&x.slot!==null&&x.slot!==undefined).map(x=>x.slot));let slot=0;while(slot<capacity&&occupied.has(slot))slot++;if(slot<capacity)f.slot=slot}
 if(f.slot===null||f.slot>=capacity){f.satellite.style.display='none';continue}
 const radius=outer-f.slot*spacing,angle=(now/850)+f.slot*2.399963229728653;f.satellite.setAttribute('cx',p.x+radius*Math.cos(angle));f.satellite.setAttribute('cy',p.y+radius*Math.sin(angle));f.g.dataset.orbitSlot=f.slot}}

 if(changed)onChange();raf=requestAnimationFrame(frame)}raf=requestAnimationFrame(frame);
 function destroy(){dead=true;cancelAnimationFrame(raf);if(worker)worker.terminate();for(const p of pendingRoutes.values()){clearTimeout(p.timer);p.reject(new Error('overlay disposed'))}pendingRoutes.clear();active.clear();flights.remove()}
 return {launch,end,destroy,active,seen,flights};
}
return {create,stations,locations,position,obstacles};
})();
