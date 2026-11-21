// DOM identity regression. Set JSDOM_PATH to an existing jsdom installation.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom')
const source = readFileSync(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const sdk = `export const host = {}; export const atom = x => ({get:()=>x,set:v=>x=v}); export const useValue = x => x.get()`
const jsx = `export const jsx=(t,p)=>({t,p}); export const jsxs=jsx`
const mod = await import(url(source.replace("from '@hermes/plugin-sdk'", `from '${url(sdk)}'`).replace("from 'react'", `from '${url("export const useState=v=>[v,()=>{}]; export const useRef=()=>({}); export const useLayoutEffect=()=>{}")}'`).replace("from 'react/jsx-runtime'", `from '${url(jsx)}'`)))
const { updateMap, drawMap, setupFrom } = mod.__test
const document = new JSDOM('<!doctype html><div id="host"></div>').window.document
const host = document.querySelector('#host')
const setup = setupFrom({ coreName: 'HERMES', motion: 'full' })
const one = { id: 'one', station: 'shell', from: 'core', startedAt: 10000, status: 'run' }
const two = { id: 'two', station: 'shell', from: 'core', startedAt: 10250, status: 'run' }
const board = entries => ({ entries, counts: { shell: entries.length }, faults: {} })
const draw = (entries, now, options = setup) => drawMap(board(entries), now, options)
// Empty history must never invent rays, including static/reduced-motion rendering.
for(const motion of ['full','reduced']) for(const overlayFlights of [false,true]) {
 const markup=drawMap({...board([]),overlayFlights},10000,setupFrom({coreName:'HERMES',motion}))
 const probe=document.createElement('div');probe.innerHTML=markup
 assert.equal(probe.querySelectorAll('[data-lm-key^="beam-"], [data-lm-key^="flight-"], [data-lm-key^="return-"]').length,0,`${motion}/${overlayFlights}: empty rays`)
}
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

// Independent observed events must never invent station-to-station chronology.
const independent = [
  { id: 'web-files', station: 'files', from: 'core', startedAt: 20000, status: 'ok' },
  { id: 'web-agents', station: 'agents', from: 'core', startedAt: 21000, status: 'ok' },
]
for (const motion of ['full', 'reduced']) {
  const h = document.createElement('div')
  updateMap(h, draw(independent, 21000, setupFrom({ motion })))
  assert.equal(h.querySelector('[data-lm-key="trail"]'), null)
  assert.equal(h.querySelectorAll('[data-lm-key^="leg-"]').length, 0)
}
console.log('PASS independent events produce no chronological station links')

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
  assert.ok(Math.abs(Number(late.querySelector('[data-lm-key="clock-60000"]').getAttribute('stroke-dashoffset')) - 1/3) < 1e-9, station)
  assert.equal(late.querySelector('[data-lm-key="clock-600000"]').getAttribute('stroke-dashoffset'), '0', station)
  assert.equal(late.querySelector('animate, animateTransform, animateMotion'), null, station)
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
