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
let count=0,missing=[];
for(const [origin] of eng.locations)for(const [destination] of eng.locations){if(origin===destination)continue;const key=origin+'→'+destination;w.onmessage({data:{key,requestId:1,origin,destination,variant:'streams'}});if(response.error||response.paths.length<2){missing.push(key+': '+(response.error||response.paths.length));continue}count++;const paths=response.paths;for(const p of paths){assert.match(p.d,/^M[\d.\-e]+ [\d.\-e]+(?: L[\d.\-e]+ [\d.\-e]+)+$/i);const nums=p.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number),pts=[];for(let i=0;i<nums.length;i+=2)pts.push({x:nums[i],y:nums[i+1]});for(let i=1;i<pts.length;i++)assert.ok(eng.clearSegment(pts[i-1],pts[i],origin,destination),key+' collision');assert.ok(p.lane.startsWith('streams'));}for(const p of paths){const a=p.samples.at(-1),b=paths[0].samples.at(-1);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-6,key+' separate destinations')} }
overlay.destroy();console.log('streams pairs:',count,'missing:',missing);assert.deepEqual(missing,[]);
