import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const root = resolve(import.meta.dirname, '../..')
const pluginRequire = createRequire(resolve(root, 'plugins/claude-code/package.json'))

test('built Claude client loads through the real module-table entry contract without source imports', () => {
  const source = readFileSync(resolve(root, 'plugins/claude-code/lib/client.js'), 'utf8')
  let registration
  const styles = []
  const sandbox = {
    console,
    document: {
      createElement: () => { const values = new Map(); return { textContent: '', setAttribute: (key, value) => values.set(key, value), getAttribute: key => values.get(key) } },
      querySelectorAll: () => styles,
      head: { appendChild: style => styles.push(style) },
    },
    __ModuleLoader__: { load: value => { registration = value } },
  }
  sandbox.window = sandbox
  runInNewContext(source, sandbox, { filename: 'claude-client.js' })
  assert.equal(styles.length, 1, 'the client module must inject CSS before registration')
  assert.equal(styles[0].getAttribute('data-zerowall-plugin-css'), '@zerowallscience/plugin-claude-code')
  assert.match(styles[0].textContent, /_[\w]+_pill/u)
  assert.match(styles[0].textContent, /pointer-events:\s*auto/u)
  assert.match(styles[0].textContent, /#f3f4f6/u)
  assert.equal(existsSync(resolve(root, 'plugins/claude-code/lib/style.css')), false, 'detached CSS must not remain as an unreferenced package asset')
  assert.equal(registration.id, '@zerowallscience/plugin-claude-code')
  const requested = []
  const exports = registration.factory(id => {
    requested.push(id)
    if (['react', 'react-dom', 'react/jsx-runtime'].includes(id)) return pluginRequire(id)
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return {}
    throw new Error(`Unregistered browser module: ${id}`)
  })
  assert.equal(typeof exports.apply, 'function')
  assert.equal(exports.inject.join(','), 'remote')
  assert(!requested.some(id => id.includes('/src/')))
})
