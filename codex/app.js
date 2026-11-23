(() => {
  const map = document.getElementById('map')
  const feed = document.getElementById('feed')
  const select = document.getElementById('session')
  const state = document.getElementById('state')
  const source = document.getElementById('source')
  const params = new URLSearchParams(location.search)
  const stations = new Set(['you', 'model', 'memory', 'files', 'shell', 'web', 'browser', 'agents', 'skills', 'hooks'])
  const setup = LotMapSetup.setupFrom({ coreName: 'CODEX', motion: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full' })
  let current = null
  let overlay = null
  let lastSession = ''
  let routeError = false

  function boardOf(session) {
    const entries = []
    const counts = {}
    const faults = {}
    for (const event of session.events || []) {
      if (!stations.has(event.station)) continue
      const startedAt = Date.parse(event.time)
      if (!Number.isFinite(startedAt)) continue
      const endedAt = event.completed ? Date.parse(event.completed) : undefined
      const status = event.status === 'running' ? 'run' : event.status === 'error' ? 'err' : event.status === 'unknown' || event.status === 'interrupted' ? 'unknown' : 'ok'
      const from = event.station === 'you' && event.label === 'Message received' ? 'inbound' : 'core'
      entries.push({ id: event.id, station: event.station, label: event.label, from, startedAt, endedAt: Number.isFinite(endedAt) ? endedAt : undefined, status, satellite: true })
      if (event.station !== 'model') counts[event.station] = (counts[event.station] || 0) + 1
      if (status === 'err') faults[event.station] = (faults[event.station] || 0) + 1
    }
    return { entries, counts, faults, model: session.model || undefined, context: session.context ?? undefined, overlayFlights: true }
  }

  function renderFeed(board) {
    feed.replaceChildren()
    for (const event of board.entries.slice(-14).reverse()) {
      const item = document.createElement('li')
      item.className = event.status
      const glyph = document.createElement('span')
      glyph.className = 'glyph'
      glyph.textContent = { run: '●', err: '×', unknown: '?', ok: '·' }[event.status]
      const label = document.createElement('span')
      label.className = 'label'
      const station = document.createElement('span')
      station.className = 'station'
      station.textContent = event.station
      label.append(station, document.createTextNode(event.label))
      const age = document.createElement('span')
      age.className = 'age'
      const duration = (event.endedAt || Date.now()) - event.startedAt
      age.textContent = duration < 1000 ? `${Math.max(0, Math.round(duration))}ms` : `${Math.max(0, duration / 1000).toFixed(1)}s`
      item.append(glyph, label, age)
      feed.append(item)
    }
  }

  function render() {
    if (!current) return
    const board = boardOf(current)
    const now = Date.now()
    const svg = LotMapOriginal.drawMap(board, now, setup)
    updateMap(map, svg)
    if (!overlay && setup.motion !== 'reduced') {
      overlay = LotMapOverlay.create(map.firstElementChild, error => {
        if (error && !routeError) { routeError = true; state.textContent = 'Route calculation failed' }
      })
    }
    if (overlay) {
      for (const event of board.entries) {
        if (event.status !== 'run' && now - (event.endedAt || event.startedAt) > 62000) continue
        overlay.launch({ id: event.id, origin: event.from === 'inbound' ? 'you' : 'hermes', destination: event.from === 'inbound' ? 'hermes' : event.station, startedAt: event.startedAt,
          endedAt: event.endedAt, failed: event.status === 'err', unknown: event.status === 'unknown' })
        if (event.endedAt) overlay.end(event.id, event.endedAt, event.status === 'err', event.status === 'unknown')
      }
    }
    renderFeed(board)
  }

  async function refresh() {
    const id = params.get('session') || ''
    try {
      const response = await fetch(`/api/state?session=${encodeURIComponent(id)}`, { cache: 'no-store' })
      if (!response.ok) throw Error(`HTTP ${response.status}`)
      const data = await response.json()
      const chosen = data.session
      const previous = select.value
      select.replaceChildren()
      for (const session of data.sessions) {
        const option = document.createElement('option')
        option.value = session.id
        option.textContent = `${session.name} · ${session.id.slice(0, 8)}`
        select.append(option)
      }
      select.value = chosen?.id || previous
      if (!chosen) { state.textContent = id ? 'Session not found' : 'No Codex sessions'; current = null; return }
      if (!id) {
        params.set('session', chosen.id)
        history.replaceState(null, '', `${location.pathname}?${params}`)
      }
      if (lastSession !== chosen.id) {
        overlay?.destroy()
        overlay = null
        map.replaceChildren()
        lastSession = chosen.id
        routeError = false
      }
      current = chosen
      state.textContent = routeError ? 'Route calculation failed' : chosen.state === 'working' ? 'Working' : 'Idle'
      source.textContent = chosen.source
      render()
    } catch (error) {
      state.textContent = `Disconnected: ${error.message}`
    }
  }

  select.addEventListener('change', () => {
    params.set('session', select.value)
    history.replaceState(null, '', `${location.pathname}?${params}`)
    refresh()
  })
  setInterval(refresh, 1000)
  setInterval(render, 250)
  refresh()
})()
