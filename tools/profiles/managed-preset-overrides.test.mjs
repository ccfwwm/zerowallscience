import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { renderManagedPresetOverrides } from './managed-preset-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))

function findPlugin(plugins, id) {
  for (const plugin of plugins) {
    if (plugin?.id === id) return plugin
    if (Array.isArray(plugin?.config)) {
      const nested = findPlugin(plugin.config, id)
      if (nested) return nested
    }
  }
  return undefined
}

test('managed Agent preset overrides preserve upstream plugin rosters and set the effective read window', async () => {
  const rendered = await renderManagedPresetOverrides(root)
  assert.match(rendered, /BEGIN GENERATED MANAGED AGENT PRESET OVERRIDES/u)
  assert.match(rendered, /readLimit: 200/u)
  assert.match(rendered, /readMaxBytes: 16000/u)
  const expressions = new Map()
  const document = rendered.slice(rendered.indexOf('\n') + 1, rendered.lastIndexOf('\n'))
  const rows = parse(document, { customTags: [{
    tag: 'tag:yaml.org,2002:js',
    resolve(value) { const token = `PARSED_EXPR_${expressions.size}`; expressions.set(token, value); return token },
  }] })
  for (const expression of expressions.values()) {
    assert.doesNotThrow(() => new Function('process', `return (${expression})`), `valid generated JS expression: ${expression}`)
  }

  for (const id of ['standard', 'ptc', 'cordis', 'minimal']) {
    const source = await readFile(new URL(`../../deepseek-harness/packages/bundle/web-app/presets/${id}.patch.yml`, import.meta.url), 'utf8')
    const original = parse(source, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] })
    const override = rows.find(row => row.id === `preset-${id}`)
    const plugins = override?.config?.plugins
    assert.ok(Array.isArray(plugins), `${id} plugin roster is present`)
    assert.equal(plugins.length, original[0].insert[0].config.plugins.length, `${id} roster stays complete`)
    assert.deepEqual(plugins.find(plugin => plugin.id === 'tool-fs')?.config, {
      ...(original[0].insert[0].config.plugins.find(plugin => plugin.id === 'tool-fs')?.config ?? {}),
      readLimit: 200,
      readMaxBytes: 16000,
    })
    assert.equal(plugins.some(plugin => plugin.id === 'tool-skill'), id !== 'minimal')
    const terminal = findPlugin(plugins, 'terminal-pwsh')
    assert.equal(Boolean(terminal), id === 'minimal', `${id} preserves its upstream persistent-shell roster`)
    if (terminal) {
      const startup = expressions.get(terminal.config.shellArgs)
      assert.match(startup ?? '', /ZEROWALL_PYTHON_EXECUTABLE/u)
      assert.match(startup ?? '', /PYTHON_ENVIRONMENT_UNAVAILABLE/u)
      assert.match(startup ?? '', /\$env:PATH = \$root/u)
      const args = new Function('process', `return (${startup})`)({ platform: 'win32' })
      assert.deepEqual(args.slice(0, 4), ['-NoLogo', '-NoProfile', '-NoExit', '-Command'])
      assert.match(args[4], /\$ErrorActionPreference = 'Stop'/u)
    }
  }
  assert.ok(expressions.size > 0, 'dynamic upstream rows remain parsed as inert !!js values')
})
