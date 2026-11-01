import { readFile, writeFile } from 'node:fs/promises'
import { parse, stringify } from 'yaml'

const startMarker = '# BEGIN GENERATED MANAGED AGENT PRESET OVERRIDES'
const endMarker = '# END GENERATED MANAGED AGENT PRESET OVERRIDES'
const presetIds = ['standard', 'ptc', 'cordis', 'minimal']
const PWSH_RUNTIME_ARGS_TOKEN = 'ZWS_MANAGED_PWSH_RUNTIME_ARGS'
const PWSH_RUNTIME_COMMAND = `$ErrorActionPreference = 'Stop'; $exe = $env:ZEROWALL_PYTHON_EXECUTABLE; if (-not $exe -or -not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'PYTHON_ENVIRONMENT_UNAVAILABLE: the bundled ZeroWall Python runtime is not ready.' }; $root = Split-Path -Parent $exe; $scripts = Join-Path $root 'Scripts'; $env:PATH = $root + ';' + $scripts + ';' + $env:PATH; function global:python { $exe = $env:ZEROWALL_PYTHON_EXECUTABLE; if (-not $exe -or -not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'PYTHON_ENVIRONMENT_UNAVAILABLE: the bundled ZeroWall Python runtime is not ready.' }; & $exe @args }; function global:python3 { python @args }; function global:pip { python -m pip @args }; function global:pip3 { python -m pip @args }`
const PWSH_RUNTIME_ARGS = `process.platform === 'win32' ? ${JSON.stringify(['-NoLogo', '-NoProfile', '-NoExit', '-Command', PWSH_RUNTIME_COMMAND])} : []`

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

/** Read upstream !!js values as inert strings so generation never evaluates configuration code. */
async function readPreset(root, id) {
  const source = await readFile(`${root}/deepseek-harness/packages/bundle/web-app/presets/${id}.patch.yml`, 'utf8')
  const expressions = new Map()
  let index = 0
  const customTags = [{
    tag: 'tag:yaml.org,2002:js',
    resolve(value) {
      const token = `ZWS_JS_EXPR_${id}_${index++}`
      expressions.set(token, value)
      return token
    },
  }]
  const parsed = parse(source, { customTags })
  const preset = parsed?.[0]?.insert?.find(row => row?.id === `preset-${id}`)
  if (!preset || preset.name !== '@deepseek-ai/dsh-agent-preset' || !Array.isArray(preset.config?.plugins)) {
    throw new Error(`Pinned DSH ${id} preset has an unexpected shape`)
  }
  return { preset, expressions }
}

/** Override nested Agent-scope tool config while preserving the full pinned preset plugin roster. */
export async function renderManagedPresetOverrides(root) {
  const outputRows = []
  const expressions = new Map()
  for (const id of presetIds) {
    const parsed = await readPreset(root, id)
    for (const [token, expression] of parsed.expressions) expressions.set(token, expression)
    const plugins = parsed.preset.config.plugins
    const fs = plugins.find(plugin => plugin?.id === 'tool-fs')
    if (!fs || fs.name !== '@deepseek-ai/dsh-tool-fs') throw new Error(`Pinned DSH ${id} preset is missing the expected tool-fs plugin`)
    fs.config = { ...(fs.config ?? {}), readLimit: 200, readMaxBytes: 16000 }
    const terminal = findPlugin(plugins, 'terminal-pwsh')
    if (terminal) {
      if (terminal.name !== '@deepseek-ai/dsh-terminal-bash') throw new Error(`Pinned DSH ${id} preset has an unexpected terminal-pwsh provider`)
      terminal.config = { ...(terminal.config ?? {}), shellArgs: PWSH_RUNTIME_ARGS_TOKEN }
      expressions.set(PWSH_RUNTIME_ARGS_TOKEN, PWSH_RUNTIME_ARGS)
    }
    outputRows.push({ id: parsed.preset.id, name: parsed.preset.name, config: parsed.preset.config })
  }
  let yaml = stringify(outputRows, { lineWidth: 0, indent: 2 })
  for (const [token, expression] of expressions) yaml = yaml.replaceAll(token, `!!js ${JSON.stringify(expression)}`)
  return `${startMarker}\n${yaml.trimEnd()}\n${endMarker}`
}

/** Keep the source patch readable while refreshing only the generated preset block. */
export async function syncManagedPresetOverrides(root, check = false) {
  const path = `${root}/desktop/build/zerowall.patch.yml`
  const current = await readFile(path, 'utf8')
  const generated = await renderManagedPresetOverrides(root)
  const start = current.indexOf(startMarker)
  const end = current.indexOf(endMarker)
  if ((start < 0) !== (end < 0) || (start >= 0 && end < start)) throw new Error('Managed preset override markers are malformed')
  const prefix = start < 0 ? current.trimEnd() : current.slice(0, start).trimEnd()
  const suffix = end < 0 ? '' : current.slice(end + endMarker.length).trimStart()
  const next = `${prefix}\n\n${generated}${suffix ? `\n\n${suffix}` : '\n'}`
  if (check) {
    if (current !== next) throw new Error(`Generated Agent preset overrides are stale: ${path}`)
  } else if (current !== next) await writeFile(path, next)
}
