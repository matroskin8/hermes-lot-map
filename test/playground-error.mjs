import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const html = readFileSync(new URL('../debug/map-debug.html', import.meta.url), 'utf8')
let worker
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(window) {
  window.URL.createObjectURL = () => 'blob:stub'
  window.URL.revokeObjectURL = () => {}
  window.Worker = class { constructor() { worker = this } postMessage() {} terminate() {} }
}})
const { document, Event } = dom.window
const from = document.querySelector('#from'), to = document.querySelector('#to')
from.value = 'hermes'; to.value = 'web'; to.dispatchEvent(new Event('change'))
document.querySelector('#send').click()
worker.onerror(new Event('error'))
await new Promise(resolve => setTimeout(resolve, 0))
const status = document.querySelector('#status')
assert.match(status.textContent, /ошибк/i, 'worker failure is visible')
to.dispatchEvent(new Event('change'))
assert.match(status.textContent, /ошибк/i, 'refresh does not erase failure')
document.querySelector('#send').click()
assert.doesNotMatch(status.textContent, /ошибк/i, 'retry clears old failure')
worker.onerror(new Event('error'))
await new Promise(resolve => setTimeout(resolve, 0))
assert.match(status.textContent, /ошибк/i)
document.querySelector('#reset').click()
assert.doesNotMatch(status.textContent, /ошибк/i, 'reset clears failure')
dom.window.close()
console.log('PASS playground displays route errors, preserves them through refresh, and clears on retry/reset')
