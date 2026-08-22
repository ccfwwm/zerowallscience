import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')

test('stable profile pins rc1 and includes the bundled WeChat plugin', async () => {
  const profile = await readFile(resolve(root, 'profiles/generated/stable.yml'), 'utf8')
  assert.match(profile, /channel: stable/)
  assert.match(profile, /dsh: 0\.1\.1-rc\.1/)
  assert.match(profile, /'@zerowallscience\/plugin-wechat'/)
})

test('all ZeroWall plugins expose a manifest and rc1 range', async () => {
  const names = ['base', 'desktop-compat', 'secrets', 'projects', 'account', 'ai-cloud', 'files', 'images', 'mcp', 'skills', 'reviewer', 'research', 'execution', 'runs', 'publications', 'presentations', 'web-search', 'wechat']
  for (const name of names) {
    const manifest = JSON.parse(await readFile(resolve(root, `plugins/${name}/zerowall.plugin.json`), 'utf8'))
    assert.match(manifest.name, /^@zerowallscience\/plugin-/)
    assert.equal(manifest.dsh.min, '0.1.1-rc.1')
    assert.equal(manifest.dsh.max, '0.1.1-rc.1')
  }
})

test('dynamic client bundles use the DSH classic-script ModuleLoader contract', async () => {
  for (const name of ['base', 'account', 'projects', 'mcp', 'research', 'reviewer', 'skills', 'wechat']) {
    const bundle = await readFile(resolve(root, `plugins/${name}/lib/client.js`), 'utf8')
    // A bundle carrying styles is prefixed with the inlined-CSS IIFE, so the
    // ModuleLoader handoff is the first statement after that optional prefix.
    const body = bundle.startsWith('(function(){var s=document.createElement(\'style\')')
      ? bundle.slice(bundle.indexOf('\n') + 1)
      : bundle
    assert.match(body, /^window\.__ModuleLoader__\.load\(/u, `${name} client must register with DSH ModuleLoader`)
    assert.doesNotMatch(bundle, /^(?:import|export)\s/m, `${name} client must be a classic script`)
    assert.match(bundle, /factory:\s*\(require\)\s*=>/u, `${name} client must receive module-table dependencies`)
  }
})

test('the plugin template and final repository ownership directories exist', async () => {
  const required = [
    'templates/dsh-plugin/package.json',
    'templates/dsh-plugin/zerowall.plugin.json',
    'templates/dsh-plugin/dsh.bundle.patch.yml',
    'templates/dsh-plugin/src/host/index.ts',
    'templates/dsh-plugin/src/client/index.ts',
    'tools/security/audit-runtime.mjs',
    'tests/integration/README.md',
    'tests/fixtures/README.md',
    'tests/packaging/README.md',
    'tests/e2e/README.md',
  ]
  await Promise.all(required.map(path => access(resolve(root, path))))
})

test('DSH adaptations live in source, not in patch files', async () => {
  await assert.rejects(access(resolve(root, 'patches/dsh')))
  await assert.rejects(access(resolve(root, 'dsh/patches')))
})
