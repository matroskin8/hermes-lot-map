import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
class Element { constructor(){this.style={};this.dataset={};this.children=[]} setAttribute(){} append(...x){this.children.push(...x)} insertBefore(x){this.append(x)} querySelector(){return null} remove(){} }
const workers=[],timers=new Map();let timerId=0,failConstructor=true,failPost=false
class Worker { constructor(){if(failConstructor){failConstructor=false;throw Error('blocked')}workers.push(this);this.messages=[]} postMessage(m){if(failPost){failPost=false;throw Error('post failed')}this.messages.push(m)} terminate(){this.terminated=true} }
const sandbox={document:{createElementNS:()=>new Element()},Blob,URL:{createObjectURL:()=>'',revokeObjectURL(){}},Worker,setTimeout:f=>{timers.set(++timerId,f);return timerId},clearTimeout:id=>timers.delete(id),requestAnimationFrame:()=>1,cancelAnimationFrame(){}}
vm.createContext(sandbox);vm.runInContext((readFileSync(new URL('../desktop/route-generator.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../desktop/overlay-engine.js',import.meta.url),'utf8'))+';globalThis.engine=LotMapOverlay',sandbox)
const errors=[],engine=sandbox.engine.create(new Element(),e=>{if(e)errors.push(e.message)}),flush=()=>new Promise(r=>setImmediate(r)), launch=(id,destination='web')=>engine.launch({id,origin:'hermes',destination,startedAt:1})
launch('a');await flush();assert.equal(errors.length,1);assert.equal(engine.seen.has('a'),false)
launch('a');const w=workers.at(-1),first=w.messages.at(-1);assert.ok(first.requestId);const [expired,fire]=[...timers.entries()][0];timers.delete(expired);fire();await flush();assert.equal(engine.seen.has('a'),false)
launch('a');const second=w.messages.at(-1);assert.notEqual(first.requestId,second.requestId)
w.onmessage({data:{...first,paths:[{d:'M0 0 L1 1',lane:0}]}});await flush();assert.equal(engine.active.get('a').pending,true)
w.onmessage({data:{...second,paths:[{d:'M0 0 L1 1',lane:0}]}});await flush();assert.equal(engine.active.get('a').pending,false)
launch('b','files');w.onerror();await flush();assert.equal(w.terminated,true);assert.equal(engine.seen.has('b'),false)
launch('b','files');const w2=workers.at(-1);assert.notEqual(w,w2);w2.onmessage({data:{...w2.messages.at(-1),error:'no route'}});await flush();assert.equal(engine.seen.has('b'),false)
failPost=true;launch('c','shell');await flush();assert.equal(w2.terminated,true);assert.equal(engine.seen.has('c'),false)
launch('c','shell');assert.notEqual(workers.at(-1),w2);engine.destroy();await flush();assert.equal(timers.size,0)
console.log('PASS worker construction, timeout stale response, crash, error response, post failure, retry and disposal')
