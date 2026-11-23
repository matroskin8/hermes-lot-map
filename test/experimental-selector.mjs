import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {JSDOM} from 'jsdom'
let workers=[]
const dom=new JSDOM(readFileSync(new URL('../debug/map-debug.html',import.meta.url),'utf8'),{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){w.requestAnimationFrame=()=>1;w.cancelAnimationFrame=()=>{};w.URL.createObjectURL=()=>'';w.URL.revokeObjectURL=()=>{};w.Worker=class{constructor(){this.messages=[];workers.push(this)} postMessage(m){this.messages.push(m)} terminate(){this.terminated=true}}}})
const d=dom.window.document, Event=dom.window.Event,variant=d.querySelector('#variant'),from=d.querySelector('#from'),to=d.querySelector('#to'),send=d.querySelector('#send')
assert.deepEqual([...variant.options].map(o=>o.value).sort(),['production','ants','lightning','lizards','moths','streams','swarm'].sort())
assert.equal(variant.value,'production')
assert.ok([...variant.options].some(o=>o.value==='lizards' && o.textContent.includes('Ящерицы')))
variant.value='lizards';variant.dispatchEvent(new Event('change'))
from.value='hermes';to.value='web';to.dispatchEvent(new Event('change'));send.click();send.click()
const worker=workers.at(-1);assert.equal(worker.messages.length,1);assert.equal(worker.messages[0].variant,'lizards')
variant.value='lightning';variant.dispatchEvent(new Event('change'));assert.ok(!worker.terminated);assert.equal(from.value,'hermes');assert.equal(to.value,'web');send.click();assert.equal(worker.messages.length,2);assert.equal(worker.messages[1].variant,'lightning');assert.notEqual(worker.messages[0].key,worker.messages[1].key)
worker.onmessage({data:{...worker.messages[1],paths:[{d:'M1 1 L2 2',lane:1}]}});worker.onmessage({data:{...worker.messages[0],paths:[{d:'M3 3 L4 4',lane:0}]}});await new Promise(r=>setTimeout(r,0));assert.equal(d.querySelectorAll('.flight').length,3,'both pending variants survive out-of-order replies')
variant.value='lizards';variant.dispatchEvent(new Event('change'));send.click();await new Promise(r=>setTimeout(r,0));assert.equal(worker.messages.length,2,'strategy cache reused');assert.equal(d.querySelectorAll('.flight').length,4)
d.querySelector('#reset').click()
assert.equal(from.value,'hermes');assert.equal(to.value,'web');assert.equal(variant.value,'lizards')
assert.equal(d.querySelectorAll('.flight').length,0);assert.equal(d.querySelectorAll('.selection circle').length,2)
assert.equal(send.disabled,false);assert.ok(worker.terminated)
send.click();const newWorker=workers.at(-1);assert.notEqual(newWorker,worker)
assert.equal(newWorker.messages.length,1);assert.equal(newWorker.messages[0].variant,'lizards')
newWorker.onmessage({data:{...newWorker.messages[0],paths:[{d:'M1 1 L2 2',lane:1}]}})
await new Promise(r=>setTimeout(r,0));assert.equal(d.querySelectorAll('.flight').length,1)
dom.window.close();console.log('PASS nondestructive variant switching, separate caches and out-of-order replies')
