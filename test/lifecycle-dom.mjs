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
globalThis.Worker = class { postMessage({key,requestId}) { queueMicrotask(() => this.onmessage({data:{key,requestId,paths:[{d:'M230 169 L300 320',lane:55},{d:'M220 170 L310 320',lane:-55}]}})) } terminate() {} }
globalThis.URL.createObjectURL = () => 'blob:stub'
dom.window.SVGElement.prototype.getTotalLength = () => 100
dom.window.SVGElement.prototype.getPointAtLength = n => ({x:n,y:n})
let time = 100000
Date.now = () => time
const React = await import(pathToFileURL(root + '/node_modules/react/index.js'))
const { createRoot } = await import(pathToFileURL(root + '/node_modules/react-dom/client.js'))
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const sdk = `import { atom } from ${JSON.stringify(pathToFileURL(root + '/node_modules/nanostores/index.js').href)}; import React from ${JSON.stringify(pathToFileURL(root + '/node_modules/react/index.js').href)}; export {atom}; export const host=globalThis.__testHost={state:{focusedSessionId:atom("a"),focusedSessionOwner:atom({connectionId:"host",profile:"default"})}}; export function useValue(a){ return React.useSyncExternalStore(a.subscribe,a.get,a.get) }`
const source = readFileSync(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
const mod = await import(url(source.replace("from '@hermes/plugin-sdk'", `from '${url(sdk)}'`).replace("from 'react'", `from '${pathToFileURL(root + '/node_modules/react/index.js').href}'`).replace("from 'react/jsx-runtime'", `from '${pathToFileURL(root + '/node_modules/react/jsx-runtime.js').href}'`)))
const listeners = {}, contributions = []; let settingsPage
let tick
mod.default.register({ register: c => contributions.push(c), onDispose() {}, onEvent: (t,f) => { (listeners[t] ||= []).push(f) }, setInterval: f => { tick = f }, storage: { get: (k,v) => v, set() {} }, registerSettingsPage(page) { settingsPage = page } })
const fire = (type, payload = {}, route = {}) => listeners[type]?.forEach(f => f({ type, payload, session_id: 'a', connectionId: 'host', profile: 'default', ...route }))
const app = createRoot(document.querySelector('#app'))
await React.act(() => app.render(contributions.find(c => c.area === 'panes').render()))
// Simulate overflowing layout: jsdom itself does not calculate scroll dimensions.
const feed = [...document.querySelectorAll('div')].find(el => el.style.overflowY === 'auto')
assert.ok(feed, 'activity feed is scrollable')
let feedHeight = 350
Object.defineProperty(feed, 'scrollHeight', { configurable: true, get: () => feedHeight })
feed.scrollTop = 0
await React.act(() => fire('tool.start', {tool_id:'scroll-test',name:'terminal', arguments:{secret:'private-value'}}))
assert.equal(feed.scrollTop, 350, 'new activity follows the bottom')
assert.match(feed.textContent, /shell.*terminal.*0 s/)
assert.doesNotMatch(feed.textContent, /private-value/)
time += 2100
await React.act(() => tick())
assert.match(feed.textContent, /shell.*terminal.*2 s/, 'active time advances on clock ticks')
await React.act(() => fire('tool.complete', {tool_id:'scroll-test',name:'terminal',duration_s:2.1}))
assert.match(feed.textContent, /terminal.*2\.1 s/, 'completion shows observed duration')
feedHeight = 410
await React.act(() => fire('tool.start', {tool_id:'scroll-test-2',name:'terminal'}))
assert.equal(feed.scrollTop, 410, 'subsequent activity follows the new bottom')
Object.defineProperty(feed, 'clientHeight', { configurable: true, value: 100 })
feed.scrollTop = 100
await React.act(() => feed.dispatchEvent(new dom.window.Event('scroll', { bubbles: true })))
feedHeight = 470
await React.act(() => fire('tool.start', {tool_id:'scroll-test-3',name:'terminal'}))
assert.equal(feed.scrollTop, 100, 'reading older activity is not interrupted')
time += 1000
await React.act(() => tick())
assert.equal(feed.scrollTop, 100, 'timer ticks do not steal scroll position')
feed.scrollTop = 370
await React.act(() => feed.dispatchEvent(new dom.window.Event('scroll', { bubbles: true })))
feedHeight = 530
await React.act(() => fire('tool.start', {tool_id:'scroll-test-4',name:'terminal'}))
assert.equal(feed.scrollTop, 530, 'following resumes after returning to the bottom')
await React.act(() => { for (let i=0;i<16;i++) fire('tool.start', {tool_id:'many-'+i,name:'read_file'}) })
assert.match(feed.firstElementChild.textContent, /terminal.*2\.1 s/, 'older retained activity remains visible beyond 13 rows')
assert.equal([...feed.children].filter(row => row.textContent.includes('read_file')).length, 16, 'individual rows are not folded')
await React.act(() => { for (let i=0;i<16;i++) fire('tool.complete', {tool_id:'many-'+i,name:'read_file'}) })
assert.equal([...feed.children].filter(row => row.textContent.includes('read_file')).length, 16, 'completed rows are not folded')
await React.act(() => fire('message.delta', {text:'secret-stream'}))
let entry = mod.__test.board.get().entries.find(e => e.kind === 'model')
const svg = document.querySelector('svg')
assert.ok(svg.querySelector('[data-lm-overlay]'))
const settingsHost=document.createElement('div'); document.body.append(settingsHost)
const settingsRoot=createRoot(settingsHost)
await React.act(() => settingsRoot.render(React.createElement(settingsPage.render)))
await React.act(() => settingsHost.querySelector('button').click())
assert.equal(svg.querySelector('[data-lm-overlay]'),null)
assert.equal(svg.querySelector('animate, animateTransform, animateMotion'),null)
assert.ok(svg.querySelector('[data-lm-key="clock-60000"]'))
await React.act(() => settingsHost.querySelector('button').click())
assert.ok(svg.querySelector('[data-lm-overlay]'))
await React.act(() => settingsRoot.unmount())

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
assert.ok(svg.querySelector(`[data-flight="${child.id}"]`))
assert.equal(svg.querySelectorAll(`[data-flight="${delegate.id}"]`).length, 1)
assert.equal(svg.querySelector('[data-lm-key="trail"]'), null)
assert.equal(svg.querySelectorAll('[data-lm-key^="leg-"]').length, 0)
await React.act(() => { fire('tool.complete', {tool_id:'one',name:'terminal'}); fire('reasoning.delta', {text:'secret-reasoning'}) })
await React.act(async () => { await new Promise(r => setTimeout(r,25)) })
assert.equal(svg.querySelector(`[data-flight="${toolEntry.id}"]`), overlayFlight)
// Completion waits until the 800 ms outbound journey reaches its destination.
assert.equal(overlayFlight.dataset.outcome, undefined)
assert.ok(overlayFlight.querySelector('.satellite'))
time += 800
await React.act(async () => { await new Promise(r => setTimeout(r,25)) })
assert.equal(overlayFlight.dataset.outcome, 'success')
assert.equal(overlayFlight.querySelector('.satellite'), null)
assert.equal(overlayFlight.querySelector('.pulse-dot').getAttribute('fill'), '#a8d9b5')
// Exercise the actual React adapter across reconciliations and the entire fade.
const replyAt = time
const response = overlayFlight.querySelectorAll('.response-trail path')
const overlappingFlight = svg.querySelector(`[data-flight="${delegate.id}"]`)
time = replyAt + 400
await React.act(async () => { tick(); await new Promise(r => setTimeout(r,25)) })
assert.equal(svg.querySelector(`[data-flight="${toolEntry.id}"]`), overlayFlight)
assert.equal(Number(response[0].getAttribute('opacity')), 0)
assert.ok(Number(response[39].getAttribute('opacity')) > .99)
assert.equal(svg.querySelector(`[data-flight="${delegate.id}"]`), overlappingFlight)
time = replyAt + 30000
await React.act(async () => { tick(); await new Promise(r => setTimeout(r,25)) })
assert.ok(Math.abs(Number(response[39].getAttribute('opacity')) - .5) < .001)
time = replyAt + 59999
await React.act(async () => { tick(); await new Promise(r => setTimeout(r,25)) })
assert.ok(Number(response[39].getAttribute('opacity')) > 0)
time = replyAt + 60800
await React.act(async () => { tick(); await new Promise(r => setTimeout(r,25)) })
assert.equal(overlayFlight.isConnected, false)
assert.equal(svg.querySelector(`[data-flight="${delegate.id}"]`), overlappingFlight)
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
// Every island can display both elapsed hands and independent identified work.
const ids = ['you','model','memory','files','shell','web','browser','agents','skills','hooks']
for (let i=0;i<ids.length;i++) {
  const station=ids[i], entries=[0,1].map(n=>({id:`${station}-${n}`,station,startedAt:time-1200,status:'run'}))
  const markup=mod.__test.drawMap({entries,counts:{},faults:{},overlayFlights:true},time,mod.__test.setupFrom({coreName:'HERMES',motion:'full'}))
  const probe=document.createElement('div');probe.innerHTML=markup
  assert.ok(probe.querySelector(`[data-lm-key="under-${i}"] [data-lm-key="clock-60000"]`),station+' minute')
  assert.ok(probe.querySelector(`[data-lm-key="under-${i}"] [data-lm-key="clock-600000"]`),station+' ten minute')
}
await React.act(() => {fire('subagent.start',{subagent_id:'child2'});fire('subagent.start',{subagent_id:'child3'})})
await React.act(async () => {await new Promise(r=>setTimeout(r,25))})
time += 800
await React.act(async () => {await new Promise(r=>setTimeout(r,25))})
const children=mod.__test.board.get().entries.filter(e=>e.kind==='subagent'&&e.status==='run')
assert.equal(children.length,3)
const satellites=children.map(e=>svg.querySelector(`[data-flight="${e.id}"] .satellite`))
assert.ok(satellites.every(Boolean))
const agentCenter={x:230+176*Math.sin(7*2*Math.PI/10),y:212-164*Math.cos(7*2*Math.PI/10)}
const radii=satellites.map(s=>Math.hypot(Number(s.getAttribute('cx'))-agentCenter.x,Number(s.getAttribute('cy'))-agentCenter.y))
const sortedRadii=[...radii].sort((a,b)=>a-b)
assert.ok(sortedRadii.slice(1).every((r,i)=>Math.abs(r-sortedRadii[i]-4.75)<1e-7),`distinct radii spaced 4.75 apart: ${radii}`)
assert.ok(satellites.every(s=>s.getAttribute('r')==='4'&&s.getAttribute('stroke-width')==='1.5'))
await React.act(() => fire('subagent.complete',{subagent_id:'child2',status:'cancelled'}))
await React.act(async () => {await new Promise(r=>setTimeout(r,25))})
assert.equal(mod.__test.board.get().entries.find(e=>e.toolId==='child2').status,'err')
assert.equal(mod.__test.board.get().entries.find(e=>e.toolId==='child3').status,'run')
assert.equal(svg.querySelector(`[data-flight="${children[1].id}"]`).dataset.outcome,'error')
time += 800
await React.act(async () => {await new Promise(r=>setTimeout(r,25))})
assert.equal(svg.querySelector(`[data-flight="${children[1].id}"]`).dataset.outcome,'error')
assert.ok(svg.querySelector(`[data-flight="${children[2].id}"] .satellite`))
console.log('PASS all ten elapsed indicators and three independent identified child satellites; cancellation')
// A timed-out observation fades neutrally; even after removal a late result
// must create an actual visible return in the production React adapter.
await React.act(() => fire('tool.start',{tool_id:'lost',name:'read_file'}))
await React.act(async()=>{await new Promise(r=>setTimeout(r,25))})
const lost=mod.__test.board.get().entries.find(e=>e.toolId==='lost')
const lostFlight=svg.querySelector(`[data-flight="${lost.id}"]`)
assert.ok(lostFlight)
time=lost.t0+6*60*60*1000
await React.act(async()=>{tick();await new Promise(r=>setTimeout(r,25))})
assert.equal(lostFlight.dataset.outcome,'unknown')
assert.equal(lostFlight.querySelector('.satellite'),null)
assert.equal(lostFlight.querySelector('.response-trail path').getAttribute('stroke'),'#9ba1ab')
time+=60800
await React.act(async()=>{tick();await new Promise(r=>setTimeout(r,25))})
assert.equal(lostFlight.isConnected,false)
await React.act(()=>fire('tool.complete',{tool_id:'lost',name:'read_file',result:{success:false}}))
await React.act(async()=>{await new Promise(r=>setTimeout(r,25))})
const late=svg.querySelector(`[data-flight="${lost.id}"]`)
assert.ok(late && late.isConnected,'late completion creates a real overlay after unknown fade')
assert.equal(late.dataset.outcome,'error')
assert.equal(late.querySelector('.response-trail path').getAttribute('stroke'),'#e8654f')
time+=400
await React.act(async()=>{tick();await new Promise(r=>setTimeout(r,25))})
assert.ok(Number(late.querySelectorAll('.response-trail path')[39].getAttribute('opacity'))>0,'late response is visibly painted')
await React.act(()=>globalThis.__testHost.state.focusedSessionId.set('b'))
assert.equal(document.querySelector(`[data-flight="${lost.id}"]`),null)
assert.equal(mod.__test.board.get().entries.length,0)
console.log('PASS unknown neutral fade, post-expiry late overlay paints, focus switch clears')
await React.act(() => app.unmount())
const allRoot=createRoot(document.querySelector('#app'))
const synthetic=ids.flatMap(station=>[0,1].map(n=>({id:`all-${station}-${n}`,station,kind:'tool',status:'run',t0:time-1200,t1:0})))
await React.act(() => allRoot.render(React.createElement(mod.__test.MapSvg,{b:{entries:synthetic,counts:{},faults:{}},now:time,motion:true})))
await React.act(async()=>{await new Promise(r=>setTimeout(r,80))})
const badgeLayer=document.querySelector('[data-lm-key="active-badges"]')
const liveOverlay=document.querySelector('[data-lm-overlay]')
assert.ok(badgeLayer && liveOverlay)
assert.ok(liveOverlay.compareDocumentPosition(badgeLayer) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING)
assert.equal(badgeLayer.querySelectorAll('[data-lm-key^="badge-"]').length,10)
await React.act(()=>allRoot.render(React.createElement(mod.__test.MapSvg,{b:{entries:synthetic,counts:{},faults:{}},now:time+300,motion:true})))
assert.equal(document.querySelector('[data-lm-key="active-badges"]'),badgeLayer)
assert.equal(document.querySelector('[data-lm-overlay]'),liveOverlay)
assert.ok(liveOverlay.compareDocumentPosition(badgeLayer) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING)
assert.equal(document.querySelectorAll('[data-lm-key^="badge-"]').length,10)
for(const station of ids){
  const dots=[0,1].map(n=>document.querySelector(`[data-flight="all-${station}-${n}"] .satellite`))
  assert.ok(dots.every(Boolean),station+' satellites')
  assert.notEqual(`${dots[0].getAttribute('cx')},${dots[0].getAttribute('cy')}`,`${dots[1].getAttribute('cx')},${dots[1].getAttribute('cy')}`,station+' separate slots')
}
await React.act(()=>allRoot.unmount())
console.log('PASS real React overlay: two independent satellite slots on each of ten islands')
console.log('PASS real React/jsdom: stable overlay, elapsed ring, duplicate suppression, completion, no chronological links, privacy')
