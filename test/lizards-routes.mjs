import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
let workerSource
class E { constructor(){this.style={};this.dataset={}} setAttribute(){} insertBefore(){} querySelector(){return null} remove(){} }
const s={document:{createElementNS:()=>new E()},Blob:class{constructor(parts){workerSource=parts.join('')}},URL:{createObjectURL:()=>'',revokeObjectURL(){}},Worker:class{postMessage(){} terminate(){}},setTimeout,clearTimeout,requestAnimationFrame:()=>1,cancelAnimationFrame(){},console}
vm.createContext(s);vm.runInContext((readFileSync(new URL('../desktop/route-generator.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../desktop/overlay-engine.js',import.meta.url),'utf8')).replace('return {create,stations,locations,position,obstacles};','return {create,stations,locations,position,obstacles,clearSegment};')+';globalThis.engine=LotMapOverlay',s)
// The historical A* segment clips the expanded hooks label corner between 1.5px samples.
assert.equal(s.engine.clearSegment({x:170,y:110},{x:150,y:140},'you','agents'),false)
// The exact same obstacle must not be ignored just because an endpoint is nearby.
assert.equal(s.engine.clearSegment({x:170,y:110},{x:150,y:140},'you','hooks'),true)
const eng=s.engine, overlay=eng.create(new E());overlay.launch({id:'capture',origin:'hermes',destination:'web'});assert.ok(workerSource)
let response;const w={onmessage:null,postMessage:x=>response=x};vm.createContext(w);vm.runInContext(workerSource,w)
let pairs=0,total=0,min=Infinity,straight=0
for(const [origin] of eng.locations) for(const [destination] of eng.locations){if(origin===destination)continue
 const key=origin+'→'+destination;w.onmessage({data:{key,requestId:1,origin,destination,variant:"lizards"}});assert.ok(!response.error,`${key}: ${response.error}`);assert.ok(response.paths.length,`${key}: no route`);pairs++;total+=response.paths.length;min=Math.min(min,response.paths.length)
 for(const p of response.paths){assert.ok(p.lane.startsWith("lizards"));assert.match(p.d,/^M[\d.\-e]+ [\d.\-e]+(?: L[\d.\-e]+ [\d.\-e]+)+$/i,key);let n=p.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);let pts=[];for(let i=0;i<n.length;i+=2)pts.push({x:n[i],y:n[i+1]});if(pts.length===2)straight++; assert.ok(pts.length>=4,`${key}: too few kinks`); for(let i=1;i<pts.length;i++) assert.ok(eng.clearSegment(pts[i-1],pts[i],origin,destination),`${key}: exact collision`)
 for(let i=1;i<pts.length;i++){let a=pts[i-1],b=pts[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.5));for(let j=0;j<=steps;j++){let x=a.x+(b.x-a.x)*j/steps,y=a.y+(b.y-a.y)*j/steps;assert.ok(x>=5&&x<=455&&y>=5&&y<=425,`${key} bounds`);for(const o of eng.obstacles){if(o.id===origin||o.id===destination)continue;let hit=o.type==='circle'?Math.hypot(x-o.x,y-o.y)<=o.r+2:x>=o.x-2&&x<=o.x+o.w+2&&y>=o.y-2&&y<=o.y+o.h+2;assert.ok(!hit,`${key} collides with ${o.id}`)}}}
 }
 for(let i=0;i<response.paths.length;i++)for(let j=0;j<i;j++)assert.notEqual(response.paths[i].d,response.paths[j].d,`${key}: duplicate`)
}
overlay.destroy();console.log(`PASS lizards worker ${pairs} directed pairs, ${total} candidates; minimum ${min}, straight ${straight}; sampled clearance 0.5 units; distinct path strings`)
