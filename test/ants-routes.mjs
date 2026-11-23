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
let count=0, varied=0, distinct=0, totalRatio=0, maxRatio=0, following=0, transitions=0;
const parse=d=>{const a=d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);return Array.from({length:a.length/2},(_,i)=>({x:a[2*i],y:a[2*i+1]}))};
const length=p=>p.slice(1).reduce((s,q,i)=>s+Math.hypot(q.x-p[i].x,q.y-p[i].y),0);
const distance=(a,b)=>Math.max(...a.map(p=>Math.min(...b.map(q=>Math.hypot(p.x-q.x,p.y-q.y)))));
for(const [origin] of eng.locations)for(const [destination] of eng.locations){if(origin===destination)continue;
 const key='ants|'+origin+'→'+destination;let paths=[];
 for(let i=0;i<4;i++){w.onmessage({data:{key,requestId:i,origin,destination,variant:'ants'}});assert.ok(!response.error,`${key}: ${response.error}`);assert.equal(response.paths.length,1,`${key}: no path`);const p=response.paths[0];assert.equal(p.lane,'ants'+i);paths.push(p.d);
 const nums=p.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number),pts=[];for(let j=0;j<nums.length;j+=2)pts.push({x:nums[j],y:nums[j+1]});for(let j=1;j<pts.length;j++)assert.ok(eng.clearSegment(pts[j-1],pts[j],origin,destination),`${key}: collision`);
 }if(new Set(paths).size>1)varied++;
 const ps=paths.map(parse), unique=[];for(const p of ps)if(unique.every(q=>Math.max(distance(p,q),distance(q,p))>=5))unique.push(p);
 if(unique.length>=2)distinct++;
 const baseline=length(ps[0]);for(const p of ps){const ratio=length(p)/baseline;totalRatio+=ratio;maxRatio=Math.max(maxRatio,ratio);assert.ok(ratio<1.5,`${key}: excessive relative length ${ratio}`)}
 for(let i=1;i<ps.length;i++){transitions++;if(distance(ps[i],ps[i-1])<35)following++}count++;
}
assert.ok(varied>90,`insufficient variation: ${varied}`);
assert.ok(distinct>50,`insufficient visible variation: ${distinct}`);
assert.ok(following/transitions>.9,`insufficient trail following: ${following}/${transitions}`);
console.log(`metrics: ${distinct}/${count} pairs visibly distinct (>=5px), length vs first mean ${(totalRatio/(count*4)).toFixed(3)}, max ${maxRatio.toFixed(3)}, following ${following}/${transitions}`);
// Directed-pair state is independent, even after interleaving other pairs.
w.onmessage({data:{key:'ants|you→web',requestId:10,origin:'you',destination:'web',variant:'ants'}});assert.equal(response.paths[0].lane,'ants4');
w.onmessage({data:{key:'ants|web→you',requestId:11,origin:'web',destination:'you',variant:'ants'}});assert.equal(response.paths[0].lane,'ants4');
overlay.destroy();console.log(`PASS ants ${count} directed pairs, 4 consecutive paths each, ${varied} vary`);
