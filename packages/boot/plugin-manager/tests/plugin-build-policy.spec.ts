/** Desktop defaults retain user decisions and leave unreviewed scripts blocked by real pnpm. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { parse } from 'yaml'
import { expect, it, onTestFinished } from 'vitest'
import { configureBusinessRuntime } from '../src/business-runtime.ts'
import { ensurePluginBuildDefaults } from '../src/plugin-build-policy.ts'
import { runProfilePnpm } from '../src/operations.ts'

function fixture(text?: string) {
  const root = mkdtempSync(join(tmpdir(), 'plugin-build-policy-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  const path = join(root, 'pnpm-workspace.yaml')
  if (text !== undefined) writeFileSync(path, text)
  return { root, path }
}

it('preserves explicit build decisions, registry, overrides and comments while adding missing defaults once', () => {
  const { root, path } = fixture('# user settings\nregistry: https://example.test\noverrides: { custom: "1.0.0" }\nallowBuilds:\n  ssh2: true\n  custom: false\n')
  ensurePluginBuildDefaults(root)
  const result = readFileSync(path, 'utf8')
  expect(result).toContain('# user settings')
  expect(parse(result)).toMatchObject({ registry: 'https://example.test', overrides: { custom: '1.0.0' },
    allowBuilds: { ssh2: true, custom: false, 'cpu-features': false, '@google/genai': false, protobufjs: false } })
  ensurePluginBuildDefaults(root)
  expect(readFileSync(path, 'utf8')).toBe(result)
})

it('leaves a missing workspace file to the profile initializer', () => {
  const { root, path } = fixture()
  ensurePluginBuildDefaults(root)
  expect(existsSync(path)).toBe(false)
})

it('adds the policy when the existing workspace has no build settings', () => {
  const { root, path } = fixture('packages: [.]\n')
  ensurePluginBuildDefaults(root)
  expect(parse(readFileSync(path, 'utf8'))).toMatchObject({ packages: ['.'], allowBuilds: { ssh2: false, 'cpu-features': false } })
})

it('fills undecided placeholders and preserves version-specific user permissions', () => {
  const { root, path } = fixture('allowBuilds:\n  cpu-features: null\n  ssh2@1.17.0: true\n')
  ensurePluginBuildDefaults(root)
  expect(parse(readFileSync(path, 'utf8'))).toMatchObject({ allowBuilds: {
    'cpu-features': false, 'ssh2@1.17.0': true, '@google/genai': false, protobufjs: false,
  } })
})

it.each(['[broken', '[]\n', 'allowBuilds: []\n', 'allowBuilds: &builds { custom: true }\n', 'base: &builds { custom: true }\nallowBuilds: *builds\n'])(
  'refuses unsafe workspace settings without rewriting them: %s', (text) => {
    const { root, path } = fixture(text)
    expect(() => { ensurePluginBuildDefaults(root) }).toThrow()
    expect(readFileSync(path, 'utf8')).toBe(text)
  },
)

it.each([false, true])('real pnpm accepts reviewed optional scripts and blocks an unknown build (%s)', async (unknown) => {
  const { root } = fixture()
  const dependencies: Record<string, string> = {}
  for (const name of ['@google/genai', 'protobufjs', 'cpu-features', 'ssh2', ...unknown ? ['unreviewed-native'] : []]) {
    const directory = join(root, 'fixtures', name)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', scripts: { install: 'node install.cjs' } }))
    writeFileSync(join(directory, 'install.cjs'), "require('node:fs').writeFileSync('built.txt', 'executed')\n")
    dependencies[name] = `file:./fixtures/${name}`
  }
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'policy-fixture', private: true, dependencies }))
  configureBusinessRuntime(root, [])
  const require = createRequire(new URL('../../../../apps/desktop/package.json', import.meta.url))
  const run = await runProfilePnpm({ profile: 'test', dir: root, installAnchor: join(root, 'package.json'), cwd: root },
    ['install', '--offline', '--config.minimum-release-age=0'], {
      command: process.execPath, args: [join(dirname(require.resolve('pnpm')), 'bin/pnpm.mjs')], execution: 'service', outputBytes: 16_384,
      idleTimeoutMs: 30_000,
    })
  expect(run.exitCode, run.output).toBe(unknown ? 1 : 0)
  if (unknown) expect(run.output).toContain('unreviewed-native')
  for (const name of Object.keys(dependencies)) expect(existsSync(join(root, 'node_modules', name, 'built.txt'))).toBe(false)
})
