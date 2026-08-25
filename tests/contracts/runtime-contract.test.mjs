import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')

test('stable profile pins rc2 and includes the bundled WeChat plugin', async () => {
  const profile = await readFile(resolve(root, 'profiles/generated/stable.yml'), 'utf8')
  assert.match(profile, /channel: stable/)
  assert.match(profile, /dsh: 0\.1\.1-rc\.2/)
  assert.match(profile, /'@zerowallscience\/plugin-wechat'/)
})

test('better-sidebar is a single pinned default workbench in every profile', async () => {
  const desktop = JSON.parse(await readFile(resolve(root, 'desktop/package.json'), 'utf8'))
  assert.equal(desktop.dependencies['dsh-better-sidebar'], '0.16.0')
  const patch = await readFile(resolve(root, 'desktop/build/zerowall.patch.yml'), 'utf8')
  assert.equal((patch.match(/\bid: better-sidebar\b/gu) ?? []).length, 1)
  for (const profile of ['development', 'preview', 'stable']) {
    const source = await readFile(resolve(root, `profiles/generated/${profile}.yml`), 'utf8')
    assert.equal((source.match(/'dsh-better-sidebar'/gu) ?? []).length, 1, `${profile} must mount better-sidebar once`)
  }
})

test('ZeroWall domain clients do not duplicate better-sidebar tabs', async () => {
  const clients = ['account', 'ai-cloud', 'execution', 'images', 'mcp', 'presentations', 'projects', 'publications', 'research', 'reviewer', 'runs', 'skills', 'web-search', 'wechat']
  for (const name of clients) {
    const source = await readFile(resolve(root, `plugins/${name}/src/client/index.ts`), 'utf8')
    assert.doesNotMatch(source, /registerDomainSidebarTab/u, `${name} must not register a duplicate domain tab`)
    assert.doesNotMatch(source, new RegExp(`id:\\s*'zerowall:${name}'`, 'u'), `${name} must not expose the removed domain tab`)
  }
})

test('desktop patch keeps the structured question composer enabled', async () => {
  const patch = await readFile(resolve(root, 'desktop/build/zerowall.patch.yml'), 'utf8')
  assert.match(patch, /- id: ui-user-questions\s+disabled: false/u)
})

test('desktop image limits fit inside the buffered client connection carrier', async () => {
  const patch = await readFile(resolve(root, 'desktop/build/zerowall.patch.yml'), 'utf8')
  const readLimit = (name) => {
    const match = new RegExp(`\\b${name}:\\s*(\\d+)`, 'u').exec(patch)
    assert.ok(match, `desktop patch must declare ${name}`)
    return Number(match[1])
  }
  const maxImageBytes = readLimit('maxImageBytes')
  const maxMessageImageBytes = readLimit('maxMessageImageBytes')
  const maxRequestBodyBytes = readLimit('maxRequestBodyBytes')
  const requiredBodyBytes = Math.ceil(maxMessageImageBytes * 4 / 3) + 1024 * 1024

  assert.ok(maxMessageImageBytes >= maxImageBytes, 'aggregate image limit must fit at least one image')
  assert.ok(requiredBodyBytes <= maxRequestBodyBytes,
    `base64 image envelope requires ${requiredBodyBytes} bytes but carrier allows ${maxRequestBodyBytes}`)
})

test('all ZeroWall plugins expose a manifest and rc2 range', async () => {
  const names = ['base', 'opencode', 'desktop-compat', 'secrets', 'projects', 'account', 'ai-cloud', 'files', 'images', 'mcp', 'skills', 'reviewer', 'research', 'execution', 'runs', 'publications', 'presentations', 'web-search', 'wechat']
  for (const name of names) {
    const manifest = JSON.parse(await readFile(resolve(root, `plugins/${name}/zerowall.plugin.json`), 'utf8'))
    assert.match(manifest.name, /^@zerowallscience\/plugin-/)
    assert.equal(manifest.dsh.min, '0.1.1-rc.2')
    assert.equal(manifest.dsh.max, '0.1.1-rc.2')
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

test('DSH build adaptations are not stored as patch files', async () => {
  await assert.rejects(access(resolve(root, 'patches/dsh')))
  await assert.rejects(access(resolve(root, 'dsh/patches')))
  await access(resolve(root, 'tools/dsh/build-zerowall.mjs'))
})
