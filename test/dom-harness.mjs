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
const mod = await import(url(source.replace("from '@hermes/plugin-sdk'", `from '${url(sdk)}'`).replace("from 'react'", `from '${url("export const useRef=()=>({}); export const useLayoutEffect=()=>{}")}'`).replace("from 'react/jsx-runtime'", `from '${url(jsx)}'`)))
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

// Chronological links represent observed order, not dependency; pulse remains real Hermes traffic.
const a = { id: 'a', station: 'shell', from: 'core', startedAt: 20000, status: 'ok' }
const b = { id: 'b', station: 'memory', from: 'core', startedAt: 21000, status: 'ok' }
const host2 = document.createElement('div')
updateMap(host2, draw([a, b], 21000))
const root2 = host2.firstElementChild
root2.getCurrentTime = () => 1
const leg2 = root2.querySelector('[data-lm-key="leg-a-b"]')
assert.ok(leg2)
const path = leg2.getAttribute('d')
assert.match(path, /^M[\d. -]+(?: L[\d. -]+){2,}$/)
const points = path.match(/-?\d+(?:\.\d+)?/g).map(Number)
for (const [idx, p] of [[4, points.slice(0,2)], [2, points.slice(-2)]]) {
  const circle = root2.querySelector(`[data-lm-key="over-${idx}"] circle`)
  assert.ok(Math.hypot(p[0]-Number(circle.getAttribute('cx')), p[1]-Number(circle.getAttribute('cy'))) < 35)
}
assert.notEqual(path, root2.querySelector('[data-lm-key="flight-b"] animateMotion').getAttribute('path'))
assert.equal(leg2.querySelector('animate').getAttribute('dur'), '60.000s')
root2.getCurrentTime = () => 60.8
updateMap(host2, draw([a, b], 81800))
assert.equal(root2.querySelector('[data-lm-key="leg-a-b"]'), null)
const host3 = document.createElement('div')
updateMap(host3, draw([a, b], 21500, setupFrom({ motion: 'reduced' })))
assert.ok(host3.querySelector('[data-lm-key="leg-a-b"] animate[attributeName="opacity"]'))
assert.equal(host3.querySelector('animateMotion'), null)
console.log('PASS chronological trail, actual pulse, fade and reduced motion')

// Stable input order breaks simultaneous ties; all real stations participate.
const allStations = ['you', 'model', 'memory', 'files', 'shell', 'web', 'browser', 'agents', 'skills', 'hooks']
const simultaneous = allStations.map((station, i) => ({ id: `order${i}`, station, from: i === 7 ? 'agents' : 'core', startedAt: 30000, status: 'ok' }))
const chainHost = document.createElement('div')
updateMap(chainHost, draw(simultaneous, 30000))
for (let i = 1; i < simultaneous.length; i++) assert.ok(chainHost.querySelector(`[data-lm-key="leg-order${i-1}-order${i}"]`))
assert.equal(chainHost.querySelectorAll('[data-lm-key^="leg-"]').length, 9)
// Input may arrive out of order; timestamp order prevails.
const sortedHost = document.createElement('div')
updateMap(sortedHost, draw([b, a], 21000))
assert.ok(sortedHost.querySelector('[data-lm-key="leg-a-b"]'))
const c = { id: 'c', station: 'model', from: 'core', startedAt: 22000, status: 'ok' }
const fadeHost = document.createElement('div')
updateMap(fadeHost, draw([a, b, c], 22000))
assert.equal(fadeHost.querySelector('[data-lm-key="leg-a-b"] animate').getAttribute('begin'), '-0.200s')
assert.equal(fadeHost.querySelector('[data-lm-key="leg-b-c"] animate').getAttribute('begin'), '0.800s')
updateMap(fadeHost, draw([a, b, c], 81800))
assert.equal(fadeHost.querySelector('[data-lm-key="leg-a-b"]'), null)
assert.ok(fadeHost.querySelector('[data-lm-key="leg-b-c"]'))
console.log('PASS complete real-event chain, stable simultaneous ordering, timestamp sort and staggered fade')

// All islands use actual ongoing entries, oldest start, and remove both clocks
// upon completion. Inspect the mounted SVG rather than source text.
const stations = ['you', 'model', 'memory', 'files', 'shell', 'web', 'browser', 'agents', 'skills', 'hooks']
for (const [i, station] of stations.entries()) {
  const h = document.createElement('div')
  const running = { id: 'clock', station, from: 'core', startedAt: 10000, status: 'run', satellite: false }
  updateMap(h, draw([running], 85000))
  const group = h.querySelector(`[data-lm-key="under-${i}"]`)
  const minute = group.querySelector('[data-lm-key="clock-60000"] animate')
  const ten = group.querySelector('[data-lm-key="clock-600000"] animate')
  assert.equal(minute.getAttribute('begin'), '-15.000s', station)
  assert.equal(ten.getAttribute('begin'), '-75.000s', station)
  assert.equal(minute.getAttribute('repeatCount'), 'indefinite')
  assert.equal(ten.getAttribute('fill'), 'freeze')
  const late = document.createElement('div')
  updateMap(late, draw([running], 650000, setupFrom({ motion: 'reduced' })))
  assert.equal(late.querySelector('[data-lm-key="clock-60000"] animate').getAttribute('begin'), '-40.000s', station)
  assert.equal(late.querySelector('[data-lm-key="clock-600000"] animate').getAttribute('begin'), '-600.000s', station)
  h.firstElementChild.getCurrentTime = () => 1
  updateMap(h, draw([{ ...running, status: 'ok', endedAt: 86000 }], 86000))
  assert.equal(h.querySelector('[data-lm-key="clock-60000"]'), null, station)
  assert.equal(h.querySelector('[data-lm-key="clock-600000"]'), null, station)
}
console.log('PASS elapsed rings on every island and completion cleanup')

// Outbound and return geometry for both layouts must be jagged polylines,
// start near Hermes and end at the expected island, including Memory.
for (const layout of ['you-top', 'you-bottom']) {
  const opt = setupFrom({ motion: 'full', layout })
  for (const [i, station] of stations.entries()) {
    const h = document.createElement('div')
    const e = { id: `path-${station}`, station, from: 'core', startedAt: 10000, endedAt: 10200, status: 'ok' }
    updateMap(h, draw([e], 10250, opt))
    const outbound = h.querySelector(`[data-lm-key="flight-${e.id}"] animateMotion`).getAttribute('path')
    const back = h.querySelector(`[data-lm-key="return-${e.id}"] animateMotion`).getAttribute('path')
    assert.match(outbound, /^M[\d. -]+(?: L[\d. -]+){2,}$/)
    const points = outbound.match(/-?\d+(?:\.\d+)?/g).map(Number)
    const reversed = back.match(/-?\d+(?:\.\d+)?/g).map(Number)
    assert.ok(Math.hypot(points[0]-230, points[1]-212) < 60, station)
    const target = h.querySelector(`[data-lm-key="over-${i}"] circle`)
    assert.ok(Math.hypot(points.at(-2)-Number(target.getAttribute('cx')), points.at(-1)-Number(target.getAttribute('cy'))) < 35, station)
    assert.deepEqual(reversed.slice(0,2), points.slice(-2), station)
    assert.deepEqual(reversed.slice(-2), points.slice(0,2), station)
  }
}
console.log('PASS jagged Hermes-to-island routes and reverse returns in both layouts')

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
