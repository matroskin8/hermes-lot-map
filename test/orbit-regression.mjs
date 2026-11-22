import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
class Element {
 constructor(){this.attrs={};this.children=[];this.dataset={};this.style={}}
 setAttribute(k,v){this.attrs[k]=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v)}
 getAttribute(k){return this.attrs[k]}
 append(...xs){for(const x of xs){x.parent=this;this.children.push(x)}}
 insertBefore(x){this.append(x)} querySelector(){return null} remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}
 points(){const n=this.attrs.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);return Array.from({length:n.length/2},(_,i)=>({x:n[2*i],y:n[2*i+1]}))}
 getTotalLength(){const p=this.points();return p.slice(1).reduce((s,v,i)=>s+Math.hypot(v.x-p[i].x,v.y-p[i].y),0)}
 getPointAtLength(n){const p=this.points();for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i],l=Math.hypot(b.x-a.x,b.y-a.y);if(n<=l||i===p.length-1){const t=l?Math.min(1,Math.max(0,n/l)):0;return {x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)}}n-=l}return p[0]}
}
let time=1000,callback,route
const sandbox={document:{createElementNS:()=>new Element()},Date:{now:()=>time},Map,Set,Math,Float64Array,Int32Array,Uint8Array,Blob,URL:{createObjectURL:()=>'',revokeObjectURL(){}},Worker:class{postMessage({key,requestId}){queueMicrotask(()=>this.onmessage({data:{key,requestId,paths:[{d:route,lane:0}]}}))}terminate(){}},setTimeout,clearTimeout,requestAnimationFrame:f=>(callback=f,1),cancelAnimationFrame(){}}
vm.createContext(sandbox);vm.runInContext(readFileSync(new URL('../desktop/overlay-engine.js',import.meta.url),'utf8').replace('return {create,stations,locations,position,obstacles};','return {create,stations,locations,position,obstacles,orbitRoute};')+';globalThis.engine=LotMapOverlay;globalThis.orbitRoute=LotMapOverlay.orbitRoute',sandbox)
const near=(a,b,eps=1e-7)=>assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<eps,`${JSON.stringify(a)} != ${JSON.stringify(b)}`)
// First intersection on a multi-segment path, not its later exit intersection.
const crossing=sandbox.orbitRoute('M-20 0 L-12 0 L0 0 L20 0',{x:0,y:0},10)
assert.equal(crossing.d,'M-20 0 L-12 0 L-10 0');assert.ok(Math.abs(crossing.angle-Math.PI)<1e-10)
// A route ending at radius 26 must extend inward for the 9.5 slot.
const extension=sandbox.orbitRoute('M-40 5 L-26 0',{x:0,y:0},9.5)
assert.equal(extension.d,'M-40 5 L-26 0 L-9.5 0')
// Expanded orbits can contain the start; the outbound path must reach contact.
const inside=sandbox.orbitRoute('M-20 0 L-5 0',{x:0,y:0},100)
assert.ok(inside);const endpoint=inside.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number).slice(-2)
assert.ok(Math.abs(Math.hypot(...endpoint)-100)<1e-7)
// Every island's first radius must match the last production single-orbit formula.
for(const [dest] of sandbox.engine.locations){
 const p=sandbox.engine.position(dest),nearest=Math.min(...sandbox.engine.locations.filter(([id])=>id!==dest).map(([id])=>{const q=sandbox.engine.position(id);return Math.hypot(p.x-q.x,p.y-q.y)})),outer=nearest/2-4.75,base=Math.min(dest==='hermes'?48:30,outer),capacity=10;
 route=`M${p.x-120} ${p.y} L${p.x-(dest==='hermes'?43:26)} ${p.y}`;
 const e=sandbox.engine.create(new Element());time=1000;
 for(let i=0;i<capacity+1;i++)e.launch({id:`${dest}-${i}`,origin:dest==='hermes'?'you':'hermes',destination:dest,startedAt:1000});
 await new Promise(r=>setImmediate(r));time=1799.999;callback(time);
 const contacts=Array.from({length:capacity},(_,i)=>{const dot=e.active.get(`${dest}-${i}`).dots.find(d=>d.dataset.tail==='0');return {x:+dot.getAttribute('cx'),y:+dot.getAttribute('cy')}});
 time=1800;callback(time);
 const obstacle=sandbox.engine.obstacles.find(o=>o.id===dest&&o.type==='circle');assert.equal(obstacle.r,dest==='hermes'?55:36);assert.ok(base<obstacle.r);
 for(let i=0;i<capacity;i++){const f=e.active.get(`${dest}-${i}`),sat={x:+f.satellite.getAttribute('cx'),y:+f.satellite.getAttribute('cy')},r=Math.hypot(sat.x-p.x,sat.y-p.y);assert.equal(f.satellite.getAttribute('r'),'4');assert.equal(f.satellite.getAttribute('stroke-width'),'1.5');assert.equal(f.slot,i);assert.ok(Math.abs(r-(base+i*4.75))<1e-7,`${dest} slot ${i}: ${r} vs ${base+i*4.75}`);near(contacts[i],sat,0.001)}
 assert.equal(e.active.get(`${dest}-${capacity}`).slot,null);e.destroy();
}
const center=sandbox.engine.position('you');route=`M${center.x-100} ${center.y} L${center.x-26} ${center.y}`
const svg=new Element(),engine=sandbox.engine.create(svg),tick=t=>{time=t;callback(t)},flush=()=>new Promise(r=>setImmediate(r))
const launch=id=>engine.launch({id,origin:'hermes',destination:'you',startedAt:1000})
const nearest=Math.min(...sandbox.engine.locations.filter(([id])=>id!=='you').map(([id])=>{const p=sandbox.engine.position(id);return Math.hypot(p.x-center.x,p.y-center.y)})),base=Math.min(30,nearest/2-4.75),capacity=10
assert.ok(capacity>=3)
for(let i=0;i<capacity+2;i++)launch(`f${i}`)
await flush();tick(1000)
for(let i=0;i<capacity;i++)assert.equal(engine.active.get(`f${i}`).slot,i)
for(let i=capacity;i<capacity+2;i++)assert.equal(engine.active.get(`f${i}`).slot,null)
const f=engine.active.get('f0');tick(1799.999);const dot=f.dots.find(d=>d.dataset.tail==='0');const last={x:+dot.getAttribute('cx'),y:+dot.getAttribute('cy')};assert.equal(dot.style.display,'');tick(1800);assert.equal(dot.style.display,'none');near(last,{x:+f.satellite.getAttribute('cx'),y:+f.satellite.getAttribute('cy')},0.001)
const before=[0,1].map(i=>{const s=engine.active.get(`f${i}`).satellite;return Math.atan2(+s.getAttribute('cy')-center.y,+s.getAttribute('cx')-center.x)})
tick(1900);const deltas=[0,1].map((i)=>{const s=engine.active.get(`f${i}`).satellite,a=Math.atan2(+s.getAttribute('cy')-center.y,+s.getAttribute('cx')-center.x);return (a-before[i]+2*Math.PI)%(2*Math.PI)})
assert.ok(deltas[0]>0&&deltas[1]>0);assert.ok(Math.abs(deltas[0]/deltas[1]-2)<1e-9)
for(let i=0;i<capacity;i++){const s=engine.active.get(`f${i}`).satellite,r=Math.hypot(+s.getAttribute('cx')-center.x,+s.getAttribute('cy')-center.y);assert.ok(Math.abs(r-(base+4.75*i))<1e-7);}
engine.end('f1',1900);engine.end('f2',1900);tick(1900);assert.equal(engine.active.get(`f${capacity}`).slot,1);assert.equal(engine.active.get(`f${capacity+1}`).slot,2);assert.equal(engine.active.get('f0').slot,0)
// Return uses the pre-existing route to the visible rim, not the altered inbound orbit route.
assert.equal(f.response[0].getAttribute('d'),route)
engine.end('f0',1900);tick(1900);near({x:+dot.getAttribute('cx'),y:+dot.getAttribute('cy')},{x:center.x-26,y:center.y})
engine.destroy();
// Independent overflow flight with admission mid-flight.
time=1000;const e2=sandbox.engine.create(new Element());for(let i=0;i<capacity+1;i++)e2.launch({id:`x${i}`,origin:'hermes',destination:'you',startedAt:i===1?0:1000});await flush();tick(1000);const ov=e2.active.get(`x${capacity}`), od=ov.dots.find(d=>d.dataset.tail==='0');tick(1400);assert.equal(od.style.display,'');assert.ok(+ov.outbound[0].getAttribute('opacity')>0);near({x:+od.getAttribute('cx'),y:+od.getAttribute('cy')},ov.path.getPointAtLength(ov.path.getTotalLength()/2));const beforeAdmission={x:+od.getAttribute('cx'),y:+od.getAttribute('cy')};e2.end('x1',1400);tick(1400);assert.equal(ov.slot,1);near(beforeAdmission,{x:+od.getAttribute('cx'),y:+od.getAttribute('cy')});assert.equal(ov.satellite.style.display,'none');tick(1800);assert.equal(ov.satellite.style.display,'');e2.destroy();
// An overflow completed quickly still flies out and returns at 800ms.
time=1000;const e3=sandbox.engine.create(new Element());for(let i=0;i<capacity+2;i++)e3.launch({id:`q${i}`,origin:'hermes',destination:'you',startedAt:1000});await flush();tick(1000);e3.end(`q${capacity}`,1100,true);tick(1400);const q=e3.active.get(`q${capacity}`),qd=q.dots.find(d=>d.dataset.tail==='0');assert.equal(q.slot,null);assert.equal(qd.style.display,'');assert.ok(+q.outbound[0].getAttribute('opacity')>0);tick(1799);assert.equal(q.returning,false);tick(1800);assert.equal(q.returning,true);assert.equal(qd.style.display,'');assert.equal(q.g.dataset.outcome,'error');tick(1900);assert.ok(+q.response[39].getAttribute('opacity')>0);e3.end('q0',1900);tick(1900);const late=e3.active.get(`q${capacity+1}`);assert.equal(late.slot,0);assert.equal(late.satellite.style.display,'');assert.equal(q.slot,null);tick(62600);assert.equal(e3.active.has(`q${capacity}`),false);e3.destroy();assert.equal(e3.active.size,0);assert.equal(e3.flights.parent.children.includes(e3.flights),false);
console.log('PASS orbit geometry: first intersection, inner extension, inbound handoff, direction/speed, capacity and reuse, original return endpoint')
