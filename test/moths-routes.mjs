import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
let source
class E {constructor(){this.style={};this.dataset={}} setAttribute(){} insertBefore(){} querySelector(){return null} remove(){}}
const ctx={document:{createElementNS:()=>new E()},Blob:class{constructor(parts){source=parts.join('')}},URL:{createObjectURL:()=>'',revokeObjectURL(){}},Worker:class{postMessage(){} terminate(){}},setTimeout,clearTimeout,requestAnimationFrame:()=>1,cancelAnimationFrame(){},console}
vm.createContext(ctx);vm.runInContext((readFileSync(new URL('../desktop/route-generator.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../desktop/overlay-engine.js',import.meta.url),'utf8')).replace('return {create,stations,locations,position,obstacles};','return {create,stations,locations,position,obstacles,clearSegment};')+';globalThis.engine=LotMapOverlay',ctx)
const eng=ctx.engine,overlay=eng.create(new E(),()=>{},{variant:'moths'});overlay.launch({id:'capture',origin:'hermes',destination:'web'});assert.ok(source)
let response;const worker={onmessage:null,postMessage:x=>response=x};vm.createContext(worker);vm.runInContext(source,worker)
let count=0,empty=0
for(const [origin] of eng.locations)for(const [destination] of eng.locations){if(origin===destination)continue
 worker.onmessage({data:{key:origin+'→'+destination,requestId:1,origin,destination,variant:'moths'}});assert.ok(!response.error,response.error);if(!response.paths.length){empty++;continue}
 for(const path of response.paths){count++;assert.match(path.lane,/^moths/);assert.match(path.d,/^M[\d.\-e]+ [\d.\-e]+(?: L[\d.\-e]+ [\d.\-e]+)+$/i)
 const n=path.d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number),pts=[];for(let i=0;i<n.length;i+=2)pts.push({x:n[i],y:n[i+1]});assert.ok(pts.length>=50)
 for(let i=1;i<pts.length;i++)assert.ok(eng.clearSegment(pts[i-1],pts[i],origin,destination),`${origin}→${destination} collision`)
 // The loop has tightly sampled continuous turns including a reversal, not just a bent line.
 let smoothTurns=0;for(let i=1;i<pts.length-1;i++){const a=pts[i-1],b=pts[i],c=pts[i+1],ux=b.x-a.x,uy=b.y-a.y,vx=c.x-b.x,vy=c.y-b.y;if(Math.hypot(ux,uy)<4&&Math.hypot(vx,vy)<4&&Math.abs(Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy))>.02)smoothTurns++}assert.ok(smoothTurns>20)
 }
}
assert.ok(count>0);assert.equal(empty,0,`${empty} pairs have no safe moth route`)
// A completely blocked canvas must not fall back to another style.
vm.runInContext('obstacles.push({id:"wall",type:"rect",x:0,y:0,w:460,h:430})',worker)
worker.onmessage({data:{key:'blocked',requestId:2,origin:'hermes',destination:'web',variant:'moths'}});assert.equal(response.paths.length,0)
overlay.destroy();console.log(`PASS moths: ${count} safe flattened-loop candidates, 110 directed pairs; blocked canvas returns none`)
