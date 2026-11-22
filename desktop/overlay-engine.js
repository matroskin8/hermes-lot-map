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
function clearSegment(a,b,origin,dest){
 if(a.x<5||a.x>455||a.y<5||a.y>425||b.x<5||b.x>455||b.y<5||b.y>425)return false;
 const dx=b.x-a.x,dy=b.y-a.y;
 for(const o of obstacles){if(o.id===origin||o.id===dest)continue;
  if(o.type==='circle'){const t=Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.y-a.y)*dy)/(dx*dx+dy*dy||1)));if(Math.hypot(a.x+t*dx-o.x,a.y+t*dy-o.y)<=o.r+2)return false;}
  else{let lo=0,hi=1;for(const [v,d,min,max] of [[a.x,dx,o.x-2,o.x+o.w+2],[a.y,dy,o.y-2,o.y+o.h+2]]){if(!d){if(v<min||v>max){lo=1;hi=0;break}}else{let t1=(min-v)/d,t2=(max-v)/d;if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);if(lo>hi)break}}if(lo<=hi)return false;}
 }return true;
}
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

const orbitGeometry=new Map(locations.map(([id])=>{const p=position(id),nearest=Math.min(...locations.filter(([other])=>other!==id).map(([other])=>{const q=position(other);return Math.hypot(p.x-q.x,p.y-q.y)})),outer=Math.max(0,nearest/2-4.75),base=Math.min(id==='hermes'?48:30,outer);return [id,{p,outer,base,capacity:10}]}));
// Trim at the first intersection, extending the final segment toward the centre
// when the visible-rim route ends outside the selected inner orbit.
function orbitRoute(d,center,radius){
 const nums=d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number),pts=[];
 for(let i=0;i<nums.length;i+=2)pts.push({x:nums[i],y:nums[i+1]});
 // Large accepted overlapping orbits may contain the origin. Travel outward
 // from the route start to a real contact instead of waiting forever for entry.
 const start=pts[0],distance=Math.hypot(start.x-center.x,start.y-center.y);
 if(distance<radius){const angle=distance?Math.atan2(start.y-center.y,start.x-center.x):0,hit={x:center.x+radius*Math.cos(angle),y:center.y+radius*Math.sin(angle)};return {d:`M${start.x} ${start.y} L${hit.x} ${hit.y}`,angle}}
 pts.push(center);
 for(let i=1;i<pts.length;i++){
  const a=pts[i-1],b=pts[i],dx=b.x-a.x,dy=b.y-a.y,x=a.x-center.x,y=a.y-center.y,A=dx*dx+dy*dy,B=2*(x*dx+y*dy),C=x*x+y*y-radius*radius,disc=B*B-4*A*C;
  if(!A||disc<0)continue;
  const roots=[(-B-Math.sqrt(disc))/(2*A),(-B+Math.sqrt(disc))/(2*A)];
  const t=roots.find(t=>t>=0&&t<=1);if(t===undefined)continue;
  const hit={x:a.x+t*dx,y:a.y+t*dy},vertices=pts.slice(0,i).concat(hit);
  return {d:`M${vertices[0].x} ${vertices[0].y}`+vertices.slice(1).map(p=>` L${p.x} ${p.y}`).join(''),angle:Math.atan2(hit.y-center.y,hit.x-center.x)};
 }
 return null;
}
function create(svg, onChange=()=>{}, options={}) {
let variant=['shards','switchback','fracture'].includes(options.variant)?options.variant:'production';
function setVariant(value){variant=['shards','switchback','fracture'].includes(value)?value:'production'}
// Independent visibility-graph routes through the central annulus. Nodes are
// real waypoints, never perturbations of production routes. Each edge (and the
// final rim-trimmed edge) is checked analytically against expanded obstacles.
function experimental(origin,destination,variant){
 const A=position(origin), B=position(destination), nodes=[A,B];
 for(const r of [68,100,135,165])for(let i=0;i<16;i++){
  const angle=i*Math.PI/8, p={x:230+r*Math.cos(angle),y:212+r*Math.sin(angle)};
  if(!blocked(p,origin,destination))nodes.push(p);
 }
 const edges=nodes.map(()=>[]);
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
  const a=nodes[i],b=nodes[j],len=Math.hypot(b.x-a.x,b.y-a.y);
  if(len>115||!clearSegment(a,b,origin,destination))continue;
  edges[i].push([j,len]);edges[j].push([i,len]);
 }
 const results=[];
 // Force independent routes through different central anchors rather than merely
 // adjusting costs: small cost changes often select the same straight spoke.
 const anchors=nodes.map((p,i)=>({p,i})).filter(({p,i})=>i>1&&Math.hypot(p.x-230,p.y-212)<145&&Math.hypot(p.x-A.x,p.y-A.y)>30&&Math.hypot(p.x-B.x,p.y-B.y)>30);
 for(let seed=0;seed<Math.min(anchors.length,12);seed++){
  const anchor=anchors[Math.floor(seed*anchors.length/Math.min(anchors.length,12))];
  const n=nodes.length,dist=new Float64Array(n*2);dist.fill(Infinity);dist[0]=0;
  const prev=new Int32Array(n*2);prev.fill(-1);const done=new Uint8Array(n*2);
  // State bit requires this seed's central anchor, not just any waypoint.
  for(let iter=0;iter<n*2;iter++){
   let k=-1;for(let i=0;i<n*2;i++)if(!done[i]&&(k<0||dist[i]<dist[k]))k=i;
   if(k<0||!Number.isFinite(dist[k])||k===n+1)break;
   done[k]=1;const from=k%n,a=nodes[from];
   for(const [to,len] of edges[from]){
    const b=nodes[to],central=to===anchor.i;
    const next=to+((k>=n||central)?n:0);if(done[next])continue;
    const angle=Math.atan2(b.y-a.y,b.x-a.x),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    // Three distinct global objectives: radial spokes, orthogonal switchbacks,
    // and a seeded diagonal lattice. All prefer the central cross to the rim.
    const radial=Math.atan2(mid.y-212,mid.x-230);
    const preference=variant==='shards'?Math.abs(Math.sin(angle-radial))*0.8:
      variant==='switchback'?Math.abs(Math.sin(2*angle))*1.5:
      Math.abs(Math.sin(2*(angle-Math.PI/4)))*1.3;
    const phase=seed*Math.PI/4, side=(mid.x-230)*Math.cos(phase)+(mid.y-212)*Math.sin(phase);
    const center=Math.hypot(mid.x-230,mid.y-212)/165;
    const cost=len*(1+preference+center*.7+Math.max(0,-side/165)*.8);
    if(dist[k]+cost<dist[next]){dist[next]=dist[k]+cost;prev[next]=k}
   }
  }
  let k=n+1;if(!Number.isFinite(dist[k]))continue;const points=[];
  while(k!==-1){points.push(nodes[k%n]);k=prev[k]}points.reverse();
  if(points.length<3)continue;
  const rim=(p,q,r)=>{const d=Math.hypot(q.x-p.x,q.y-p.y);return {x:p.x+(q.x-p.x)*r/d,y:p.y+(q.y-p.y)*r/d}};
  // Drop waypoints within the visible rim before trimming.
  const r1=origin==='hermes'?43:26,r2=destination==='hermes'?43:26;
  while(points.length>2&&Math.hypot(points[1].x-A.x,points[1].y-A.y)<=r1)points.splice(1,1);
  while(points.length>2&&Math.hypot(points[points.length-2].x-B.x,points[points.length-2].y-B.y)<=r2)points.splice(points.length-2,1);
  points[0]=rim(A,points[1],r1);points[points.length-1]=rim(B,points[points.length-2],r2);
  if(!points.slice(1).every((p,i)=>clearSegment(points[i],p,origin,destination)))continue;
  const first=points[0],last=points[points.length-1],dx=last.x-first.x,dy=last.y-first.y,chord=Math.hypot(dx,dy);
  if(!chord||!points.some(p=>Math.abs(dx*(p.y-first.y)-dy*(p.x-first.x))/chord>=1))continue;
  const d=`M${points[0].x} ${points[0].y}`+points.slice(1).map(p=>` L${p.x} ${p.y}`).join(''),samples=pathSamples(d);
  if(results.every(p=>different(samples,p.samples)))results.push({d,samples,lane:variant+seed});
 }
 return results;
}
// Routes are calculated in a worker; cycling spreads consecutive flights.
const candidateCache=new Map();
const workerSource=`'use strict';const stations=${JSON.stringify(stations)},locations=${JSON.stringify(locations)},obstacles=${JSON.stringify(obstacles)};const point=${point.toString()},position=${position.toString()},blocked=${blocked.toString()},clearSegment=${clearSegment.toString()},route=${route.toString()},curved=${curved.toString()},pathSamples=${pathSamples.toString()},different=${different.toString()},experimental=${experimental.toString()};onmessage=e=>{const {key,requestId,origin,destination,variant='production'}=e.data;try{if(variant!=='production'){const paths=experimental(origin,destination,variant);postMessage({key,requestId,paths});return}let paths=[];for(const offset of [0,55,-55,28,-28,80,-80,110,-110,165,-165]){const p=curved(origin,destination,offset);if(p&&!paths.some(q=>q.samples&&Math.max(...p.samples.map((v,i)=>Math.hypot(v.x-q.samples[i].x,v.y-q.samples[i].y)))<8))paths.push({...p,lane:offset})}if(paths.length<4)for(let lane=0;lane<5;lane++){const d=route(origin,destination,lane);if(d){const samples=pathSamples(d);if(paths.every(p=>different(samples,p.samples)))paths.push({d,lane:'astar'+lane,samples})}}postMessage({key,requestId,paths})}catch(error){postMessage({key,requestId,error:String(error)})}}`;
let worker=null, nextRequestId=0;
const pendingRoutes=new Map();
function ensureWorker(){
 if(worker)return worker;
 try{const url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));try{worker=new Worker(url)}finally{URL.revokeObjectURL(url)}}catch(e){worker=null;return null}
 const current=worker;
 current.onmessage=e=>{const {key,requestId,paths,error}=e.data, pending=pendingRoutes.get(key);if(!pending||pending.requestId!==requestId)return;pendingRoutes.delete(key);clearTimeout(pending.timer);if(error||!Array.isArray(paths)||!paths.length){pending.reject(new Error(error||'безопасный маршрут не найден'));return}candidateCache.set(key,paths);pending.resolve(paths)};
 current.onerror=()=>{if(worker!==current)return;for(const p of pendingRoutes.values()){clearTimeout(p.timer);p.reject(new Error('ошибка расчёта маршрута'))}pendingRoutes.clear();current.terminate();worker=null};
 return current;
}
function candidates(origin,destination,variant){const key=variant+'|'+origin+'→'+destination;if(candidateCache.has(key))return Promise.resolve(candidateCache.get(key));if(pendingRoutes.has(key))return pendingRoutes.get(key).promise;const current=ensureWorker();if(!current)return Promise.reject(new Error('Worker недоступен'));let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b}),requestId=++nextRequestId;const timer=setTimeout(()=>{const p=pendingRoutes.get(key);if(p&&p.requestId===requestId){pendingRoutes.delete(key);p.reject(new Error('тайм-аут расчёта маршрута'))}},15000);pendingRoutes.set(key,{promise,resolve,reject,timer,requestId});try{current.postMessage({key,requestId,origin,destination,variant})}catch(error){clearTimeout(timer);pendingRoutes.delete(key);for(const p of pendingRoutes.values()){clearTimeout(p.timer);p.reject(error)}pendingRoutes.clear();current.terminate();worker=null;reject(error)}return promise}

const flights=elt('g',{class:'flights','data-lm-overlay':'', 'pointer-events':'none'});svg.insertBefore(flights,svg.querySelector('[data-lm-key="active-badges"]'));
const active=new Map(), seen=new Set(), unknownSeen=new Set(), routeSequences=new Map(); let dead=false, raf;
function launch({id,origin,destination,startedAt=Date.now(),endedAt,failed=false,unknown=false}) {
  if(!active.has(id)&&unknownSeen.has(id)&&endedAt!=null&&!unknown){seen.delete(id);unknownSeen.delete(id)}
  if(dead||active.has(id)||seen.has(id)||origin===destination||!locations.some(x=>x[0]===origin)||!locations.some(x=>x[0]===destination)) return;
  seen.add(id); if(unknown)unknownSeen.add(id); if(seen.size>4096){const oldest=seen.values().next().value;seen.delete(oldest);unknownSeen.delete(oldest)} const key=origin+'→'+destination, sequence=routeSequences.get(key)||0;routeSequences.set(key,sequence+1);
  const f={id,origin,destination,startedAt,endedAt,failed,unknown,pending:true};active.set(id,f);onChange();
  candidates(origin,destination,variant).then(options=>{if(dead||!active.has(id))return;
    const {d,lane}=options[sequence%options.length], g=elt('g',{class:'flight','data-flight':id,'data-origin':origin,'data-destination':destination,'data-lane':lane,'data-reused':sequence>=options.length?'true':'false'}), color='#f0c595', satelliteColor=color;
    const path=elt('path',{d,fill:'none',stroke:'none'}),returnPath=elt('path',{d,fill:'none',stroke:'none'}),dots=[2,1,0].map(k=>elt('circle',{class:'pulse-dot','data-tail':k,r:Math.round(3.8*(1-.27*k)*10)/10,fill:color,opacity:1-.36*k})),satellite=elt('circle',{class:'satellite',r:4,fill:satelliteColor,stroke:'#e1ac6e','stroke-width':1.5});
    const out=elt('g',{class:'outbound-trail'}),back=elt('g',{class:'response-trail'});
    const segment=(group,color,i)=>{const p=elt('path',{d,fill:'none',stroke:color,'stroke-width':'1.5','data-segment':i,opacity:0});group.append(p);return p};
    const outbound=Array.from({length:40},(_,i)=>segment(out,color,i)), response=Array.from({length:40},(_,i)=>segment(back,failed?'#e8654f':'#a8d9b5',i));
    g.append(path,returnPath,out,back,...dots,satellite);flights.append(g);
    Object.assign(f,{pending:false,g,path,returnPath,dots,satellite,outbound,response,slot:null,returning:false});onChange();
  }).catch(error=>{if(dead)return;active.delete(id);seen.delete(id);onChange(error)});
}
function end(id,endedAt=Date.now(),failed=false,unknown=false){const f=active.get(id);if(f&&(f.endedAt==null||(f.unknown&&!unknown))){f.endedAt=endedAt;f.failed=failed;f.unknown=unknown;if(unknown)unknownSeen.add(id);else unknownSeen.delete(id);if(f.returning)f.returning=false}}
function frame(now){if(dead)return;const wall=Date.now();let changed=false;for(const [id,f] of active){if(f.pending)continue;const elapsed=wall-f.startedAt;
 const returnAt=f.endedAt==null?Infinity:Math.max(f.startedAt+800,f.endedAt);
 if(elapsed<0){f.g.style.display='none';continue}f.g.style.display='';
 if(wall>=returnAt&&!f.returning){f.returning=true;f.satellite.remove();const color=f.unknown?'#9ba1ab':f.failed?'#e8654f':'#a8d9b5';for(const p of f.response)p.setAttribute('stroke',color);for(const dot of f.dots){const k=Number(dot.dataset.tail);dot.setAttribute('fill',color);dot.setAttribute('r',Math.round(2.6*(1-.27*k)*10)/10)}f.g.dataset.outcome=f.unknown?'unknown':f.failed?'error':'success';changed=true}
 if(wall>=returnAt+800+60000){f.g.remove();active.delete(id);changed=true;continue}
 // A late slot must not rewrite an already-visible route: that would teleport the dot.
 // Keep its original path and clock; the satellite appears on its assigned orbit after arrival.
 if(!f.returning&&f.slot===null){const {p,base,capacity}=orbitGeometry.get(f.destination),occupied=new Set([...active.values()].filter(x=>x!==f&&x.destination===f.destination&&!x.returning&&x.slot!=null).map(x=>x.slot));let slot=0;while(slot<capacity&&occupied.has(slot))slot++;if(slot<capacity){const selected=orbitRoute(f.path.getAttribute('d'),p,base+4.75*slot);if(selected){f.slot=slot;f.angle=selected.angle;if(!f.waiting){f.path.setAttribute('d',selected.d);for(const segment of f.outbound)segment.setAttribute('d',selected.d)}f.g.dataset.orbitSlot=slot}}else f.waiting=true}
 const length=f.path.getTotalLength(), returnLength=f.returnPath.getTotalLength(), n=f.outbound.length, travelElapsed=wall-(f.travelStart??f.startedAt), outProgress=Math.max(0,Math.min(1,travelElapsed/800)), backProgress=Math.max(0,Math.min(1,(wall-returnAt)/800));
 // Each small interval is clipped on the original path: no straight-line shortcuts at bends.
 for(let i=0;i<n;i++){const lo=i/n,hi=(i+1)/n, outEnd=Math.min(hi,outProgress,1-backProgress), backStart=Math.max(lo,1-backProgress);
   const paint=(p,start,end,opacity,length)=>{p.setAttribute('stroke-dasharray',`${Math.max(0,(end-start)*length)} ${length+1}`);p.setAttribute('stroke-dashoffset',-start*length);p.setAttribute('opacity',end>start?opacity:0)};
   const outLit=f.startedAt+lo*800, backLit=returnAt+(1-hi)*800;
   paint(f.outbound[i],lo,outEnd,Math.max(.5,1-Math.max(0,wall-outLit)/60000),length);
   paint(f.response[i],backStart,hi,Math.max(0,1-Math.max(0,wall-backLit)/60000),returnLength);
 }
 for(const dot of f.dots){const k=Number(dot.dataset.tail),age=f.returning?wall-returnAt:travelElapsed,progress=Math.max(0,Math.min(1,(age-k*45)/800)),travel=f.returning?1-progress:progress;dot.style.display=age>=k*45&&age<800+k*45?'':'none';const p=f.returning?f.returnPath.getPointAtLength(travel*returnLength):f.path.getPointAtLength(travel*length);dot.setAttribute('cx',p.x);dot.setAttribute('cy',p.y)}
 f.satellite.style.display='none';
 if(!f.returning&&f.slot!==null&&travelElapsed>=800){const {p,base}=orbitGeometry.get(f.destination),radius=base+4.75*f.slot,angle=f.angle+(travelElapsed-800)/(850*(f.slot+1));f.satellite.style.display='';f.satellite.setAttribute('cx',p.x+radius*Math.cos(angle));f.satellite.setAttribute('cy',p.y+radius*Math.sin(angle))}}

 if(changed)onChange();raf=requestAnimationFrame(frame)}raf=requestAnimationFrame(frame);
 function destroy(){dead=true;cancelAnimationFrame(raf);if(worker)worker.terminate();for(const p of pendingRoutes.values()){clearTimeout(p.timer);p.reject(new Error('overlay disposed'))}pendingRoutes.clear();active.clear();flights.remove()}
 return {launch,end,destroy,setVariant,active,seen,flights};
}
return {create,stations,locations,position,obstacles};
})();
