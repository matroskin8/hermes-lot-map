import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const tests = ['build-shared.mjs', 'check-shared-overlay.mjs', 'harness.mjs', 'overlay-clock.mjs', 'orbit-regression.mjs', 'worker-failures.mjs', 'production-routes.mjs', 'dom-harness.mjs', 'render-harness.mjs', 'lifecycle-dom.mjs', 'playground-error.mjs', 'codex-return.mjs']
for (const test of tests) {
  console.log(`\n--- ${test} ---`)
  const result = spawnSync(process.execPath, [`test/${test}`, ...(test === 'build-shared.mjs' ? ['--check'] : [])], { cwd: root, env: { ...process.env, HERMES_DESKTOP_DIR: root, JSDOM_PATH: 'jsdom' }, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
