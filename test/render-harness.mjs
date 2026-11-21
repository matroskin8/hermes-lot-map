// Render-harness: load the plugin with REAL React + real nanostores from the
// desktop app's node_modules, fire events, and renderToStaticMarkup the pane —
// reproducing the app crash with a real stack trace.
const ROOT = process.env.HERMES_DESKTOP_DIR
if (!ROOT) {
  console.error('Set HERMES_DESKTOP_DIR to the Hermes desktop app dir (a checkout of apps/desktop with node_modules, e.g. ~/.hermes/hermes-agent/apps/desktop).')
  process.exit(1)
}
const SRC = new URL('../desktop/plugin.js', import.meta.url).pathname
const { readFileSync } = await import('node:fs')
const { pathToFileURL } = await import('node:url')

const jsxrt = await import(pathToFileURL(ROOT + '/node_modules/react/jsx-runtime.js').href)
const RDS = await import(pathToFileURL(ROOT + '/node_modules/react-dom/server.js').href)

const dataUrl = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')

const sdkCode = `
import { atom } from ${JSON.stringify(pathToFileURL(ROOT + '/node_modules/nanostores/index.js').href)}
import React from ${JSON.stringify(pathToFileURL(ROOT + '/node_modules/react/index.js').href)}
export { atom }
export const host = {state:{focusedSessionId:atom("test-session"),focusedSessionOwner:atom({connectionId:"host",profile:"default"})}}
export function useValue(a) {
  const [, force] = React.useState(0)
  React.useEffect(() => a.subscribe(() => force((x) => x + 1)), [a])
  return a.get()
}
export const cn = (...xs) => xs.filter(Boolean).join(' ')
`

const src = readFileSync(SRC, 'utf8')
const rewritten = src
  .replace(/from '@hermes\/plugin-sdk'/, `from ${JSON.stringify(dataUrl(sdkCode))}`)
  .replace(/from 'react'/, `from ${JSON.stringify(pathToFileURL(ROOT + '/node_modules/react/index.js').href)}`)
  .replace(/from 'react\/jsx-runtime'/, `from ${JSON.stringify(pathToFileURL(ROOT + '/node_modules/react/jsx-runtime.js').href)}`)

const mod = await import(dataUrl(rewritten))
const plugin = mod.default

const contributions = []
const listeners = {}
const ctx = {
  register: (c) => { contributions.push(c); return () => {} },
  registerMany: (cs) => cs.forEach(ctx.register),
  onEvent: (t, f) => { (listeners[t] ||= []).push(f); return () => {} },
  setInterval: () => () => {},
  setTimeout: () => () => {},
  onDispose: () => {},
  storage: { get: (k, f) => f, set: () => {} },
  registerSettingsPage: () => {}
}
plugin.register(ctx)
const fire = (type, payload) => (listeners[type] || []).forEach((f) => f({ type, payload, session_id: 'test-session', connectionId: 'host', profile: 'default' }))

// give it live data like a real session
fire('tool.start', { tool_id: 't1', name: 'terminal', args: { command: 'ls' } })
fire('tool.complete', { tool_id: 't1', name: 'terminal', duration_s: 0.4 })
fire('tool.start', { tool_id: 't2', name: 'web_search', args: { query: 'hermes' } })
fire('session.usage', { context_tokens: 50000, context_length: 200000 })
fire('message.delta', { text: 'x' })
fire('status.update', { kind: 'x', text: 'Running: web_search' })
fire('todo.updated', { todos: [{}, {}, {}] })

const pane = contributions.find((c) => c.area === 'panes')
try {
  const html = RDS.renderToStaticMarkup(pane.render())
  console.log('RENDER OK — length', html.length)
  const checks = [

    // The SVG is mounted by a ref in the browser, not during server rendering.
    ['accessible map host present', html.includes('aria-label="Hermes activity map"')],
    ['feed row', html.includes('terminal')],
    ['status text not retained', !html.includes('Running: web_search')],
    ['task count', html.includes('tasks: 3')]
  ]
  for (const [label, ok] of checks) console.log((ok ? 'PASS' : 'FAIL') + '  ' + label)
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1
  console.log('--- first 500 chars ---')
  console.log(html.slice(0, 500))
} catch (e) {
  console.log('RENDER CRASH — reproduced the app failure:')
  console.log(e.stack || e)
  process.exit(1)
}
