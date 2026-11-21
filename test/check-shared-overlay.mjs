import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const engine = readFileSync(new URL('../desktop/overlay-engine.js', import.meta.url), 'utf8')
const plugin = readFileSync(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
const debug = readFileSync(new URL('../debug/map-debug.html', import.meta.url), 'utf8')
assert.ok(plugin.includes('// BEGIN SHARED OVERLAY ENGINE\n' + engine + '// END SHARED OVERLAY ENGINE'))
assert.ok(debug.includes(engine))
console.log('PASS byte-identical shared overlay in plugin and playground')
