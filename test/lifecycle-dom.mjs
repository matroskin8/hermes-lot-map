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
let time = 100000
Date.now = () => time
const React = await import(pathToFileURL(root + '/node_modules/react/index.js'))
const { createRoot } = await import(pathToFileURL(root + '/node_modules/react-dom/client.js'))
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const sdk = `import { atom } from ${JSON.stringify(pathToFileURL(root + '/node_modules/nanostores/index.js').href)}; import React from ${JSON.stringify(pathToFileURL(root + '/node_modules/react/index.js').href)}; export {atom}; export function useValue(a){ return React.useSyncExternalStore(a.subscribe,a.get,a.get) }`
const source = readFileSync(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
const mod = await import(url(source.replace("from '@hermes/plugin-sdk'", `from '${url(sdk)}'`).replace("from 'react/jsx-runtime'", `from '${pathToFileURL(root + '/node_modules/react/jsx-runtime.js').href}'`)))
const listeners = {}, contributions = []
let tick
mod.default.register({ register: c => contributions.push(c), onEvent: (t,f) => { (listeners[t] ||= []).push(f) }, setInterval: f => { tick = f }, storage: { get: (k,v) => v, set() {} }, registerSettingsPage() {} })
const fire = (type, payload = {}, route = {}) => listeners[type]?.forEach(f => f({ type, payload, session_id: 'a', connectionId: 'host', ...route }))
const app = createRoot(document.querySelector('#app'))
await React.act(() => app.render(contributions.find(c => c.area === 'panes').render()))
await React.act(() => fire('message.delta', {text:'secret-stream'}))
let entry = mod.__test.board.get().entries.find(e => e.kind === 'model')
const svg = document.querySelector('svg'), flight = svg.querySelector(`[data-lm-key="flight-${entry.id}"]`)
assert.ok(flight)
time += 300
await React.act(() => { fire('message.delta', {text:'secret-more'}); tick() })
assert.equal(svg.querySelector(`[data-lm-key="flight-${entry.id}"]`), flight)
assert.equal(mod.__test.board.get().entries.filter(e => e.kind === 'model').length, 1)
time += 100
await React.act(() => fire('tool.start', {tool_id:'one',name:'terminal',args:{command:'secret-command'}}))
assert.ok(svg.querySelector(`[data-lm-key="return-${entry.id}"] animateMotion`))
await React.act(() => { fire('tool.complete', {tool_id:'one',name:'terminal'}); fire('reasoning.delta', {text:'secret-reasoning'}) })
entry = mod.__test.board.get().entries.filter(e => e.kind === 'model').at(-1)
time += 100
await React.act(() => fire('message.complete', {text:'secret-answer'}))
assert.ok(svg.querySelector(`[data-lm-key="return-${entry.id}"] animateMotion`))
const count = mod.__test.board.get().entries.filter(e => e.kind === 'model').length
await React.act(() => { fire('message.start'); fire('tool.start', {tool_id:'two',name:'terminal'}); fire('tool.complete', {tool_id:'two',name:'terminal'}); fire('message.complete') })
assert.equal(mod.__test.board.get().entries.filter(e => e.kind === 'model').length, count)
assert.doesNotMatch(JSON.stringify(mod.__test.board.get()) + document.body.textContent, /secret-/)
await React.act(() => app.unmount())
console.log('PASS real React/jsdom: stable streaming node, tool/completion returns, silent turn, privacy')
