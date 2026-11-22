import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
class Element {
 constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.style={};this.dataset={}}
 setAttribute(k,v){this.attrs[k]=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v)}
 getAttribute(k){return this.attrs[k]}
 append(...items){for(const x of items){x.parent=this;this.children.push(x)}}
 insertBefore(x){this.append(x)}
 querySelector(){return null}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}
 getTotalLength(){return 100}
 getPointAtLength(n){return {x:n,y:0}}
}
let time=100000,callback;const DateFake={now:()=>time}
const sandbox={document:{createElementNS:(_,tag)=>new Element(tag)},Date:DateFake,Map,Set,Math,Float64Array,Int32Array,Uint8Array,Blob,URL:{createObjectURL:()=>'',revokeObjectURL(){}},Worker:class{postMessage({key,requestId}){queueMicrotask(()=>this.onmessage({data:{key,requestId,paths:[{d:'M0 0 L100 0',lane:0}]}}))}terminate(){}},setTimeout,clearTimeout,requestAnimationFrame:f=>(callback=f,1),cancelAnimationFrame(){}}
vm.createContext(sandbox)
vm.runInContext(readFileSync(new URL('../desktop/overlay-engine.js',import.meta.url),'utf8')+';globalThis.engine=LotMapOverlay',sandbox)
const svg=new Element('svg'),engine=sandbox.engine.create(svg),tick=t=>{time=t;callback(t)}
// Outbound flight and trace are warm yellow for every destination, including Memory.
for(const [destination] of sandbox.engine.locations) {
 for(const failed of [false,true]) {
  const id=`color-${destination}-${failed}`,origin=destination==='hermes'?'web':'hermes'
  engine.launch({id,origin,destination,startedAt:100000})
 }
}
await new Promise(r=>setImmediate(r));tick(100400)
for(const [destination] of sandbox.engine.locations) {
 for(const failed of [false,true]) {
  const id=`color-${destination}-${failed}`,f=engine.active.get(id),color='#f0c595'
  assert.ok(f.dots.every(dot=>dot.getAttribute('fill')===color),`${destination}: outbound dots`)
  assert.ok(f.outbound.every(segment=>segment.getAttribute('stroke')===color),`${destination}: outbound trail`)
  assert.equal(f.satellite.getAttribute('fill'),color)
  assert.equal(f.satellite.getAttribute('stroke'),'#e1ac6e')
  engine.end(id,100400,failed)
 }
}
tick(100800)
for(const [destination] of sandbox.engine.locations) for(const failed of [false,true]) {
 const f=engine.active.get(`color-${destination}-${failed}`),color=failed?'#e8654f':'#a8d9b5'
 assert.ok(f.dots.every(dot=>dot.getAttribute('fill')===color),`${destination}: return dots`)
 assert.ok(f.response.every(segment=>segment.getAttribute('stroke')===color),`${destination}: return trail`)
}
for(const [id,f] of engine.active) { f.g.remove(); engine.active.delete(id) }
engine.launch({id:'a',origin:'hermes',destination:'memory',startedAt:100000});engine.launch({id:'b',origin:'hermes',destination:'shell',startedAt:100000});await new Promise(r=>setImmediate(r))
const a=engine.active.get('a'),b=engine.active.get('b'),num=(e,k)=>Number(e.getAttribute(k))
tick(99999);assert.equal(a.g.style.display,'none')
tick(100000);assert.equal(num(a.outbound[0],'opacity'),0)
tick(100400);assert.ok(num(a.outbound[0],'opacity')>.99);assert.equal(num(a.outbound[30],'opacity'),0);assert.ok(Number(a.dots[2].getAttribute('cx'))>49)
tick(115000);assert.ok(Math.abs(num(a.outbound[0],'opacity')-.75)<1e-9)
tick(130000);assert.equal(num(a.outbound[0],'opacity'),.5)
engine.end('a',130000,false);tick(130000);assert.equal(a.g.dataset.outcome,'success');assert.equal(a.response[0].getAttribute('stroke'),'#a8d9b5')
tick(130400);assert.equal(num(a.response[0],'opacity'),0);assert.ok(num(a.response[39],'opacity')>.99);assert.equal(num(a.outbound[39],'opacity'),0);assert.ok(num(a.outbound[0],'opacity')>0)
tick(130800);assert.ok(num(a.response[0],'opacity')>.99);assert.equal(num(a.outbound[0],'opacity'),0)
// Opacity alone does not prove a segment can paint: validate its dash geometry.
for(let i=0;i<40;i++) {
 const p=a.response[i], [dash,gap]=p.getAttribute('stroke-dasharray').split(' ').map(Number)
 assert.ok(Math.abs(dash-2.5)<1e-9);assert.equal(gap,101)
 assert.ok(Math.abs(num(p,'stroke-dashoffset')+i*2.5)<1e-9)
}
tick(160000);assert.ok(Math.abs(num(a.response[39],'opacity')-.5)<.001);assert.ok(engine.active.has('b'))
tick(190000);assert.equal(num(a.response[39],'opacity'),0);assert.ok(engine.active.has('a'))
tick(190800);assert.ok(!engine.active.has('a'));assert.ok(engine.active.has('b'))
engine.end('b',190800,true);tick(190800);assert.equal(b.response[0].getAttribute('stroke'),'#e8654f')
engine.launch({id:'quick',origin:'hermes',destination:'files',startedAt:190800,endedAt:190900});await new Promise(r=>setImmediate(r));tick(190900);assert.equal(engine.active.get('quick').returning,false);tick(191600);assert.equal(engine.active.get('quick').returning,true)
// Consecutive independent web calls remain separate actual routes, including returns.
engine.launch({id:'web-files',origin:'web',destination:'files',startedAt:191600})
engine.launch({id:'web-agents',origin:'web',destination:'agents',startedAt:191700})
await new Promise(r=>setImmediate(r));tick(192500)
const wf=engine.active.get('web-files'),wa=engine.active.get('web-agents')
assert.equal(wf.g.dataset.origin,'web');assert.equal(wf.g.dataset.destination,'files')
assert.equal(wa.g.dataset.origin,'web');assert.equal(wa.g.dataset.destination,'agents')
assert.ok(num(wf.outbound[0],'opacity')>0);assert.ok(num(wa.outbound[0],'opacity')>0)
assert.equal([...engine.active.values()].some(f=>f.origin==='files'&&f.destination==='agents'),false)
engine.end('web-files',192500,false);engine.end('web-agents',192500,true);tick(192900)
assert.equal(wf.response[0].getAttribute('stroke'),'#a8d9b5');assert.equal(wa.response[0].getAttribute('stroke'),'#e8654f')
assert.ok(num(wf.response[39],'opacity')>0);assert.ok(num(wa.response[39],'opacity')>0)
// Orbit slots expand beyond the nearest-station cap, remain stable, and overflow flies immediately.
for(const [id,f] of engine.active){f.g.remove();engine.active.delete(id)}
const dest='memory',center=sandbox.engine.position(dest),nearest=Math.min(...sandbox.engine.locations.filter(([id])=>id!==dest).map(([id])=>{const p=sandbox.engine.position(id);return Math.hypot(center.x-p.x,center.y-p.y)})),outer=nearest/2-4.75,base=Math.min(30,outer),capacity=10
for(let i=0;i<capacity+1;i++)engine.launch({id:`orbit-${i}`,origin:'hermes',destination:dest,startedAt:192900})
await new Promise(r=>setImmediate(r));tick(193700)
for(let i=0;i<capacity;i++){const f=engine.active.get(`orbit-${i}`),r=Math.hypot(num(f.satellite,'cx')-center.x,num(f.satellite,'cy')-center.y);assert.equal(f.slot,i);assert.ok(Math.abs(r-(base+i*4.75))<1e-8)}
const overflow=engine.active.get(`orbit-${capacity}`);assert.equal(overflow.slot,null);assert.equal(overflow.satellite.style.display,'none')
engine.end('orbit-1',193700);tick(193700);assert.equal(overflow.slot,1);assert.equal(engine.active.get('orbit-0').slot,0);assert.equal(overflow.satellite.style.display,'');tick(194500);assert.equal(overflow.satellite.style.display,'')
engine.destroy();assert.equal(engine.active.size,0);assert.equal(svg.children.length,0)
console.log('PASS fake clock: progressive geometry, 15s/30s outbound fade, reverse success/error, 60s fade, overlaps, future start, quick completion, destroy')
