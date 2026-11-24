import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {JSDOM} from 'jsdom'
let worker, draws=[]
const dom=new JSDOM(readFileSync(new URL('../debug/map-debug.html',import.meta.url),'utf8'),{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  w.requestAnimationFrame=()=>1;w.cancelAnimationFrame=()=>{};w.URL.createObjectURL=()=>'';w.URL.revokeObjectURL=()=>{}
  w.Math.random=()=>{assert.ok(draws.length,'unexpected random draw');return draws.shift()}
  w.Worker=class{constructor(){worker=this;this.messages=[]}postMessage(m){this.messages.push(m)}terminate(){}}
}})
const d=dom.window.document
const overlay=dom.window.eval('LotMapOverlay').create(d.querySelector('svg'))
let id=0;const send=()=>overlay.launch({id:String(id++),origin:'hermes',destination:'web'})
send();send();assert.equal(worker.messages.length,1,'pending calls share a worker calculation')
const source=readFileSync(new URL('../desktop/route-generator.js',import.meta.url),'utf8')
const generator=vm.runInNewContext(source+'\nLotMapRouteGenerator');let response
const sandbox={onmessage:null,postMessage:m=>response=m};vm.createContext(sandbox);vm.runInContext(generator.workerSource,sandbox)
sandbox.onmessage({data:worker.messages[0]});assert.ok(response.paths.length>2)
const paths=response.paths, n=paths.length
draws.push(0,0);worker.onmessage({data:response});await new Promise(r=>setTimeout(r,0))
let flights=[...d.querySelectorAll('.flight')];assert.equal(flights.length,2)
const route=f=>f.querySelector('path').getAttribute('d')
assert.equal(route(flights[0]),paths[0].d);assert.equal(route(flights[1]),paths[0].d)
assert.equal(flights[0].dataset.reused,'false');assert.equal(flights[1].dataset.reused,'true')
for(let i=0;i<n;i++){draws.push((i+.5)/n);send()}
await new Promise(r=>setTimeout(r,0));flights=[...d.querySelectorAll('.flight')]
assert.equal(worker.messages.length,1,'cached calls do not recompute')
assert.equal(flights.length,n+2)
for(let i=0;i<n;i++)assert.equal(route(flights[i+2]),paths[i].d,`candidate ${i} reachable unchanged`)
assert.ok(new Set(flights.map(route)).size>1,'different candidates selected')
assert.equal(draws.length,0,'one independent draw per flight')
dom.window.close();console.log(`PASS cached random selection: ${n} real worker candidates reachable, concurrent independent draws, duplicates allowed, no recompute`)
