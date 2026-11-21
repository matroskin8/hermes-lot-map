// Harness: execute ~/.hermes/desktop-plugins/panoptes/plugin.js outside the app.
// Stubs the two allowed import specifiers, fires gateway events at the real
// register() wiring, and asserts board transitions + contributions.
import { readFileSync } from 'node:fs'

const SRC = new URL('../desktop/plugin.js', import.meta.url).pathname
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
export const useValue = (a) => a.get()
export const cn = (...xs) => xs.filter(Boolean).join(' ')
`
const jsxStub = `
export const jsx = (t, p, ...kids) => ({ t, p: p || {}, kids })
export const jsxs = jsx
`

let rewritten = src
  .replace(/from '@hermes\/plugin-sdk'/, `from ${JSON.stringify(dataUrl(sdkStub))}`)
  .replace(/from 'react\/jsx-runtime'/, `from ${JSON.stringify(dataUrl(jsxStub))}`)

if (rewritten === src) { console.error('FAIL: specifier rewrite did not apply'); process.exit(1) }
const leftovers = rewritten.match(/from ['"][^'"]+['"]/g) || []
const bad = leftovers.filter(s => !s.startsWith('from "data:'))
if (bad.length) { console.error('FAIL: unresolved imports:', bad); process.exit(1) }

const mod = await import(dataUrl(rewritten))
const plugin = mod.default
let failures = 0
const ok = (cond, label) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + label); if (!cond) failures++ }

ok(plugin && plugin.id === 'panoptes' && typeof plugin.register === 'function', 'default export is a HermesPlugin (id=panoptes)')

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

const fire = (type, payload) => (listeners[type] || []).forEach(fn => fn({ type, payload }))
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
   && cls('memory') === 'memory' && cls('skill_view') === 'tools' && cls('lcm_grep') === 'memory'
   && cls('clarify') === 'you' && cls('mcp__exa__search') === 'tools', 'classify covers Hermes tool names')

// 4. context ring
fire('session.usage', { context_tokens: 75000, context_length: 100000 })
ok(b().ctxPct === 0.75, 'session.usage fills the context ring (75%)')

// 5. subagents
fire('subagent.start', { name: 'researcher' })
fire('subagent.tool', { name: 'web_search' })
fire('subagent.complete', {})
const agentRows = b().entries.filter(e => e.station === 'agents')
ok(agentRows.length >= 2 && agentRows.every(e => e.status !== 'run' || e === agentRows[agentRows.length - 1]), 'subagent events light AGENTS')

// 6. model + answer
fire('message.delta', { text: 'working' })
ok(Date.now() - b().modelLiveAt < 100, 'message.delta marks the model live')
fire('message.complete', {})
ok(b().answeredAt > 0 && Object.keys(b().faults).length === 0, 'message.complete rings the answer and clears faults')

// 7. feed helpers
const folded = mod.__test.foldRows([
  { id: 'a', station: 'web', label: 'web_search q', status: 'ok', ms: 100 },
  { id: 'b', station: 'web', label: 'web_search q', status: 'ok', ms: 300 },
  { id: 'c', station: 'shell', label: 'terminal ls', status: 'ok', ms: 50 }
])
ok(folded.length === 2 && folded[0].fold === 2, 'foldRows merges consecutive same-station rows (+1)')

ok(mod.__test.hintOf({ command: 'npm install ' + 'x'.repeat(60) }).length <= 28, 'hintOf truncates long args')

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
const texts = rendered.filter(x => x.t === 'text').map(x => x.p.children)
ok(rendered.some(x => x.t === 'svg' && x.p['aria-label'] === 'Hermes activity map'), 'accessible map renders')
ok(['YOU','FILES','SHELL','WEB','BROWSER','AGENTS','MEMORY','TOOLS','HERMES'].every(s => texts.includes(s)), 'all live stations and hub rendered')
ok(texts.includes('75%'), 'usage event renders context percentage')
ok(rendered.some(x => x.t === 'circle' && x.p.fill === '#f87171'), 'failed event renders fault marker')
ok(rendered.some(x => x.t === 'animateMotion'), 'live tool events render animated pulses')
ok(rendered.some(x => x.t === 'text' && x.p.children === '▤'), 'station renders file icon')

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
