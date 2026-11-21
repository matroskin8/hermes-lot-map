/**
 * Panoptes for Hermes Desktop — a live map of the work in a pane at the
 * workspace's right edge. Native re-implementation of the Claude Code
 * "lot-map" concept (https://github.com/alexeyw/lot-map, MIT) against the
 * Hermes desktop plugin contract: gateway events drive a station map.
 *
 *   tool.start / tool.complete  -> pulses out to a station and back
 *   message.delta               -> the model core glows while it thinks
 *   message.complete            -> answer ring out to YOU
 *   subagent.*                  -> the AGENTS station works
 *   session.usage               -> the context ring around the core
 *   status.update / todo.updated-> the "now" line and the task count
 *
 * Runtime door: ~/.hermes/desktop-plugins/panoptes/plugin.js — plain ESM,
 * imports limited to @hermes/plugin-sdk and react/jsx-runtime. Hot-reloaded;
 * rewrite this file and the pane reloads cleanly.
 *
 * JSX RULES (learned the hard way, on this file's first boot):
 *   1. Children go in config.children — the third parameter is the KEY,
 *      never text. Text as arg 3 silently renders empty elements.
 *   2. config must never be null — React 19's dev jsx reads config.children
 *      unguarded and crashes.
 *   3. Keys go in as the third parameter, not inside config — the dev
 *      runtime warns "key prop is being spread into JSX" on every render.
 */

import { atom, useValue } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

// ── stations ────────────────────────────────────────────────────────────────

const STATIONS = [
  { id: 'you', label: 'YOU' },
  { id: 'files', label: 'FILES' },
  { id: 'shell', label: 'SHELL' },
  { id: 'web', label: 'WEB' },
  { id: 'browser', label: 'BROWSER' },
  { id: 'agents', label: 'AGENTS' },
  { id: 'memory', label: 'MEMORY' },
  { id: 'tools', label: 'TOOLS' }
]

const FILE_TOOLS = new Set(['read_file', 'write_file', 'patch', 'search_files'])
const SHELL_TOOLS = new Set(['terminal', 'execute_code', 'process_manage'])
const WEB_TOOLS = new Set(['web_search', 'web_extract'])
const AGENT_TOOLS = new Set(['delegate_task', 'cronjob', 'cronjob_manage', 'cronjob_list'])
const TOOL_TOOLS = new Set([
  'skill_view', 'skills_list', 'skill_manage', 'tool_search', 'tool_describe',
  'tool_call', 'manage_connections', 'text_to_speech', 'vision_analyze',
  'image_gen', 'video_analyze', 'video_gen'
])
const YOU_TOOLS = new Set(['clarify', 'todo_list', 'todo'])

/** Map a Hermes tool name to a station id. Unknown/MCP tools land on TOOLS. */
function classify(name) {
  const n = String(name || '')
  if (FILE_TOOLS.has(n)) return 'files'
  if (SHELL_TOOLS.has(n)) return 'shell'
  if (WEB_TOOLS.has(n)) return 'web'
  if (n === 'browser_exec') return 'browser'
  if (AGENT_TOOLS.has(n)) return 'agents'
  if (n === 'memory' || n.startsWith('lcm_')) return 'memory'
  if (YOU_TOOLS.has(n)) return 'you'
  return 'tools'
}

/** First interesting argument of a call, for the feed row. */
function hintOf(args) {
  if (!args || typeof args !== 'object') return ''
  const keys = ['command', 'path', 'file_path', 'url', 'query', 'pattern', 'prompt', 'goal', 'name', 'action']
  for (const k of keys) {
    const v = args[k]
    if (typeof v === 'string' && v.trim()) {
      let s = v.trim().replace(/\s+/g, ' ')
      if (s.length > 26) s = s.slice(0, 25) + '…'
      return ' ' + s
    }
    if (typeof v === 'number' || typeof v === 'boolean') return ' ' + String(v)
  }
  return ''
}

const nowMs = () => Date.now()
const newId = () => nowMs().toString(36) + Math.random().toString(36).slice(2, 6)
const KEEP = 60

// ── board ───────────────────────────────────────────────────────────────────

function freshBoard() {
  return {
    entries: [],            // {id, toolId?, station, label, status: run|ok|err, t0, t1, ms, fromAgent?}
    counts: {},             // station -> total calls
    faults: {},             // station -> errors since last answer
    ctxPct: null,           // 0..1 context window fill
    modelLiveAt: 0,         // last message.delta/generating ms
    answeredAt: 0,          // last message.complete ms
    nowLine: '',            // status.update text
    todos: 0,               // todo.updated count
    tokens: null,           // cumulative session tokens (session.usage)
    calls: 0                // cumulative api calls (session.usage)
  }
}

const board = atom(freshBoard())
const clock = atom(nowMs())

const looksLikeError = (p) => {
  const r = p && p.result
  if (r && typeof r === 'object' && r.success === false) return true
  const t = String(p && (p.result_text || p.summary) || '')
  return /"success":\s*false|"error"\s*:|Traceback|command not found|exit_code":\s*[^0]/.test(t.slice(0, 400))
}

const touch = (fn) => board.set(fn(board.get()))

function beginEntry(toolId, station, label, fromAgent) {
  touch((b) => ({
    ...b,
    entries: [...b.entries, {
      id: newId(), toolId, station, label,
      status: 'run', t0: nowMs(), t1: 0, ms: 0,
      ...(fromAgent ? { fromAgent: true } : {})
    }].slice(-KEEP),
    counts: { ...b.counts, [station]: (b.counts[station] || 0) + 1 }
  }))
}

function endEntry(toolId, err, ms) {
  touch((b) => {
    const entries = b.entries.slice()
    let i = toolId ? entries.findIndex((e) => e.toolId === toolId && e.status === 'run') : -1
    if (i < 0) {
      i = -1
      for (let j = entries.length - 1; j >= 0; j--) if (entries[j].status === 'run') { i = j; break }
    }
    let faults = b.faults
    if (i >= 0) {
      const e = entries[i]
      const t1 = nowMs()
      entries[i] = { ...e, status: err ? 'err' : 'ok', t1, ms: ms != null ? ms : t1 - e.t0 }
      if (err) faults = { ...b.faults, [entries[i].station]: (b.faults[entries[i].station] || 0) + 1 }
    }
    return { ...b, entries, faults }
  })
}

// ── components ──────────────────────────────────────────────────────────────
// children in config.children; keys as the third jsx()/jsxs() argument.

const W = 320
const CX = W / 2
const CY = 148
const CORE_R = 22
const ORBIT = 106

const POS = {}
STATIONS.forEach((s, i) => {
  const a = (-90 + i * (360 / STATIONS.length)) * Math.PI / 180
  POS[s.id] = { x: CX + ORBIT * Math.cos(a), y: CY + ORBIT * Math.sin(a) }
})

const fmtMs = (ms) => {
  if (ms == null) return '-'
  if (ms < 1000) return Math.max(0, Math.round(ms)) + ' ms'
  if (ms < 60000) return (ms / 1000).toFixed(1) + ' s'
  return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's'
}

const fmtTok = (n) => {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M tok'
  if (n >= 1e3) return Math.round(n / 1e3) + 'k tok'
  return n + ' tok'
}

const C = {
  teal: '#caa778',
  red: '#f87171',
  amber: '#fbbf24',
  spoke: 'rgba(148, 163, 184, 0.45)'
}

const TERT = 'var(--ui-text-tertiary, #94a3b8)'
const SEC = 'var(--ui-text-secondary, #cbd5e1)'

// Original artwork is independently recreated from lot-map's public screenshots.
const ICON = { you: '♙', files: '▤', shell: '›_', web: '◎', browser: '▣', agents: '♧', memory: '◇', tools: 'ϟ' }
function MapSvg({ b, now, motion }) {
  const pct = b.ctxPct
  const ringColor = pct == null || pct < .7 ? '#caa778' : pct < .9 ? C.amber : C.red
  const running = {}
  const pulses = []
  for (const e of b.entries) {
    if (e.status === 'run') running[e.station] = (running[e.station] || 0) + 1
    if (motion && ((e.status === 'run' && now - e.t0 < 950) || (e.status !== 'run' && e.t1 && now - e.t1 < 550))) pulses.push(e)
  }
  const ringC = 2 * Math.PI * 29
  return jsxs('svg', {
    viewBox: `0 0 ${W} 296`, role: 'img', 'aria-label': 'Hermes activity map',
    style: { width: '100%', display: 'block', flex: 'none', fontFamily: 'var(--font-mono, monospace)' },
    children: [
      ...[62, 82, 106].map((r) => jsx('circle', { cx: CX, cy: CY, r, fill: 'none', stroke: C.spoke, strokeWidth: .6, opacity: .18, strokeDasharray: r === 106 ? '2 5' : undefined }, 'guide'+r)),
      ...STATIONS.map((s) => {
        const p = POS[s.id], n = b.counts[s.id] || 0, hot = !!running[s.id]
        const color = s.id === 'memory' ? '#78bcb6' : '#caa778'
        return jsx('line', { x1: CX, y1: CY, x2: p.x, y2: p.y, stroke: hot ? color : C.spoke, strokeWidth: 0.7 + Math.min(n, 12) * .14, opacity: hot ? .75 : .23 + Math.min(n, 12) * .025 }, 'spoke'+s.id)
      }),
      ...STATIONS.map((s) => {
        const p = POS[s.id], run = running[s.id] || 0, fault = b.faults[s.id] || 0, n = b.counts[s.id] || 0
        const color = s.id === 'memory' ? '#78bcb6' : '#caa778'
        return jsxs('g', { children: [
          run ? jsx('circle', { cx:p.x, cy:p.y, r:16, fill:color, opacity:.1, className: motion ? 'lm-breathe' : '' }, 'halo') : null,
          jsx('circle', { cx:p.x, cy:p.y, r:11, fill:'var(--ui-surface-2, #11151a)', stroke:run ? color : '#58616a', strokeWidth:run ? 1.6 : 1 }, 'disc'),
          jsx('text', { x:p.x, y:p.y+3.5, fontSize:10, textAnchor:'middle', fill:run ? color : '#a4a9a8', children:ICON[s.id] }, 'icon'),
          jsx('text', { x:p.x, y:p.y+22, fontSize:8, textAnchor:'middle', fill: n ? SEC : TERT, children:s.label }, 'label'),
          n ? jsx('text', { x:p.x, y:p.y+31, fontSize:7, textAnchor:'middle', fill:TERT, children:String(n) }, 'count') : null,
          run > 1 ? jsx('text', { x:p.x+12, y:p.y-10, fontSize:8, fill:color, children:'×'+run }, 'running') : null,
          fault ? jsx('circle', { cx:p.x+10, cy:p.y-8, r:3, fill:C.red }, 'fault') : null
        ] }, 'station'+s.id)
      }),
      jsxs('g', { children: [
        jsx('circle', { cx:CX, cy:CY, r:32, fill:'var(--ui-surface-2, #11151a)', stroke:'#596169', strokeWidth:2 }, 'core'),
        pct != null ? jsx('circle', { cx:CX, cy:CY, r:29, fill:'none', stroke:ringColor, strokeWidth:2, strokeDasharray:ringC, strokeDashoffset:ringC*(1-pct), transform:`rotate(-90 ${CX} ${CY})` }, 'ring') : null,
        jsx('text', { x:CX, y:CY-9, fontSize:8, textAnchor:'middle', fill:TERT, children:pct == null ? '—' : Math.round(pct*100)+'%' }, 'pct'),
        jsx('text', { x:CX, y:CY+5, fontSize:9, letterSpacing:1, textAnchor:'middle', fill:SEC, children:'HERMES' }, 'name'),
        jsx('text', { x:CX, y:CY+17, fontSize:7, textAnchor:'middle', fill:TERT, children:now-b.modelLiveAt < 2200 ? 'thinking' : 'live map' }, 'state')
      ] }, 'hub'),
      ...pulses.map((e) => {
        const p = POS[e.station], back = e.status !== 'run'
        return jsx('circle', { r:2.5, fill:e.station === 'memory' ? '#78bcb6' : '#caa778', children:jsx('animateMotion', { path:back ? `M ${p.x} ${p.y} L ${CX} ${CY}` : `M ${CX} ${CY} L ${p.x} ${p.y}`, dur:back ? '0.45s' : '0.9s', fill:'freeze' }) }, 'pulse'+e.id)
      }),
      b.answeredAt && now-b.answeredAt < 1400 && motion ? jsx('circle', { cx:CX, cy:CY, r:32, fill:'none', stroke:'#caa778', className:'lm-answer' }, 'answer'+b.answeredAt) : null
    ]
  })
}

const GLYPH = { run: '●', ok: '·', err: '✕' }
const GLYPH_COLOR = { run: C.teal, ok: TERT, err: C.red }

/** Fold consecutive finished rows at one station into one row (+N). */
function foldRows(entries) {
  const out = []
  for (const e of entries) {
    const last = out[out.length - 1]
    if (last && e.status !== 'run' && last.status === e.status && last.label === e.label && last.station === e.station) {
      last.fold = (last.fold || 1) + 1
      last.ms = Math.max(last.ms || 0, e.ms || 0)
    } else {
      out.push({ ...e })
    }
  }
  return out
}

function Feed({ b }) {
  const rows = foldRows(b.entries).slice(-13)
  return jsx('div', {
    style: {
      flex: 1, minHeight: 0, overflowY: 'auto', paddingTop: 4,
      fontSize: 11, lineHeight: '17px',
      fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'
    },
    children: rows.length === 0
      ? jsx('div', { style: { color: TERT, padding: '6px 2px' }, children: 'Waiting for the first call…' })
      : rows.map((e) => jsxs('div', {
          style: { display: 'flex', gap: 6, alignItems: 'baseline', whiteSpace: 'nowrap' },
          children: [
            jsx('span', { style: { color: GLYPH_COLOR[e.status], flex: 'none' }, children: GLYPH[e.status] }, 'g0'),
            e.fromAgent ? jsx('span', { style: { color: TERT, flex: 'none' }, children: '↳' }, 'g1') : null,
            jsx('span', {
              style: {
                overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 auto',
                color: e.status === 'err' ? C.red : SEC
              },
              children: e.label
            }, 'g2'),
            e.fold > 1 ? jsx('span', { style: { color: TERT, flex: 'none' }, children: '+' + (e.fold - 1) }, 'g3') : null,
            jsx('span', {
              style: { flex: 'none', minWidth: 44, textAlign: 'right', color: TERT },
              children: e.status === 'run' ? '' : fmtMs(e.ms)
            }, 'g4')
          ]
        }, e.id))
  })
}

const CSS = `
.lm-breathe { animation: lm-breathe 1.6s ease-in-out infinite; }
@keyframes lm-breathe { 0%, 100% { opacity: 1 } 50% { opacity: 0.35 } }
.lm-answer { animation: lm-answer 1.4s ease-out forwards; }
@keyframes lm-answer { from { r: 32; opacity: 0.9 } to { r: 64; opacity: 0 } }
.lm-blink { animation: lm-blink 0.28s linear; }
@keyframes lm-blink { 0% { opacity: 1 } 40% { opacity: 0.1 } 100% { opacity: 1 } }
`

function LotMapPane({ motionPref }) {
  const b = useValue(board)
  const now = useValue(clock)
  const motion = motionPref.get().motion !== 'reduced'
  return jsxs('div', {
    style: { display: 'flex', flexDirection: 'column', height: '100%', padding: '8px 10px 6px', gap: 2 },
    children: [
      jsx('style', { children: CSS }, 'css'),
      MapSvg({ b, now, motion }),
      b.nowLine
        ? jsx('div', {
            style: {
              fontSize: 10.5, color: TERT,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '4px 2px 0'
            },
            children: b.nowLine
          }, 'now')
        : null,
      b.todos > 0 || b.calls > 0
        ? jsx('div', {
            style: { fontSize: 10, color: TERT, padding: '2px 2px 0', whiteSpace: 'nowrap' },
            children: [
              b.todos > 0 ? 'tasks: ' + b.todos : '',
              b.todos > 0 && b.calls > 0 ? ' · ' : '',
              b.calls > 0
                ? b.tokens ? b.calls + ' calls · ' + fmtTok(b.tokens) : b.calls + ' calls'
                : ''
            ].filter(Boolean).join('')
          }, 'todos')
        : null,
      Feed({ b })
    ]
  })
}

/** Status-bar chip: live activity even when the pane is collapsed. */
function Chip() {
  const b = useValue(board)
  const run = b.entries.reduce((n, e) => n + (e.status === 'run' ? 1 : 0), 0)
  const label = run > 0
    ? run + ' running'
    : b.calls > 0 ? b.calls + (b.tokens ? ' · ' + fmtTok(b.tokens) : '') : 'idle'
  return jsxs('span', {
    style: {
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, color: run > 0 ? C.teal : TERT, padding: '0 6px', userSelect: 'none'
    },
    title: 'Hermes Lot Map - live activity',
    children: [
      jsx('span', {
        style: {
          width: 6, height: 6, borderRadius: '50%', flex: 'none',
          background: run > 0 ? C.teal : TERT,
          opacity: run > 0 ? 1 : 0.4
        }
      }, 'd'),
      jsx('span', { style: { whiteSpace: 'nowrap' }, children: label }, 't')
    ]
  })
}

// ── plugin ──────────────────────────────────────────────────────────────────

export const __test = { board, classify, foldRows, hintOf }

export default {
  id: 'hermes-lot-map',
  name: 'Hermes Lot Map',
  description: 'A live map pane at the right edge: every tool call, model step and subagent lights up its station. Hermes-native reimplementation of the lot-map concept.',

  register(ctx) {
    const motionPref = atom(ctx.storage.get('motion', { motion: 'full' }))
    const saveMotion = (v) => { motionPref.set({ ...motionPref.get(), motion: v }); ctx.storage.set('motion', motionPref.get()) }

    // tick for pulse/glow lifetimes
    ctx.setInterval(() => clock.set(nowMs()), 250)

    ctx.onEvent('tool.start', (ev) => {
      const p = ev && ev.payload
      if (!p || !p.name) return
      beginEntry(p.tool_id, classify(p.name), p.name + hintOf(p.args))
    })

    ctx.onEvent('tool.complete', (ev) => {
      const p = ev && ev.payload
      if (!p || !p.name) return
      endEntry(p.tool_id, looksLikeError(p), p.duration_s != null ? p.duration_s * 1000 : null)
    })

    ctx.onEvent('message.delta', () => touch((b) => ({ ...b, modelLiveAt: nowMs() })))
    ctx.onEvent('tool.generating', () => touch((b) => ({ ...b, modelLiveAt: nowMs() })))
    ctx.onEvent('message.complete', () => touch((b) => ({
      ...b, modelLiveAt: 0, answeredAt: nowMs(), faults: {}
    })))

    ctx.onEvent('session.usage', (ev) => {
      const p = ev && ev.payload
      if (!p || !p.context_length) return
      const u = p.usage || {}
      const tok = u.total != null ? u.total
        : (u.input || 0) + (u.output || 0) + (u.cache_read || 0) + (u.cache_write || 0)
      touch((b) => ({
        ...b,
        ctxPct: Math.max(0, Math.min(1, (p.context_tokens || 0) / p.context_length)),
        tokens: tok > 0 ? tok : b.tokens,
        calls: p.api_calls != null ? p.api_calls : b.calls
      }))
    })

    ctx.onEvent('subagent.start', (ev) => {
      const p = ev && ev.payload
      beginEntry(null, 'agents', 'spawn ' + String((p && (p.name || p.goal)) || 'agent').slice(0, 22), false)
    })
    ctx.onEvent('subagent.tool', (ev) => {
      const p = ev && ev.payload
      beginEntry(null, 'agents', String((p && p.name) || 'subagent call'), true)
      endEntry(null, false, null)
    })
    ctx.onEvent('subagent.complete', () => endEntry(null, false, null))

    ctx.onEvent('status.update', (ev) => {
      const p = ev && ev.payload
      if (p && p.text) touch((b) => ({ ...b, nowLine: String(p.text).slice(0, 120) }))
    })
    ctx.onEvent('todo.updated', (ev) => {
      const p = ev && ev.payload
      if (p && Array.isArray(p.todos)) touch((b) => ({ ...b, todos: p.todos.length }))
    })

    // status-bar chip: live even when the pane is collapsed (area may not
    // exist on older hosts; register is harmless if unsupported)
    ctx.register({
      id: 'chip',
      area: 'statusBar.right',
      order: 50,
      render: () => jsx(Chip, {})
    })

    // the pane: its own tiling pane on the workspace's right edge
    ctx.register({
      id: 'pane',
      area: 'panes',
      title: 'Hermes Lot Map',
      data: {
        placement: 'main',
        dock: { pane: 'workspace', pos: 'right' },
        width: '320px',
        tabTitleText: () => 'Hermes Lot Map'
      },
      render: () => jsx(LotMapPane, { motionPref })
    })

    // Settings ▸ Plugins ▸ Hermes Lot Map (feature-detected for older hosts)
    ctx.registerSettingsPage?.({
      id: 'motion',
      title: 'Hermes Lot Map',
      render: function MotionSettings() {
        const prefs = useValue(motionPref)
        const reduced = prefs.motion === 'reduced'
        return jsxs('div', {
          style: { padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
          children: [
            jsx('button', {
              onClick: () => saveMotion(reduced ? 'full' : 'reduced'),
              style: {
                alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid var(--ui-stroke-tertiary, #334155)',
                background: 'var(--ui-surface-2, transparent)',
                color: 'var(--ui-text-primary, inherit)', fontSize: 12
              },
              children: reduced ? 'Motion: reduced (click for full)' : 'Motion: full (click for reduced)'
            }, 'btn'),
            jsx('div', {
              style: { fontSize: 11, color: TERT },
              children: 'Reduced motion keeps the map static: stations light up and fade, nothing flies.'
            }, 'hint')
          ]
        })
      }
    })
  }
}
