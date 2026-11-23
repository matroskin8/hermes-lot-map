// Harness: execute ~/.hermes/desktop-plugins/panoptes/plugin.js outside the app.
// Stubs the two allowed import specifiers, fires gateway events at the real
// register() wiring, and asserts board transitions + contributions.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../desktop/plugin.js', import.meta.url))
const src = readFileSync(SRC, 'utf8')

const dataUrl = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')

// nanostores-lite
const sdkStub = `
export function atom(init) {
  let value = init
  const subs = new Set()
  return {
    get: () => value,
    set: (v) => { value = v; subs.forEach(f => f(value)) },
    subscribe: (f) => { subs.add(f); return () => subs.delete(f) }
  }
}
export const host = { state: { focusedSessionId: atom('session-a'), focusedSessionOwner: atom({connectionId:'host-a',profile:'default'}) } }; globalThis.__host = host
export const useValue = (a) => a.get()
export const cn = (...xs) => xs.filter(Boolean).join(' ')
`
const jsxStub = `
export const jsx = (t, p, ...kids) => ({ t, p: p || {}, kids })
export const jsxs = jsx
`

let rewritten = src
  .replace(/from '@hermes\/plugin-sdk'/, `from ${JSON.stringify(dataUrl(sdkStub))}`)
  .replace(/from 'react'/, `from ${JSON.stringify(dataUrl('export const useState=v=>[v,()=>{}]; export const useRef=()=>({current:null}); export const useLayoutEffect=f=>globalThis.__mapEffects.push(f)'))}`)
  .replace(/from 'react\/jsx-runtime'/, `from ${JSON.stringify(dataUrl(jsxStub))}`)

if (rewritten === src) { console.error('FAIL: specifier rewrite did not apply'); process.exit(1) }
const leftovers = rewritten.match(/from ['"][^'"]+['"]/g) || []
const bad = leftovers.filter(s => !s.startsWith('from "data:'))
if (bad.length) { console.error('FAIL: unresolved imports:', bad); process.exit(1) }

const mod = await import(dataUrl(rewritten))
const plugin = mod.default
let failures = 0
const ok = (cond, label) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + label); if (!cond) failures++ }

ok(plugin && plugin.id === 'hermes-lot-map' && typeof plugin.register === 'function', 'default export is a HermesPlugin (id=hermes-lot-map)')

// fake host context
const contributions = []
const listeners = {}
const timers = []
const pages = []
const ctx = {
  register: (c) => { contributions.push(c); return () => {} },
  registerMany: (cs) => cs.forEach(ctx.register),
  onEvent: (type, fn) => { (listeners[type] ||= []).push(fn); return () => {} },
  setInterval: (fn, ms) => { timers.push(fn); return () => {} },
  setTimeout: (fn, ms) => () => {},
  onDispose: () => {},
  storage: { get: (k, f) => f, set: () => {} },
  registerSettingsPage: (p) => pages.push(p)
}

plugin.register(ctx)

const fire = (type, payload, route = {}) => (listeners[type] || []).forEach(fn => fn({ type, payload, session_id: 'session-a', connectionId: 'host-a', profile: 'default', ...route }))
const b = () => mod.__test.board.get()

// 1. pane contribution docks right
const pane = contributions.find(c => c.area === 'panes')
ok(!!pane, 'registers a panes contribution')
ok(pane && pane.data && pane.data.dock && pane.data.dock.pos === 'right', 'pane docks at workspace right edge')
ok(pane && typeof pane.render === 'function', 'pane has a render function')
ok(pages.length === 1, 'settings page registered')

// 2. tool lifecycle
fire('tool.start', { tool_id: 't1', name: 'terminal', args: { command: 'git status --short' } })
fire('tool.start', { tool_id: 't2', name: 'read_file', args: { path: '/tmp/x.py' } })
ok(b().entries.length === 2, 'two running entries after two tool.start')
ok(b().entries[0].station === 'shell' && b().entries[1].station === 'files', 'classify: terminal->shell, read_file->files')
ok(b().counts.shell === 1 && b().counts.files === 1, 'counts increment per station')

fire('tool.complete', { tool_id: 't1', name: 'terminal', duration_s: 1.234 })
ok(b().entries[0].status === 'ok' && b().entries[0].ms === 1234, 'completion marks ok with duration')

fire('tool.complete', { tool_id: 't2', name: 'read_file', result: { success: false, error: 'not found' } })
ok(b().entries[1].status === 'err', 'success:false result marks err')
ok(b().faults.files === 1, 'error counted as a fault on the station')

// 3. station coverage for Hermes tool names
const cls = mod.__test.classify
ok(cls('web_search') === 'web' && cls('browser_exec') === 'browser' && cls('delegate_task') === 'agents'
   && cls('memory') === 'memory' && cls('skill_view') === 'skills' && cls('lcm_grep') === 'memory'
   && cls('clarify') === 'you' && cls('mcp__exa__search') === 'skills', 'classify covers Hermes tool names')
ok(['hindsight_recall', 'hindsight_reflect', 'hindsight_retain'].every(n => cls(n) === 'memory'), 'Hindsight tools map to memory')
ok(['browser_exec', 'browser_cdp', 'browser_dialog', 'browser_vault'].every(n => cls(n) === 'browser'), 'browser tools map to browser')

// 4. context ring
fire('session.usage', { context_tokens: 75000, context_length: 100000 })
ok(b().ctxPct === 0.75, 'session.usage fills the context ring (75%)')

// 5. Uncorrelated subagent events must not close unrelated tools.
fire('tool.start', { tool_id: 'ongoing', name: 'terminal' })
fire('subagent.complete', {})
ok(b().entries.find(e => e.toolId === 'ongoing').status === 'run', 'subagent completion does not alter unrelated tool')

// 6. model + answer
fire('message.delta', { text: 'working' })
const model = b().entries.find(e => e.kind === 'model' && e.status === 'run')
fire('reasoning.delta', { text: 'private-stream' })
ok(model && b().entries.filter(e => e.kind === 'model' && e.status === 'run').length === 1 && b().entries.includes(model), 'stream chunks keep one stable model observation')
fire('tool.start', { tool_id: 'model-boundary', name: 'terminal', args: { command: 'private-command' } })
ok(b().entries.find(e => e.id === model.id).status === 'ok', 'tool start ends observed model interval')
fire('tool.complete', { tool_id: 'model-boundary', name: 'terminal' })
fire('thinking.delta', { text: 'private-thinking' })
const model2 = b().entries.find(e => e.kind === 'model' && e.status === 'run')
fire('message.complete', {}, { session_id: 'other' })
ok(b().entries.find(e => e.id === model2.id).status === 'run', 'another session cannot end the observation')
fire('message.complete', {})
ok(b().entries.find(e => e.id === model2.id).status === 'ok', 'completion ends the observation')
const beforeNoStream = b().entries.filter(e => e.kind === 'model').length
fire('message.start', {})
fire('tool.start', { tool_id: 'silent', name: 'terminal' })
fire('tool.complete', { tool_id: 'silent', name: 'terminal' })
fire('message.complete', { text: 'private-final' })
ok(b().entries.filter(e => e.kind === 'model').length === beforeNoStream && !b().counts.model, 'no stream does not invent model activity or API call counts')
ok(!JSON.stringify(b()).includes('private-stream') && !JSON.stringify(b()).includes('private-thinking') && !JSON.stringify(b()).includes('private-command') && !JSON.stringify(b()).includes('private-final'), 'stream, tool arguments and final text are not retained')
ok(b().answeredAt > 0 && Object.keys(b().faults).length === 0, 'message.complete rings the answer and clears faults')

// Real gateway model and subagent contracts; private payload text is ignored.
fire('session.info', { model: 'provider/model-one', system_prompt: 'private-prompt' })
ok(b().model === 'provider/model-one', 'session.info supplies model')
fire('session.usage', { model: 'provider/model-two', total_tokens: 123, api_calls: 2 })
ok(b().model === 'provider/model-two' && b().tokens === 123 && b().calls === 2, 'usage updates model and totals without context length')
const svgFor = b => {
  let html = ''
  const host = { ownerDocument: { createElement: () => ({ set innerHTML(value) { html = value }, content: { firstElementChild: {} } }) }, firstElementChild: null, appendChild: () => {} }
  globalThis.__mapEffects = []
  const node = mod.__test.MapSvg({ b, now: Date.now(), motion: true })
  node.p.children[0].p.ref.current = host
  globalThis.__mapEffects[0]()
  return html
}
const modelSvg = svgFor(b())
ok(modelSvg.includes('provider/model-two'), 'model name reaches original SVG renderer')
fire('subagent.start', { subagent_id: 'child-1', goal: 'private-goal' })
fire('subagent.start', { subagent_id: 'child-2' })
fire('subagent.start', { goal: 'private-no-id' })
fire('subagent.complete', { subagent_id: 'child-2' })
ok(b().entries.filter(e => e.kind === 'subagent' && e.status === 'run').length === 2, 'missing child identity or status is ignored')
fire('subagent.complete', { subagent_id: 'child-1', status: 'failed' }, { session_id: 'session-b' })
ok(b().entries.filter(e => e.kind === 'subagent' && e.status === 'run').length === 2, 'cross-session subagent completion ignored')
fire('subagent.complete', { subagent_id: 'child-1', status: 'failed' })
ok(b().entries.find(e => e.kind === 'subagent' && e.status === 'err'), 'matched subagent failure closes only its entry')
ok(!JSON.stringify(b()).includes('private-goal') && !JSON.stringify(b()).includes('private-prompt'), 'subagent and model metadata privacy')
fire('tool.start', { tool_id: 'same-id', name: 'terminal' })
fire('tool.complete', { tool_id: 'same-id', name: 'terminal' }, { session_id: 'session-b' })
ok(b().entries.find(e => e.toolId === 'same-id').status === 'run', 'cross-session tool completion ignored')
fire('tool.complete', { name: 'terminal' })
ok(b().entries.find(e => e.toolId === 'same-id').status === 'run', 'missing tool id cannot close arbitrary entry')
fire('tool.complete', { tool_id: 'same-id', name: 'terminal' }, { connectionId: 'host-b' })
ok(b().entries.find(e => e.toolId === 'same-id').status === 'run', 'cross-connection completion ignored')

// 7. feed helpers
const folded = mod.__test.foldRows([
  { id: 'a', station: 'web', label: 'web_search q', status: 'ok', ms: 100 },
  { id: 'b', station: 'web', label: 'web_search q', status: 'ok', ms: 300 },
  { id: 'c', station: 'shell', label: 'terminal ls', status: 'ok', ms: 50 }
])
ok(folded.length === 2 && folded[0].fold === 2, 'foldRows merges consecutive same-station rows (+1)')

ok(mod.__test.hintOf({ command: 'npm install ' + 'x'.repeat(60) }).length <= 28, 'hintOf truncates long args')

// Real adapter must not count the same delegation observation as another satellite.
fire('tool.start', { tool_id: 'delegation', name: 'delegate_task' })
fire('subagent.start', { subagent_id: 'delegated-child' })
const mapMarkup = svgFor(b())
ok(!mapMarkup.includes('data-lm-key="satellite-"') && b().entries.some(e => e.kind === 'tool' && e.toolId === 'delegation') && b().entries.some(e => e.kind === 'subagent' && e.status === 'run'), 'adapter delegates satellites to shared overlay despite overlapping observations')
// Older active calls must survive the history cap and remain completable.
fire('tool.start', { tool_id: 'long-lived', name: 'terminal' })
for (let i = 0; i < 65; i++) {
  fire('tool.start', { tool_id: `short-${i}`, name: 'read_file' })
  fire('tool.complete', { tool_id: `short-${i}`, name: 'read_file' })
}
ok(b().entries.some(e => e.toolId === 'long-lived' && e.status === 'run'), 'active call survives history cap')
fire('tool.complete', { tool_id: 'long-lived', name: 'terminal' })
ok(b().entries.some(e => e.toolId === 'long-lived' && e.status === 'ok'), 'old active call remains completable')

// 8. render smoke: render functions build element trees without React
const tree = pane.render()
ok(tree && (typeof tree.t === 'function' || typeof tree.t === 'string'), 'pane render() returns an element tree')

// Traverse actual element output, evaluating function components with stub hooks.
function elements(node, out = []) {
  if (node == null || typeof node !== 'object') return out
  if (Array.isArray(node)) { node.forEach(n => elements(n, out)); return out }
  if (typeof node.t === 'function') return elements(node.t(node.p), out)
  out.push(node)
  elements(node.p?.children, out)
  return out
}
fire('tool.start', { tool_id: 'visual-error', name: 'read_file' })
fire('tool.complete', { tool_id: 'visual-error', name: 'read_file', result: { success: false } })
const rendered = elements(tree)
const map = rendered.find(x => x.p?.['aria-label'] === 'Hermes activity map')
const svg = svgFor(b())
ok(!!map && svg.includes('<svg'), 'accessible original SVG renders')
ok(svg.includes('viewBox="0 0 460 430"') && svg.includes('HERMES'), 'original dimensions and hub rendered')
ok(svg.includes('75%'), 'usage event renders context percentage')
ok(svg.includes('<animate'), 'live events render original SVG animation')
ok(svg.includes('M-5.5 -8h7.5'), 'original file icon path rendered')
fire('tool.start', { tool_id: 'private', name: 'terminal', args: { command: 'secret-value' } })
ok(!JSON.stringify(b()).includes('secret-value'), 'tool arguments not retained')
fire('tool.complete', { tool_id: 'missing', name: 'terminal' })
ok(b().entries.find(e => e.toolId === 'private').status === 'run', 'unmatched completion does not close another call')

// Focus changes clear all visible state, including model, counts and lingering entries.
const focus = globalThis.__host.state
focus.focusedSessionId.set('session-b')
ok(b().entries.length === 0 && b().model === null && Object.keys(b().counts).length === 0, 'focus change clears board')
fire('session.info', {model:'private-other'}, {session_id:'session-a'})
fire('todo.updated', {todos:[1]}, {session_id:'session-a'})
fire('message.complete', {}, {session_id:'session-a'})
ok(!b().model && !b().todos && !b().answeredAt, 'all other-session event types are filtered')
fire('tool.start', {tool_id:'b',name:'terminal'}, {session_id:'session-b'})
ok(b().entries.length === 1, 'focused event accepted')
focus.focusedSessionOwner.set(null)
ok(!b().entries.length, 'ambiguous owner clears state')
fire('tool.start', {tool_id:'no-owner',name:'terminal'}, {session_id:'session-b'})
ok(!b().entries.length, 'ambiguous owner fails closed')
focus.focusedSessionOwner.set({connectionId:'host-a',profile:'default'})
fire('tool.start', {tool_id:'no-source',name:'terminal'}, {session_id:'session-b',connectionId:undefined})
ok(b().entries.length === 1 && b().entries[0].toolId === 'b', 'missing source fails closed and resolved board is restored')
fire('tool.start', {tool_id:'long',name:'terminal'}, {session_id:'session-b'})
let entry=b().entries.find(e => e.toolId === 'long'); const originalNow=Date.now
Date.now=()=>entry.t0 + 6*60*60*1000-1; timers[0]()
ok(b().entries.find(e => e.toolId === 'long').status==='run','long active call remains running before six hours')
Date.now=()=>entry.t0 + 6*60*60*1000; timers[0]()
ok(b().entries.find(e => e.toolId === 'long').status==='unknown' && !Object.keys(b().faults).length,'lost completion becomes unknown without fault')
fire('tool.complete', {tool_id:'long',name:'terminal'}, {session_id:'session-b'})
ok(b().entries.find(e => e.toolId === 'long').status==='ok','late completion replaces unknown')
Date.now=originalNow

// State is isolated by full route, but retained and updated while unfocused.
focus.focusedSessionId.set('review-a')
fire('tool.start', {tool_id:'review-long', name:'terminal'}, {session_id:'review-a'})
fire('session.info', {model:'review-model'}, {session_id:'review-a'})
focus.focusedSessionId.set('review-b')
fire('tool.start', {tool_id:'review-b-call', name:'read_file'}, {session_id:'review-b'})
fire('tool.complete', {tool_id:'review-long', name:'terminal'}, {session_id:'review-a'})
ok(!b().entries.some(e => e.toolId === 'review-long') && !b().model, 'inactive event does not leak into focused board')
focus.focusedSessionId.set('review-a')
ok(b().model === 'review-model' && b().entries.some(e => e.toolId === 'review-long' && e.status === 'ok'), 'A→B→A restores state with inactive completion')
focus.focusedSessionId.set('review-b')
ok(b().entries.some(e => e.toolId === 'review-b-call' && e.status === 'run'), 'B state survives round-trip')

// Six timed-out calls retain at most five unknowns, including completable survivors.
focus.focusedSessionId.set('review-unknown')
for (let i=0; i<6; i++) fire('tool.start', {tool_id:`unknown-${i}`, name:'terminal'}, {session_id:'review-unknown'})
const started = b().entries.at(-1).t0
Date.now = () => started + 6*60*60*1000
timers[0]()
ok(b().entries.filter(e => e.status === 'unknown').length === 5 && !b().entries.some(e => e.toolId === 'unknown-0'), 'exactly five newest unknown observations retained')
// Timeout cap is independently applied to each complete session route.
focus.focusedSessionId.set('review-unknown-b')
for (let i=0; i<7; i++) fire('tool.start', {tool_id:`other-unknown-${i}`, name:'terminal'}, {session_id:'review-unknown-b'})
const secondStart = b().entries.at(-1).t0
Date.now = () => secondStart + 6*60*60*1000
timers[0]()
ok(b().entries.filter(e => e.status === 'unknown').length === 5 && !b().entries.some(e => e.toolId === 'other-unknown-1'), 'second session independently retains five newest unknowns')
focus.focusedSessionId.set('review-unknown')
ok(b().entries.filter(e => e.status === 'unknown').length === 5, 'first session retains its own five unknowns')
const survivor = b().entries.filter(e => e.status === 'unknown').at(-1)
fire('tool.complete', {tool_id:survivor.toolId, name:'terminal'}, {session_id:'review-unknown'})
ok(b().entries.some(e => e.toolId === survivor.toolId && e.status === 'ok'), 'retained unknown accepts late completion')
Date.now = originalNow

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
