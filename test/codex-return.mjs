import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const script = readFileSync(new URL('../codex/app.js', import.meta.url), 'utf8')

async function load(events, name = 'project') {
  const dom = new JSDOM('<div id="map"></div><ol id="feed"></ol><select id="session"></select><div id="state"></div><div id="source"></div>',
    { url: 'http://localhost/?session=test', runScripts: 'outside-only' })
  const { window } = dom
  const ticks = new Map()
  const active = new Map()
  const seen = new Set()
  const ends = []
  let now = 1000
  let currentEvents = events
  window.Date.now = () => now
  window.matchMedia = () => ({ matches: false })
  window.setInterval = (callback, delay) => { ticks.set(delay, callback); return delay }
  window.fetch = async () => ({ ok: true, json: async () => ({
    sessions: [{ id: 'test', name }],
    session: { id: 'test', state: 'working', source: 'test', events: currentEvents },
  }) })
  window.LotMapSetup = { setupFrom: () => ({ motion: 'full' }) }
  window.LotMapOriginal = { drawMap: () => '<svg></svg>' }
  window.updateMap = (host, markup) => { host.innerHTML = markup }
  window.LotMapOverlay = { create: () => ({
    active, seen,
    launch: flight => {
      if (active.has(flight.id) || seen.has(flight.id)) return
      active.set(flight.id, { endedAt: flight.endedAt })
      seen.add(flight.id)
    },
    end: (id, endedAt) => {
      ends.push({ id, endedAt })
      const flight = active.get(id)
      if (flight && flight.endedAt == null) flight.endedAt = endedAt
    },
  }) }
  window.eval(script)
  await new Promise(resolve => setImmediate(resolve))
  return {
    sessionLabel: () => window.document.getElementById('session').selectedOptions[0].textContent,
    fullSessionTitle: () => window.document.getElementById('session').selectedOptions[0].title,
    ends,
    active,
    async update(nextEvents, time) {
      currentEvents = nextEvents
      now = time
      ticks.get(1000)()
      await new Promise(resolve => setImmediate(resolve))
    },
    close: () => window.close(),
  }
}

const running = { id: 'call', station: 'shell', label: 'exec', status: 'running', time: '1970-01-01T00:00:00.000Z' }
const completed = { ...running, status: 'done', completed: '1970-01-01T00:00:02.000Z' }

const live = await load([running])
assert.equal(live.sessionLabel(), 'project')
await live.update([completed], 3000)
assert.equal(live.active.get('call').endedAt, 3000)
assert.deepEqual(live.ends, [{ id: 'call', endedAt: 3000 }])
await live.update([completed], 4000)
assert.equal(live.active.get('call').endedAt, 3000)
live.close()

const historical = await load([completed])
assert.equal(historical.active.get('call').endedAt, 2000)
historical.close()

const longTitle = await load([], 'A'.repeat(90))
assert.equal(longTitle.sessionLabel(), `${'A'.repeat(79)}…`)
assert.equal(longTitle.fullSessionTitle(), 'A'.repeat(90))
longTitle.close()

console.log('PASS Codex completion starts return on observation without replaying history')
