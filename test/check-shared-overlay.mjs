import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
for (const [name,path] of [['ROUTE GENERATOR','route-generator.js'],['OVERLAY ENGINE','overlay-engine.js']]) {
  const source=readFileSync(new URL('../desktop/'+path,import.meta.url),'utf8')
  for (const target of ['../desktop/plugin.js','../debug/map-debug.html']) {
    const artifact=readFileSync(new URL(target,import.meta.url),'utf8')
    const start=`// BEGIN SHARED ${name}\n`,end=`// END SHARED ${name}`
    const a=artifact.indexOf(start),b=artifact.indexOf(end,a+start.length)
    assert.ok(a>=0 && b>=0,`${target}: missing ${name}`)
    assert.equal(artifact.slice(a+start.length,b),source,`${target}: ${name} differs`)
    assert.equal(artifact.indexOf(start,a+start.length),-1,`${target}: duplicate ${name}`)
  }
}
console.log('PASS byte-identical route generator and overlay in plugin and playground')
