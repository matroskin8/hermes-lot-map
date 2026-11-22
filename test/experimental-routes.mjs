import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
let workerSource
class E { constructor(){this.style={};this.dataset={}} setAttribute(){} insertBefore(){} querySelector(){return null} remove(){} }
const s={document:{createElementNS:()=>new E()},Blob:class{constructor(parts){workerSource=parts.join('')}},URL:{createObjectURL:()=>'',revokeObjectURL(){}},Worker:class{postMessage(){} terminate(){}},setTimeout,clearTimeout,requestAnimationFrame:()=>1,cancelAnimationFrame(){},console}
vm.createContext(s);vm.runInContext(readFileSync(new URL('../desktop/overlay-engine.js',import.meta.url),'utf8').replace('return {create,stations,locations,position,obstacles};','return {create,stations,locations,position,obstacles,clearSegment};')+';globalThis.engine=LotMapOverlay',s)
// The historical A* segment clips the expanded hooks label corner between 1.5px samples.
assert.equal(s.engine.clearSegment({x:170,y:110},{x:150,y:140},'you','agents'),false)
// The exact same obstacle must not be ignored just because an endpoint is nearby.
assert.equal(s.engine.clearSegment({x:170,y:110},{x:150,y:140},'you','hooks'),true)
const eng=s.engine, overlay=eng.create(new E());overlay.launch({id:'capture',origin:'hermes',destination:'web'});assert.ok(workerSource)
let response;const w={onmessage:null,postMessage:x=>response=x};vm.createContext(w);vm.runInContext(workerSource,w)
let pairs=0,total=0,min=Infinity,straight=0
const variants=["shards","switchback","fracture","lightning"]; const geometries=new Map()
for(const variant of variants) for(const [origin] of eng.locations) for(const [destination] of eng.locations){if(origin===destination)continue
 const key=origin+'→'+destination;w.onmessage({data:{key,requestId:1,origin,destination,variant}});assert.ok(!response.error,`${key}: ${response.error}`);assert.ok(response.paths.length,`${key}: no route`);pairs++;total+=response.paths.length; const previous=geometries.get(key)||[]; previous.push(response.paths[0].d);geometries.set(key,previous);min=Math.min(min,response.paths.length)
 assert.ok(response.paths.length>=4,`${variant} ${key}: insufficient distinct routes`)
 for(const p of response.paths){assert.ok(String(p.lane).startsWith(variant),`${variant} ${key}: production fallback`);assert.match(p.d,/^M[\d.\-e]+ [\d.\-e]+(?: L[\d.\-e]+ [\d.\-e]+)+$/i,key);let n=p.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);let pts=[];for(let i=0;i<n.length;i+=2)pts.push({x:n[i],y:n[i+1]});const a=pts[0],b=pts.at(-1),length=Math.hypot(b.x-a.x,b.y-a.y); const deviation=Math.max(...pts.map(p=>Math.abs((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))/(length||1))); if(deviation<1e-6)straight++; assert.ok(deviation>=1,`${variant} ${key}: geometrically straight`)
 if(variant==='lightning'){const turns=pts.slice(1,-1).map((p,i)=>{const a=pts[i],b=pts[i+2],u={x:p.x-a.x,y:p.y-a.y},v={x:b.x-p.x,y:b.y-p.y};return Math.abs(Math.atan2(u.x*v.y-u.y*v.x,u.x*v.x+u.y*v.y))});assert.ok(turns.some(t=>t>=Math.PI/6),`${key}: lightning lacks a sharp turn`)}
 for(let i=1;i<pts.length;i++){let a=pts[i-1],b=pts[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.5));for(let j=0;j<=steps;j++){let x=a.x+(b.x-a.x)*j/steps,y=a.y+(b.y-a.y)*j/steps;assert.ok(x>=5&&x<=455&&y>=5&&y<=425,`${key} bounds`);for(const o of eng.obstacles){if(o.id===origin||o.id===destination)continue;let hit=o.type==='circle'?Math.hypot(x-o.x,y-o.y)<=o.r+2:x>=o.x-2&&x<=o.x+o.w+2&&y>=o.y-2&&y<=o.y+o.h+2;assert.ok(!hit,`${key} collides with ${o.id}`)}}}
 }
 for(let i=0;i<response.paths.length;i++)for(let j=0;j<i;j++){const x=response.paths[i].samples,y=response.paths[j].samples;const directed=(a,b)=>Math.max(...a.map(p=>Math.min(...b.map(q=>Math.hypot(p.x-q.x,p.y-q.y)))));assert.ok(Math.max(directed(x,y),directed(y,x))>=8,`${variant} ${key}: geometrically duplicate`)}
}
for(const key of ['hermes→web','hermes→files','you→agents']) assert.equal(new Set(geometries.get(key)).size,3,`${key} variants distinct`);
// Representative cross-map trips must actually use the central annulus, not
// merely differ as strings while following the original outer-rim routes.
for(const variant of variants) for(const [origin,destination] of [['you','web'],['model','skills'],['files','agents']]){
 const key=origin+'→'+destination;w.onmessage({data:{key,requestId:2,origin,destination,variant}});
 assert.ok(response.paths.length,`${variant} ${key} missing`);
 for(const p of response.paths){
  assert.ok(String(p.lane).startsWith(variant),`${variant} ${key} silently fell back`);
  const nums=p.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number),pts=[];
  for(let i=0;i<nums.length;i+=2)pts.push({x:nums[i],y:nums[i+1]});
  assert.ok(pts.some(q=>Math.hypot(q.x-230,q.y-212)<145),`${variant} ${key} misses center`);
  for(let i=1;i<pts.length;i++)assert.ok(eng.clearSegment(pts[i-1],pts[i],origin,destination),`${variant} ${key} exact collision`);
 }
}
overlay.destroy();console.log(`PASS experimental worker ${pairs} directed pairs, ${total} candidates; minimum ${min}, straight ${straight}; sampled clearance 0.5 units; distinct path strings`)
