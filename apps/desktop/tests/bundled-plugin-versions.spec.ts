/** Packaging checks loaded plugin versions instead of trusting source pins. */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { verifyBundledPluginVersions } from '../scripts/bundled-plugin-versions.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture(version = '1.2.3', dsh = '>=0.2.2-rc.1') {
  const root = mkdtempSync(join(tmpdir(), 'bundled-plugins-')); roots.push(root)
  const modules = join(root, 'node_modules')
  const put = (name: string, manifest: object) => {
    const directory = join(modules, name); mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, ...manifest }))
    return directory
  }
  put('@deepseek-ai/dsh', { version: '0.2.2-rc.1' })
  put('@deepseek-ai/dsh-desktop-host', { version: '0.2.2-rc.1' })
  const science = put('@zerowall/dsh-bundle-science', { dependencies: { 'test-plugin': '1.2.3' }, zerowall: { defaultBundles: ['test-plugin'] } })
  const plugin = put('test-plugin', { version, engines: { dsh }, exports: './index.js' })
  writeFileSync(join(plugin, 'index.js'), '')
  const host = join(root, 'host.json'), output = join(root, 'bundled-plugins.json')
  writeFileSync(host, JSON.stringify({ dependencies: { 'test-plugin': '1.2.3' } }))
  return { modules, host, output, science, plugin }
}

it('records the dependency actually resolved by both consumers when package.json is not exported', () => {
  const f = fixture()
  expect(verifyBundledPluginVersions(f.modules, f.host, f.output)).toEqual({ 'test-plugin': '1.2.3' })
  expect(JSON.parse(readFileSync(f.output, 'utf8'))).toEqual({ schema: 1, dsh: '0.2.2-rc.1', plugins: { 'test-plugin': '1.2.3' } })
})

it.each([['1.2.2', '>=0.2.2-rc.1', 'mismatch'], ['1.2.3', '>=99.0.0', 'does not support']])(
  'rejects materialized version %s with DSH range %s', (version, dsh, failure) => {
    const f = fixture(version, dsh)
    expect(() => verifyBundledPluginVersions(f.modules, f.host, f.output)).toThrow(failure)
  },
)

it('rejects conflicting Host and Science pins before producing a manifest', () => {
  const f = fixture()
  writeFileSync(join(f.science, 'package.json'), JSON.stringify({ dependencies: { 'test-plugin': '1.2.4' }, zerowall: { defaultBundles: ['test-plugin'] } }))
  expect(() => verifyBundledPluginVersions(f.modules, f.host, f.output)).toThrow('pins differ')
})

it('rejects DSH peer requirements that the runtime would skip without an engines.dsh field', () => {
  const f = fixture()
  writeFileSync(join(f.plugin, 'package.json'), JSON.stringify({ name: 'test-plugin', version: '1.2.3',
    exports: './index.js', peerDependencies: { '@deepseek-ai/dsh-session': '^0.2.2-rc.2' } }))
  expect(() => verifyBundledPluginVersions(f.modules, f.host, f.output)).toThrow('does not support')
})

it('records dependency versions without admitting them as selected profile bundles', () => {
  const f = fixture('1.2.3', '>=99.0.0')
  writeFileSync(join(f.science, 'package.json'), JSON.stringify({ dependencies: { 'test-plugin': '1.2.3' }, zerowall: { defaultBundles: [] } }))
  expect(verifyBundledPluginVersions(f.modules, f.host, f.output)).toEqual({ 'test-plugin': '1.2.3' })
})
