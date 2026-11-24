// Shared playground overlay engine. Generated into desktop/plugin.js and playground HTML.
const LotMapOverlay = (() => {
'use strict';
const stations=[['you','Вы'],['model','Модель'],['memory','Память'],['files','Файлы'],['shell','Терминал'],['web','Веб'],['browser','Браузер'],['agents','Агенты'],['skills','Навыки'],['hooks','Хуки']];
const locations=[['hermes','HERMES'],...stations], ns='http://www.w3.org/2000/svg';
const point=i=>({x:230+176*Math.sin(i*2*Math.PI/10),y:212-164*Math.cos(i*2*Math.PI/10)});
const position=id=>id==='hermes'?{x:230,y:212}:point(stations.findIndex(x=>x[0]===id));
const obstacles=locations.flatMap(([id,name])=>{const p=position(id);if(id==='hermes')return [{id,type:'circle',x:p.x,y:p.y,r:55}];return [{id,type:'circle',x:p.x,y:p.y,r:36},{id,type:'rect',x:p.x-Math.max(20,name.length*4.2)-4,y:p.y+27,w:2*(Math.max(20,name.length*4.2)+4),h:28}];});
const elt=(tag,attrs={})=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e};
const {clearSegment, workerSource}=LotMapRouteGenerator;
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
let variant=['shards','switchback','fracture','lightning','ants','moths','lizards','streams','swarm'].includes(options.variant)?options.variant:'production';
function setVariant(value){variant=['shards','switchback','fracture','lightning','ants','moths','lizards','streams','swarm'].includes(value)?value:'production'}
// Routes are calculated in a worker and cached by variant and endpoints.
const candidateCache=new Map();

let worker=null, nextRequestId=0;
const pendingRoutes=new Map();
function ensureWorker(){
 if(worker)return worker;
 try{const url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));try{worker=new Worker(url)}finally{URL.revokeObjectURL(url)}}catch(e){worker=null;return null}
 const current=worker;
 current.onmessage=e=>{const {key,requestId,paths,error}=e.data, pending=pendingRoutes.get(key);if(!pending||pending.requestId!==requestId)return;pendingRoutes.delete(key);clearTimeout(pending.timer);if(error||!Array.isArray(paths)||!paths.length){pending.reject(new Error(error||'безопасный маршрут не найден'));return}if(!key.startsWith('ants|'))candidateCache.set(key,paths);pending.resolve(paths)};
 current.onerror=()=>{if(worker!==current)return;for(const p of pendingRoutes.values()){clearTimeout(p.timer);p.reject(new Error('ошибка расчёта маршрута'))}pendingRoutes.clear();current.terminate();worker=null};
 return current;
}
function candidates(origin,destination,variant){const base=variant+'|'+origin+'→'+destination,key=variant==='ants'?base+'|'+(++nextRequestId):base;if(candidateCache.has(key))return Promise.resolve(candidateCache.get(key));if(pendingRoutes.has(key))return pendingRoutes.get(key).promise;const current=ensureWorker();if(!current)return Promise.reject(new Error('Worker недоступен'));let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b}),requestId=++nextRequestId;const timer=setTimeout(()=>{const p=pendingRoutes.get(key);if(p&&p.requestId===requestId){pendingRoutes.delete(key);p.reject(new Error('тайм-аут расчёта маршрута'))}},15000);pendingRoutes.set(key,{promise,resolve,reject,timer,requestId});try{current.postMessage({key,requestId,origin,destination,variant})}catch(error){clearTimeout(timer);pendingRoutes.delete(key);for(const p of pendingRoutes.values()){clearTimeout(p.timer);p.reject(error)}pendingRoutes.clear();current.terminate();worker=null;reject(error)}return promise}

const flights=elt('g',{class:'flights','data-lm-overlay':'', 'pointer-events':'none'});svg.insertBefore(flights,svg.querySelector('[data-lm-key="active-badges"]'));
const active=new Map(), seen=new Set(), unknownSeen=new Set(), routeSequences=new Map(), usedCandidates=new Map(); let dead=false, raf;
function launch({id,origin,destination,startedAt=Date.now(),endedAt,failed=false,unknown=false,settings={}}) {
  if(!active.has(id)&&unknownSeen.has(id)&&endedAt!=null&&!unknown){seen.delete(id);unknownSeen.delete(id)}
  if(dead||active.has(id)||seen.has(id)||origin===destination||!locations.some(x=>x[0]===origin)||!locations.some(x=>x[0]===destination)) return;
  seen.add(id); if(unknown)unknownSeen.add(id); if(seen.size>4096){const oldest=seen.values().next().value;seen.delete(oldest);unknownSeen.delete(oldest)} const routeVariant=variant, key=routeVariant+'|'+origin+'→'+destination, sequence=routeSequences.get(key)||0;routeSequences.set(key,sequence+1);
  const valid=(v,min,max,fallback)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:fallback;
  const f={id,origin,destination,startedAt,endedAt,failed,unknown,pending:true,outboundSeconds:valid(settings.outboundSeconds,1,3600,30),remainingPercent:valid(settings.remainingPercent,0,100,50),responseSeconds:valid(settings.responseSeconds,1,3600,60),maxSatellites:Math.floor(valid(settings.maxSatellites,0,10,10))};active.set(id,f);onChange();
  candidates(origin,destination,routeVariant).then(options=>{if(dead||active.get(id)!==f)return;
    const index=routeVariant==='production'?Math.floor(Math.random()*options.length):sequence%options.length, used=usedCandidates.get(key)||new Set(), reused=routeVariant==='production'?used.has(index):sequence>=options.length;used.add(index);usedCandidates.set(key,used);
    const {d,lane}=options[index], g=elt('g',{class:'flight','data-flight':id,'data-origin':origin,'data-destination':destination,'data-lane':lane,'data-reused':reused?'true':'false'}), color='#f0c595', satelliteColor=color;
    const path=elt('path',{d,fill:'none',stroke:'none'}),returnPath=elt('path',{d,fill:'none',stroke:'none'}),dots=[2,1,0].map(k=>elt('circle',{class:'pulse-dot','data-tail':k,r:Math.round(3.8*(1-.27*k)*10)/10,fill:color,opacity:1-.36*k})),satellite=elt('circle',{class:'satellite',r:4,fill:satelliteColor,stroke:'#e1ac6e','stroke-width':1.5});
    const out=elt('g',{class:'outbound-trail'}),back=elt('g',{class:'response-trail'});
    const segment=(group,color,i)=>{const p=elt('path',{d,fill:'none',stroke:color,'stroke-width':'1.5','data-segment':i,opacity:0});group.append(p);return p};
    const outbound=Array.from({length:40},(_,i)=>segment(out,color,i)), response=Array.from({length:40},(_,i)=>segment(back,failed?'#e8654f':'#a8d9b5',i));
    g.append(path,returnPath,out,back,...dots,satellite);flights.append(g);
    Object.assign(f,{pending:false,g,path,returnPath,dots,satellite,outbound,response,slot:null,returning:false});onChange();
  }).catch(error=>{if(dead||active.get(id)!==f)return;active.delete(id);seen.delete(id);onChange(error)});
}
function end(id,endedAt=Date.now(),failed=false,unknown=false){const f=active.get(id);if(f&&(f.endedAt==null||(f.unknown&&!unknown))){f.endedAt=endedAt;f.failed=failed;f.unknown=unknown;if(unknown)unknownSeen.add(id);else unknownSeen.delete(id);if(f.returning)f.returning=false}}
function frame(now){if(dead)return;const wall=Date.now();let changed=false;for(const [id,f] of active){if(f.pending)continue;const elapsed=wall-f.startedAt;
 const returnAt=f.endedAt==null?Infinity:Math.max(f.startedAt+800,f.endedAt);
 if(elapsed<0){f.g.style.display='none';continue}f.g.style.display='';
 if(wall>=returnAt&&!f.returning){f.returning=true;f.satellite.remove();const color=f.unknown?'#9ba1ab':f.failed?'#e8654f':'#a8d9b5',dotColor=f.unknown?'#5d6670':f.failed?'#c44e3e':'#2f8b60';for(const p of f.response)p.setAttribute('stroke',color);for(const dot of f.dots)dot.setAttribute('fill',dotColor);f.g.dataset.outcome=f.unknown?'unknown':f.failed?'error':'success';changed=true}
 if(wall>=returnAt+800+f.responseSeconds*1000){f.g.remove();active.delete(id);changed=true;continue}
 // A late slot must not rewrite an already-visible route: that would teleport the dot.
 // Keep its original path and clock; the satellite appears on its assigned orbit after arrival.
 if(!f.returning&&f.slot===null){const {p,base,capacity}=orbitGeometry.get(f.destination),occupied=new Set([...active.values()].filter(x=>x!==f&&x.destination===f.destination&&!x.returning&&x.slot!=null).map(x=>x.slot));let slot=0;while(slot<Math.min(capacity,f.maxSatellites)&&occupied.has(slot))slot++;if(slot<Math.min(capacity,f.maxSatellites)){const selected=orbitRoute(f.path.getAttribute('d'),p,base+4.75*slot);if(selected){f.slot=slot;f.angle=selected.angle;if(!f.waiting){f.path.setAttribute('d',selected.d);for(const segment of f.outbound)segment.setAttribute('d',selected.d)}f.g.dataset.orbitSlot=slot}}else f.waiting=true}
 const length=f.path.getTotalLength(), returnLength=f.returnPath.getTotalLength(), n=f.outbound.length, travelElapsed=wall-(f.travelStart??f.startedAt), outProgress=Math.max(0,Math.min(1,travelElapsed/800)), backProgress=Math.max(0,Math.min(1,(wall-returnAt)/800));
 // Each small interval is clipped on the original path: no straight-line shortcuts at bends.
 for(let i=0;i<n;i++){const lo=i/n,hi=(i+1)/n, outEnd=Math.min(hi,outProgress,1-backProgress), backStart=Math.max(lo,1-backProgress);
   const paint=(p,start,end,opacity,length)=>{p.setAttribute('stroke-dasharray',`${Math.max(0,(end-start)*length)} ${length+1}`);p.setAttribute('stroke-dashoffset',-start*length);p.setAttribute('opacity',end>start?opacity:0)};
   const outLit=f.startedAt+lo*800, backLit=returnAt+(1-hi)*800;
   paint(f.outbound[i],lo,outEnd,Math.max(f.remainingPercent/100,1-(1-f.remainingPercent/100)*Math.max(0,wall-outLit)/(f.outboundSeconds*1000)),length);
   paint(f.response[i],backStart,hi,Math.max(0,1-Math.max(0,wall-backLit)/(f.responseSeconds*1000)),returnLength);
 }
 for(const dot of f.dots){const k=Number(dot.dataset.tail),age=f.returning?wall-returnAt:travelElapsed,progress=Math.max(0,Math.min(1,(age-k*45)/800)),travel=f.returning?1-progress:progress;dot.style.display=age>=k*45&&age<800+k*45?'':'none';const p=f.returning?f.returnPath.getPointAtLength(travel*returnLength):f.path.getPointAtLength(travel*length);dot.setAttribute('cx',p.x);dot.setAttribute('cy',p.y)}
 f.satellite.style.display='none';
 if(!f.returning&&f.slot!==null&&travelElapsed>=800){const {p,base}=orbitGeometry.get(f.destination),radius=base+4.75*f.slot,angle=f.angle+(travelElapsed-800)/(850*(f.slot+1));f.satellite.style.display='';f.satellite.setAttribute('cx',p.x+radius*Math.cos(angle));f.satellite.setAttribute('cy',p.y+radius*Math.sin(angle))}}

 if(changed)onChange();raf=requestAnimationFrame(frame)}raf=requestAnimationFrame(frame);
 function clear(){for(const f of active.values())f.g?.remove();active.clear();seen.clear();unknownSeen.clear();routeSequences.clear();usedCandidates.clear();onChange()}
 function destroy(){dead=true;cancelAnimationFrame(raf);if(worker)worker.terminate();for(const p of pendingRoutes.values()){clearTimeout(p.timer);p.reject(new Error('overlay disposed'))}pendingRoutes.clear();active.clear();flights.remove()}
 return {launch,end,clear,destroy,setVariant,active,seen,flights};
}
return {create,stations,locations,position,obstacles};
})();
