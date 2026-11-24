import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
const source=readFileSync(new URL('../desktop/route-generator.js',import.meta.url),'utf8')
const generator=vm.runInNewContext(source+'\nLotMapRouteGenerator')
function worker(){let result;const ctx={onmessage:null,postMessage:m=>result=m};vm.createContext(ctx);vm.runInContext(generator.workerSource,ctx);return variant=>{ctx.onmessage({data:{key:variant+'|hermes→web',requestId:1,origin:'hermes',destination:'web',variant}});assert.ok(!result.error,result.error);assert.ok(result.paths.length,variant);return JSON.parse(JSON.stringify(result.paths))}}
const a=worker(),fresh=worker()
const first=a('ants');assert.equal(first[0].lane,'ants0')
for(const style of ['production','lightning','moths','lizards','streams','swarm']) assert.deepEqual(a(style),fresh(style),`${style} changed by ants state`)
assert.equal(a('ants')[0].lane,'ants1','other styles must not reset or advance ant trail')
assert.deepEqual(worker()('ants'),first,'new worker resets ant state')
console.log('PASS worker state isolation across styles and fresh-worker reset')
