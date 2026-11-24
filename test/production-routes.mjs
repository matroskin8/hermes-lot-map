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
 const key=origin+'→'+destination;w.onmessage({data:{key,requestId:1,origin,destination}});assert.ok(!response.error,`${key}: ${response.error}`);assert.ok(response.paths.length,`${key}: no route`);pairs++;total+=response.paths.length;min=Math.min(min,response.paths.length)
 for(const p of response.paths){assert.match(p.d,/^M[\d.\-e]+ [\d.\-e]+(?: L[\d.\-e]+ [\d.\-e]+)+$/i,key);let n=p.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);let pts=[];for(let i=0;i<n.length;i+=2)pts.push({x:n[i],y:n[i+1]});if(pts.length===2)straight++
 for(let i=1;i<pts.length;i++){let a=pts[i-1],b=pts[i];assert.ok(eng.clearSegment(a,b,origin,destination),`${key}: exact segment collision`);let steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.5));for(let j=0;j<=steps;j++){let x=a.x+(b.x-a.x)*j/steps,y=a.y+(b.y-a.y)*j/steps;assert.ok(x>=5&&x<=455&&y>=5&&y<=425,`${key} bounds`);for(const o of eng.obstacles){if(o.id===origin||o.id===destination)continue;let hit=o.type==='circle'?Math.hypot(x-o.x,y-o.y)<=o.r+2:x>=o.x-2&&x<=o.x+o.w+2&&y>=o.y-2&&y<=o.y+o.h+2;assert.ok(!hit,`${key} collides with ${o.id}`)}}}
 }
 for(let i=0;i<response.paths.length;i++)for(let j=0;j<i;j++)assert.notEqual(response.paths[i].d,response.paths[j].d,`${key}: duplicate`)
}
// Measure actual polyline intersections with the endpoint baseline.
function crossings(path,a,b){
 const n=path.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number), pts=[]
 for(let i=0;i<n.length;i+=2)pts.push({x:n[i],y:n[i+1]})
 const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy,side=p=>dx*(p.y-a.y)-dy*(p.x-a.x),hits=[]
 for(let i=1;i<pts.length;i++){const p=pts[i-1],q=pts[i],s=side(p),t=side(q);if((s<=0&&t>0)||(s>0&&t<=0)){const f=s/(s-t),x=p.x+(q.x-p.x)*f,y=p.y+(q.y-p.y)*f,u=((x-a.x)*dx+(y-a.y)*dy)/len2;if(u>.12&&u<.88)hits.push(u)}}
 return hits
}
for(const [origin,destination,minimum] of [['hermes','web',10],['web','skills',8]]){
 const a=eng.position(origin),b=eng.position(destination);assert.ok(eng.clearSegment(a,b,origin,destination));w.onmessage({data:{origin,destination}})
 const hits=response.paths.map(p=>crossings(p,a,b)),all=hits.flat()
 assert.ok(response.paths.length>=minimum,`${origin}→${destination}: too few candidates`)
 assert.ok(all.length>=4,`${origin}→${destination}: too few crossings`)
 assert.ok(Math.max(...all)-Math.min(...all)>.25,`${origin}→${destination}: crossing locations bundled: ${all}`)
 assert.ok(hits.some(x=>x.length>=2),`${origin}→${destination}: no multiple-crossing route`)
 assert.ok(hits.some(x=>!x.length),`${origin}→${destination}: no non-crossing route`)
 console.log(`${origin}→${destination}: ${response.paths.length} candidates, ${all.length} crossings, range ${Math.min(...all).toFixed(3)}–${Math.max(...all).toFixed(3)}, multi ${hits.filter(x=>x.length>=2).length}, none ${hits.filter(x=>!x.length).length}`)
}
// Unobstructed chords should have genuinely crossing, central alternatives.
let eligible=0,crossingPairs=0,centralPairs=0,diversePairs=0
for(const [origin] of eng.locations) for(const [destination] of eng.locations){
 if(origin===destination)continue
 const a=eng.position(origin),b=eng.position(destination),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)
 if(len<100||!eng.clearSegment(a,b,origin,destination))continue
 eligible++;w.onmessage({data:{origin,destination}})
 let crossing=false,central=false;const crossingShapes=[]
 for(const p of response.paths){
  const n=p.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number),pts=[]
  for(let i=0;i<n.length;i+=2)pts.push({x:n[i],y:n[i+1]})
  let sides=pts.map(q=>((q.x-a.x)*dy-(q.y-a.y)*dx)/len)
  if(Math.min(...sides)<-4&&Math.max(...sides)>4){crossing=true;crossingShapes.push(sides)}
  if(pts.some(q=>Math.hypot(q.x-(a.x+b.x)/2,q.y-(a.y+b.y)/2)<12))central=true
 }
 if(crossing)crossingPairs++;if(central)centralPairs++
 if(crossingShapes.some(x=>crossingShapes.some(y=>x.length===y.length&&x.some((v,i)=>Math.abs(v-y[i])>=8))))diversePairs++
}
console.log(`unobstructed ${eligible}, crossing ${crossingPairs}, central ${centralPairs}, geometrically diverse crossings ${diversePairs}`)
assert.ok(diversePairs>=eligible*.6,'crossing candidates must differ geometrically')
assert.ok(crossingPairs>=eligible*.8,'unobstructed routes need real baseline crossings')
assert.ok(centralPairs>=eligible*.8,'unobstructed routes need midpoint occupancy')
overlay.destroy();console.log(`PASS production worker ${pairs} directed pairs, ${total} candidates; minimum ${min}, straight ${straight}; sampled clearance 0.5 units; distinct path strings`)
