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
let pairs=0,min=99
for(const [origin] of eng.locations) for(const [destination] of eng.locations){if(origin===destination)continue
 w.onmessage({data:{key:origin+'→'+destination,requestId:1,origin,destination,variant:'swarm'}})
 assert.ok(!response.error,response.error);assert.ok(response.paths.length,`${origin}→${destination} missing`);min=Math.min(min,response.paths.length);pairs++
 for(const path of response.paths){const n=path.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number),pts=[];for(let i=0;i<n.length;i+=2)pts.push({x:n[i],y:n[i+1]});for(let i=1;i<pts.length;i++)assert.ok(eng.clearSegment(pts[i-1],pts[i],origin,destination),`${origin}→${destination} collision`)}
}
w.onmessage({data:{key:'hermes→web',requestId:2,origin:'hermes',destination:'web',variant:'swarm'}})
assert.ok(response.paths.length>=3);const waves=response.paths.slice(1,3).map(p=>p.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number));assert.notDeepEqual(waves[0],waves[1]);
// Opposite waves share endpoints and switch sides midway.
let signs=[];const x=waves[0],y=waves[1];for(let i=2;i<x.length-4;i+=2){const dx=x[i+2]-x[i],dy=x[i+3]-x[i+1];const cross=dx*(x[i+1]-y[i+1])-dy*(x[i]-y[i]);if(Math.abs(cross)>1e-5)signs.push(Math.sign(cross))}
assert.equal(x[0],y[0]);assert.equal(x[1],y[1]);assert.ok(signs.includes(1)&&signs.includes(-1),'waves must cross')

overlay.destroy();console.log(`PASS swarm ${pairs} directed pairs, minimum ${min} paths`)
