// DOM identity regression. Set JSDOM_PATH to an existing jsdom installation.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom')
const source = readFileSync(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const sdk = `export const atom = x => ({get:()=>x,set:v=>x=v}); export const useValue = x => x.get()`
const jsx = `export const jsx=(t,p)=>({t,p}); export const jsxs=jsx`
const mod = await import(url(source.replace("from '@hermes/plugin-sdk'", `from '${url(sdk)}'`).replace("from 'react/jsx-runtime'", `from '${url(jsx)}'`)))
const { updateMap, drawMap, setupFrom } = mod.__test
const document = new JSDOM('<!doctype html><div id="host"></div>').window.document
const host = document.querySelector('#host')
const setup = setupFrom({ coreName: 'HERMES', motion: 'full' })
const one = { id: 'one', station: 'shell', from: 'core', startedAt: 10000, status: 'run' }
const two = { id: 'two', station: 'shell', from: 'core', startedAt: 10250, status: 'run' }
const board = entries => ({ entries, counts: { shell: entries.length }, faults: {} })
const draw = (entries, now, options = setup) => drawMap(board(entries), now, options)
updateMap(host, draw([one], 10000))
const svg = host.firstElementChild
svg.getCurrentTime = () => 0.25
const first = svg.querySelector('[data-lm-key="flight-one"]')
const firstMotion = first.querySelector('animateMotion')
const firstPath = firstMotion.getAttribute('path')
const firstBegin = firstMotion.getAttribute('begin')
updateMap(host, draw([one, two], 10250))
assert.equal(host.firstElementChild, svg)
assert.equal(svg.querySelector('[data-lm-key="flight-one"]'), first)
assert.equal(first.querySelector('animateMotion'), firstMotion)
assert.equal(firstMotion.getAttribute('path'), firstPath)
assert.equal(firstMotion.getAttribute('begin'), firstBegin)
const secondMotion = svg.querySelector('[data-lm-key="flight-two"] animateMotion')
assert.notEqual(secondMotion.getAttribute('path'), firstPath)
assert.ok(Math.abs(Number.parseFloat(secondMotion.getAttribute('begin')) - .34) < 1e-9)
assert.equal(secondMotion.getAttribute('dur'), '0.800s')
console.log('PASS SVG and first pulse/animation identity, phase and path survive same-route start; second lane and 800ms timing')
svg.getCurrentTime = () => 1.3
updateMap(host, draw([one, two], 11300))
assert.equal(host.firstElementChild, svg)
assert.equal(svg.querySelector('[data-lm-key="flight-one"]'), null)
assert.ok(svg.querySelector('[data-lm-key="flight-two"]'))
assert.equal(svg.querySelector('[data-lm-key="flight-two"] animateMotion'), secondMotion)
console.log('PASS expired pulse removed without interrupting other pulse')
const completed = { ...two, status: 'ok', endedAt: 11300 }
svg.getCurrentTime = () => 1.4
updateMap(host, draw([one, completed], 11400))
assert.ok(svg.querySelector('[data-lm-key="return-two"] animateMotion'))
assert.equal(svg.querySelector('[data-lm-key="return-two"] animateMotion').getAttribute('dur'), '0.800s')
console.log('PASS completion creates 800ms return')
updateMap(host, draw([one, completed], 11400, setupFrom({ coreName: 'HERMES', motion: 'reduced' })))
assert.equal(host.firstElementChild, svg)
assert.equal(svg.querySelector('[data-lm-key="flight-two"]'), null)
assert.equal(svg.querySelector('[data-lm-key="return-two"]'), null)
assert.equal(svg.querySelector('animateMotion'), null)
console.log('PASS reduced motion removes flights and returns while keeping SVG')

// Each destination pulse owns its leg's arrival and 60-second fade, even as
// newer destinations are added or an older leg expires on a later redraw.
const a = { id: 'a', station: 'shell', from: 'core', startedAt: 20000, status: 'ok' }
const b = { id: 'b', station: 'files', from: 'core', startedAt: 21000, status: 'ok' }
const c = { id: 'c', station: 'web', from: 'core', startedAt: 22000, status: 'ok' }
const d = { id: 'd', station: 'web', from: 'core', startedAt: 22500, status: 'ok' }
const host2 = document.createElement('div')
updateMap(host2, draw([a, b], 21000))
const root2 = host2.firstElementChild
root2.getCurrentTime = () => 1
const leg1 = root2.querySelector('[data-lm-key="leg-shell-20000-files-21000"]')
const fade1 = leg1.querySelector('animate[attributeName="opacity"]')
const tip = root2.querySelector('[data-lm-key="tip-shell-20000-files-21000"] animate[values=".85;0"]')
assert.equal(fade1.getAttribute('begin'), '0.800s')
assert.equal(fade1.getAttribute('dur'), '60.000s')
assert.equal(tip.getAttribute('begin'), '0.800s')
assert.equal(tip.getAttribute('dur'), '60.000s')
updateMap(host2, draw([a, b, c], 22000))
assert.equal(root2.querySelector('[data-lm-key="leg-shell-20000-files-21000"]'), leg1)
assert.equal(leg1.querySelector('animate[attributeName="opacity"]'), fade1)
assert.equal(fade1.getAttribute('begin'), '0.800s')
const leg2 = root2.querySelector('[data-lm-key="leg-files-21000-web-22000"]')
const fade2 = leg2.querySelector('animate[attributeName="opacity"]')
assert.equal(Number.parseFloat(fade2.getAttribute('begin')), 1.8)
assert.equal(fade2.getAttribute('dur'), '60.000s')
root2.getCurrentTime = () => 1.5
updateMap(host2, draw([a, b, c, d], 22500))
assert.equal(root2.querySelector('[data-lm-key="leg-files-21000-web-22000"]'), leg2)
assert.equal(fade2.getAttribute('begin'), '1.8s')
root2.getCurrentTime = () => 60.799
updateMap(host2, draw([a, b, c, d], 81799))
assert.ok(root2.contains(leg1))
root2.getCurrentTime = () => 60.8
updateMap(host2, draw([a, b, c, d], 81800))
assert.ok(!root2.contains(leg1))
assert.equal(root2.querySelector('[data-lm-key="leg-files-21000-web-22000"]'), leg2)
assert.equal(fade2.getAttribute('begin'), '1.8s')
root2.getCurrentTime = () => 61.8
updateMap(host2, draw([a, b, c, d], 82800))
assert.ok(!root2.contains(leg2))
console.log('PASS independently timed 60s trail/tip fades, stable reconciliation, deduplication and exact expiry')
const host3 = document.createElement('div')
updateMap(host3, draw([a, b], 21500, setupFrom({ coreName: 'HERMES', motion: 'reduced' })))
const stillLeg = host3.querySelector('[data-lm-key="leg-shell-20000-files-21000"]')
assert.equal(stillLeg.querySelector('animate[attributeName="opacity"]').getAttribute('begin'), '0.300s')
assert.equal(stillLeg.querySelector('animate[attributeName="opacity"]').getAttribute('dur'), '60.000s')
assert.equal(stillLeg.querySelector('animate[attributeName="stroke-dashoffset"]'), null)
assert.equal(host3.querySelector('animateMotion'), null)
assert.equal(host3.querySelector('[data-lm-key^="tip-"]').getAttribute('opacity'), '.85')
console.log('PASS reduced motion uses static trail and tip with arrival-timed fade, no flying or drawing')

// Active calls, not historical or synthetic entries, own stable satellites.
const satHost = document.createElement('div')
const sats = () => [...satHost.querySelectorAll('[data-lm-key^="satellite-"]')]
const satDraw = (entries, now, opt = setup) => updateMap(satHost, draw(entries, now, opt))
for (const station of ['you', 'model', 'memory', 'files', 'shell', 'web', 'browser', 'agents', 'skills', 'hooks']) {
  satDraw([{ ...one, station }], 10000)
  assert.equal(sats().length, 1, station)
  assert.equal(sats()[0].getAttribute('data-lm-key'), 'satellite-one')
}
satDraw([one], 10000)
const sat = sats()[0], spin = sat.querySelector('animateTransform')
const phase = spin.getAttribute('begin')
satHost.firstElementChild.getCurrentTime = () => .25
satDraw([one, two], 10250)
assert.equal(sats().length, 2)
assert.equal(sats()[0], sat)
assert.equal(sat.querySelector('animateTransform'), spin)
assert.equal(spin.getAttribute('begin'), phase)
satDraw([{ ...one, status: 'ok', endedAt: 10300 }, two], 10300)
assert.deepEqual(sats().map(n => n.getAttribute('data-lm-key')), ['satellite-two'])
satDraw([{ ...one, status: 'ok' }, { ...two, status: 'ok' }], 10400)
assert.equal(sats().length, 0)
satDraw([{ ...one, station: 'agents' }, { ...two, station: 'agents', satellite: false }], 10000)
assert.equal(sats().length, 1, 'subagent observation is not a second call')
const weird = { ...one, id: 'a\"<&', station: 'memory' }
satDraw([weird, two], 10000, setupFrom({ motion: 'reduced' }))
assert.deepEqual(sats().map(n => n.getAttribute('data-lm-key')), ['satellite-a"<&', 'satellite-two'])
assert.equal(satHost.querySelector('[data-lm-key^="satellite-"] animateTransform'), null)
const many = Array.from({ length: 8 }, (_, i) => ({ ...one, id: `cap-${i}` }))
satDraw(many, 10000)
assert.equal(sats().length, 6)
assert.ok(satHost.textContent.includes('×8'))
console.log('PASS station satellites, lifecycles, IDs, stability, subagent exclusion, reduced motion and cap')
