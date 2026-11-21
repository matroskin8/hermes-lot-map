// Real React + jsdom lifecycle regression. HERMES_DESKTOP_DIR supplies dependencies.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const root = process.env.HERMES_DESKTOP_DIR
if (!root) throw Error('Set HERMES_DESKTOP_DIR to a dependency root')
const require = createRequire(root + '/package.json')
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><div id="app"></div>', { pretendToBeVisual: true })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window)
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window)
globalThis.Worker = class { postMessage({key}) { queueMicrotask(() => this.onmessage({data:{key,paths:[{d:'M230 169 L300 320',lane:55},{d:'M220 170 L310 320',lane:-55}]}})) } terminate() {} }
globalThis.URL.createObjectURL = () => 'blob:stub'
dom.window.SVGElement.prototype.getTotalLength = () => 100
dom.window.SVGElement.prototype.getPointAtLength = n => ({x:n,y:n})
let time = 100000
Date.now = () => time
const React = await import(pathToFileURL(root + '/node_modules/react/index.js'))
const { createRoot } = await import(pathToFileURL(root + '/node_modules/react-dom/client.js'))
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const sdk = `import { atom } from ${JSON.stringify(pathToFileURL(root + '/node_modules/nanostores/index.js').href)}; import React from ${JSON.stringify(pathToFileURL(root + '/node_modules/react/index.js').href)}; export {atom}; export function useValue(a){ return React.useSyncExternalStore(a.subscribe,a.get,a.get) }`
const source = readFileSync(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
const mod = await import(url(source.replace("from '@hermes/plugin-sdk'", `from '${url(sdk)}'`).replace("from 'react'", `from '${pathToFileURL(root + '/node_modules/react/index.js').href}'`).replace("from 'react/jsx-runtime'", `from '${pathToFileURL(root + '/node_modules/react/jsx-runtime.js').href}'`)))
const listeners = {}, contributions = []
let tick
mod.default.register({ register: c => contributions.push(c), onEvent: (t,f) => { (listeners[t] ||= []).push(f) }, setInterval: f => { tick = f }, storage: { get: (k,v) => v, set() {} }, registerSettingsPage() {} })
const fire = (type, payload = {}, route = {}) => listeners[type]?.forEach(f => f({ type, payload, session_id: 'a', connectionId: 'host', ...route }))
const app = createRoot(document.querySelector('#app'))
await React.act(() => app.render(contributions.find(c => c.area === 'panes').render()))
await React.act(() => fire('message.delta', {text:'secret-stream'}))
let entry = mod.__test.board.get().entries.find(e => e.kind === 'model')
const svg = document.querySelector('svg')
assert.ok(svg.querySelector('[data-lm-overlay]'))
const rings = svg.querySelector('[data-lm-key="under-1"] [data-lm-key="clock-60000"]')
assert.ok(rings)
time += 300
await React.act(() => { fire('message.delta', {text:'secret-more'}); tick() })
assert.equal(svg.querySelector('[data-lm-key="under-1"] [data-lm-key="clock-60000"]'), rings)
assert.equal(mod.__test.board.get().entries.filter(e => e.kind === 'model').length, 1)
time += 100
await React.act(() => {fire('tool.start', {tool_id:'one',name:'terminal'});fire('tool.start', {tool_id:'one',name:'terminal'})})
assert.equal(mod.__test.board.get().entries.filter(e => e.toolId === 'one').length, 1)
await React.act(async () => { await new Promise(r => setTimeout(r,25)) })
const toolEntry = mod.__test.board.get().entries.find(e => e.toolId === 'one')
const overlayFlight = svg.querySelector(`[data-flight="${toolEntry.id}"]`)
assert.ok(overlayFlight)
assert.equal(svg.querySelectorAll(`[data-flight="${toolEntry.id}"]`).length, 1)
await React.act(() => { fire('tool.start', {tool_id:'delegation',name:'delegate_task'}); fire('subagent.start', {subagent_id:'child'}) })
await React.act(async () => { await new Promise(r => setTimeout(r,25)) })
const delegate = mod.__test.board.get().entries.find(e => e.toolId === 'delegation')
const child = mod.__test.board.get().entries.find(e => e.kind === 'subagent' && e.status === 'run')
assert.ok(svg.querySelector(`[data-flight="${delegate.id}"]`))
assert.equal(svg.querySelector(`[data-flight="${child.id}"]`), null)
assert.equal(svg.querySelectorAll(`[data-flight="${delegate.id}"]`).length, 1)
assert.ok(svg.querySelector('[data-lm-key="trail"]'))
await React.act(() => { fire('tool.complete', {tool_id:'one',name:'terminal'}); fire('reasoning.delta', {text:'secret-reasoning'}) })
await React.act(async () => { await new Promise(r => setTimeout(r,25)) })
assert.equal(svg.querySelector(`[data-flight="${toolEntry.id}"]`), overlayFlight)
assert.equal(overlayFlight.dataset.outcome, 'success')
assert.equal(overlayFlight.querySelector('.pulse-dot').getAttribute('fill'), '#a8d9b5')
await React.act(() => fire('tool.complete', {tool_id:'delegation',name:'delegate_task',result:{success:false}}))
await React.act(async () => { await new Promise(r => setTimeout(r,25)) })
const errorFlight = svg.querySelector(`[data-flight="${delegate.id}"]`)
assert.equal(errorFlight.dataset.outcome, 'error')
assert.equal(errorFlight.querySelector('.pulse-dot').getAttribute('fill'), '#e8654f')
assert.equal(svg.querySelector(`[data-lm-key="return-${toolEntry.id}"]`), null)
entry = mod.__test.board.get().entries.filter(e => e.kind === 'model').at(-1)
time += 100
await React.act(() => fire('message.complete', {text:'secret-answer'}))
const count = mod.__test.board.get().entries.filter(e => e.kind === 'model').length
await React.act(() => { fire('message.start'); fire('tool.start', {tool_id:'two',name:'terminal'}); fire('tool.complete', {tool_id:'two',name:'terminal'}); fire('message.complete') })
assert.equal(mod.__test.board.get().entries.filter(e => e.kind === 'model').length, count)
assert.doesNotMatch(JSON.stringify(mod.__test.board.get()) + document.body.textContent, /secret-/)
await React.act(() => app.unmount())
console.log('PASS real React/jsdom: stable overlay, elapsed ring, duplicate suppression, completion, chronology, privacy')
