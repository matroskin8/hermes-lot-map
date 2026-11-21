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
