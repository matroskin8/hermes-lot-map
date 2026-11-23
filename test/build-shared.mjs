// Rebuild the self-contained Desktop plugin and playground from shared sources.
import { readFileSync, writeFileSync } from 'node:fs'
const root = new URL('../', import.meta.url)
const targets = ['desktop/plugin.js', 'debug/map-debug.html']
const blocks = [['MAP RENDERER','desktop/map-renderer.js'], ['MAP RECONCILE','desktop/map-reconcile.js'], ['ROUTE GENERATOR','desktop/route-generator.js'], ['OVERLAY ENGINE','desktop/overlay-engine.js']]
let dirty = false
for (const target of targets) {
  const path = new URL(target, root)
  const original = readFileSync(path, 'utf8')
  let text = original
  for (const [name, source] of blocks) {
    const start = `// BEGIN SHARED ${name}\n`, end = `// END SHARED ${name}`
    const content = readFileSync(new URL(source, root), 'utf8')
    const a = text.indexOf(start), b = text.indexOf(end, a + start.length)
    if (a < 0 || b < 0 || text.indexOf(start, a + start.length) !== -1) throw Error(`${target}: missing or duplicate ${name} markers`)
    text = text.slice(0, a + start.length) + content + text.slice(b)
  }
  if (text !== original) {
    dirty = true
    if (!process.argv.includes('--check')) writeFileSync(path, text)
    console.log(`${target}: ${process.argv.includes('--check') ? 'out of date' : 'rebuilt'}`)
  }
}
if (dirty && process.argv.includes('--check')) process.exitCode = 1
if (!dirty) console.log('Shared artifacts are up to date')
