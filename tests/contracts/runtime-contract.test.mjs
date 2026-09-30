import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

const root = resolve(import.meta.dirname, '../..')
const { parse: parseYaml } = createRequire(resolve(root, 'deepseek-harness/packages/settings/settings/package.json'))('yaml')

test('stable profile pins rc.2 and includes the bundled WeChat plugin', async () => {
  const profile = await readFile(resolve(root, 'profiles/generated/stable.yml'), 'utf8')
  assert.match(profile, /channel: stable/)
  assert.match(profile, /dsh: 0\.2\.0-rc\.2/)
  assert.match(profile, /'dsh-wechat'/)
})

test('better-sidebar is a single pinned default workbench in every profile', async () => {
  const desktop = JSON.parse(await readFile(resolve(root, 'desktop/package.json'), 'utf8'))
  assert.equal(desktop.dependencies['dsh-better-sidebar'], 'workspace:^')
  const patch = await readFile(resolve(root, 'desktop/build/zerowall.patch.yml'), 'utf8')
  assert.equal((patch.match(/^\s*- id: better-sidebar\s*$/gmu) ?? []).length, 1)
  for (const profile of ['development', 'preview', 'stable']) {
    const source = await readFile(resolve(root, `profiles/generated/${profile}.yml`), 'utf8')
    assert.equal((source.match(/'dsh-better-sidebar'/gu) ?? []).length, 1, `${profile} must mount better-sidebar once`)
  }
})

test('better-sidebar contains the merged v0.24.1 compatibility changes', async () => {
  const editor = await readFile(resolve(root, 'packages/dsh-better-sidebar/src/client/EditorHost.tsx'), 'utf8')
  const tree = await readFile(resolve(root, 'packages/dsh-better-sidebar/src/client/FileTree.tsx'), 'utf8')
  const sidechat = await readFile(resolve(root, 'packages/dsh-better-sidebar/src/client/SideChatView.tsx'), 'utf8')
  assert.match(editor, /reloadSeq/u)
  assert.match(editor, /useSyncExternalStore/u)
  assert.match(tree, /refreshTick/u)
  assert.match(tree, /onUploadRequest/u)
  assert.match(sidechat, /sideThreadRows/u)
})

test('Dream Skin is a single pinned theme layer loaded before ZeroWall UI', async () => {
  const desktop = JSON.parse(await readFile(resolve(root, 'desktop/package.json'), 'utf8'))
  assert.equal(desktop.dependencies['dsh-dream-skin'], '9.29.0')
  const patch = await readFile(resolve(root, 'desktop/build/zerowall.patch.yml'), 'utf8')
  assert.equal((patch.match(/\bid: dream-skin\b/gu) ?? []).length, 1)
  assert.ok(patch.indexOf('id: dream-skin') < patch.indexOf('id: better-sidebar'))
  for (const profile of ['development', 'preview', 'stable']) {
    const source = await readFile(resolve(root, `profiles/generated/${profile}.yml`), 'utf8')
    assert.equal((source.match(/'dsh-dream-skin'/gu) ?? []).length, 1, `${profile} must mount Dream Skin once`)
  }
})

test('Dream Skin first run uses iOS Flat without a wallpaper and retains only the abstract legacy fingerprint', async () => {
  const source = await readFile(resolve(root, 'desktop/node_modules/dsh-dream-skin/lib/client.js'), 'utf8')
  const defaults = source.match(/const FACTORY_DEFAULTS = \{([\s\S]*?)\n\t\t\};/u)?.[1]
  assert.ok(defaults, 'Dream Skin factory defaults must be present')
  assert.match(defaults, /\[STORAGE_KEY\]: "nebula"/u)
  assert.match(defaults, /\[WALLPAPER_KIND_KEY\]: "image"/u)
  assert.match(source, /\bid: "ivory",\s*colorScheme: "light"/u)
  assert.match(source, /"skin\.ivory": "iOS Flat"/u)
  assert.match(source, /FACTORY_DEFAULTS\[STORAGE_KEY\] = "ivory"/u)
  assert.match(source, /FACTORY_DEFAULTS\[WALLPAPER_KEY\] = ""/u)
  assert.match(source, /FACTORY_DEFAULTS\[WALLPAPER_GRADIENT_KEY\] = ""/u)
  assert.match(source, /function migrateLegacyFactoryAppearance\(\)/u)
  assert.match(source, /const legacyHostFactory = parsed\.value\[STORAGE_KEY\] === LEGACY_FACTORY_SKIN/u)
  const encoded = defaults.match(/\[WALLPAPER_KEY\]: "data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)"/u)?.[1]
  assert.ok(encoded, 'legacy factory wallpaper fingerprint must be the abstract SVG')
  const svg = Buffer.from(encoded, 'base64').toString('utf8')
  assert.match(svg, /^<svg\b/u)
  assert.match(svg, /<radialGradient\b/u)
  assert.doesNotMatch(svg, /<(?:path|image|text|use|foreignObject)\b/iu)
})

test('ZeroWall domain clients do not duplicate better-sidebar tabs', async () => {
  const clients = ['account', 'ai-cloud', 'execution', 'images', 'mcp', 'projects', 'publications', 'research', 'reviewer', 'runs', 'skills', 'wechat']
  for (const name of clients) {
    const source = await readFile(resolve(root, `plugins/${name}/src/client/index.ts`), 'utf8')
    assert.doesNotMatch(source, /registerDomainSidebarTab/u, `${name} must not register a duplicate domain tab`)
    assert.doesNotMatch(source, new RegExp(`id:\\s*'zerowall:${name}'`, 'u'), `${name} must not expose the removed domain tab`)
  }
})

test('domain clients declare conversation when they access the composer service', async () => {
  for (const name of ['images']) {
    const manifest = JSON.parse(await readFile(resolve(root, `plugins/${name}/package.json`), 'utf8'))
    assert.ok(manifest.dsh.client.inject.includes('conversation'), `${name} client must inject conversation`)
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

test('all ZeroWall plugins expose a manifest and rc.2 range', async () => {
  const names = ['base', 'desktop-compat', 'secrets', 'environment', 'mineru', 'projects', 'account', 'ai-cloud', 'files', 'images', 'mcp', 'skills', 'reviewer', 'research', 'execution', 'python', 'runs', 'publications', 'singlecell']
  for (const name of names) {
    const manifest = JSON.parse(await readFile(resolve(root, `plugins/${name}/zerowall.plugin.json`), 'utf8'))
    assert.match(manifest.name, /^@zerowallscience\/plugin-/)
    assert.equal(manifest.dsh.min, '0.2.0-rc.2')
    assert.equal(manifest.dsh.max, '0.2.0-rc.2')
  }
})

test('dsh-free-search directly replaces the removed ZeroWall search plugin', async () => {
  const desktop = JSON.parse(await readFile(resolve(root, 'desktop/package.json'), 'utf8'))
  assert.equal(desktop.dependencies['dsh-free-search'], '0.6.0')
  assert.equal(desktop.dependencies['@zerowallscience/plugin-web-search'], undefined)

  const patch = await readFile(resolve(root, 'desktop/build/zerowall.patch.yml'), 'utf8')
  assert.match(patch, /- id: web\s+config:\s+searchProvider: ddg\s+fetchProvider: http/u)
  assert.doesNotMatch(patch, /- id: web-search-free/u) // the official profile bundle owns mutable provider settings
  assert.doesNotMatch(patch, /zerowall-ai-cloud-search|@zerowallscience\/plugin-web-search/u)

  for (const profile of ['development', 'preview', 'stable']) {
    const source = await readFile(resolve(root, `profiles/generated/${profile}.yml`), 'utf8')
    assert.equal((source.match(/'dsh-free-search'/gu) ?? []).length, 1, `${profile} must mount dsh-free-search once`)
    assert.doesNotMatch(source, /@zerowallscience\/plugin-web-search/u)
  }
})

test('the pinned dsh-free-search package uses current client services and has no self-updater', async () => {
  const packageRoot = resolve(root, 'desktop/node_modules/dsh-free-search')
  const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'))
  assert.equal(manifest.version, '0.6.0')
  assert.equal(manifest.license, 'MIT')
  assert.deepEqual(manifest.dsh.client.inject, [
    '@deepseek-ai/dsh-client-ui-commands',
    '@deepseek-ai/dsh-client-ui-plugin-manager',
    '@deepseek-ai/dsh-client-ui-renderer',
  ])

  const host = await readFile(resolve(packageRoot, 'lib/index.js'), 'utf8')
  const client = await readFile(resolve(packageRoot, 'lib/client.js'), 'utf8')
  assert.doesNotMatch(`${host}\n${client}`, /@deepseek-ai\/dsh-client-runtime/u)
  for (const marker of ['advanced_search', 'platform_search', 'free_search_test']) assert.match(host, new RegExp(marker, 'u'))
  assert.match(client, /const inject = \["slots",\s*"commandUi"\]/u)
  assert.match(client, /ctx\.inject\(\["commandUi"\]/u)
  assert.match(client, /free-search-engine/u)

  const lockfile = parseYaml(await readFile(resolve(root, 'pnpm-lock.yaml'), 'utf8'))
  assert.equal(lockfile.packages['dsh-free-search@0.6.0'].resolution.integrity,
    'sha512-pAxhN4mVr2UpADCS/qQiJpVOco7aPD0640mYaIh2QatIrryMcsLvSds0dpimpqr+0+qYcQ9F8+BInkAVV3t5ow==')
})

test('About remains the final Settings navigation section', async () => {
  const source = await readFile(resolve(root, 'plugins/base/src/client/index.ts'), 'utf8')
  assert.match(source, /id: 'zerowall-about', order: Number\.MAX_SAFE_INTEGER/u)
})

test('retired OpenCode free provider is absent from runtime configuration', async () => {
  const desktop = JSON.parse(await readFile(resolve(root, 'desktop/package.json'), 'utf8'))
  assert.equal(desktop.dependencies['@jiesou/dsh-opencode-zen-free-provider'], undefined)
  for (const path of ['desktop/build/zerowall.patch.yml', 'profiles/generated/development.yml', 'profiles/generated/preview.yml', 'profiles/generated/stable.yml', 'config/deepseek-harness/plugin-inventory.json', 'pnpm-lock.yaml']) {
    assert.doesNotMatch(await readFile(resolve(root, path), 'utf8'), /opencode-zen-free-provider|opencode2dsh/u)
  }
})

test('dynamic client bundles use the DSH classic-script ModuleLoader contract', async () => {
  const bundles = [
    ...['base', 'account', 'projects', 'mcp', 'research', 'reviewer', 'skills']
      .map(name => [name, `plugins/${name}/lib/client.js`]),
    ['wechat', 'packages/dsh-wechat/dist/client.js'],
  ]
  for (const [name, relativePath] of bundles) {
    const bundle = await readFile(resolve(root, relativePath), 'utf8')
    // Bundles may carry comments or an inlined-CSS prefix before the loader
    // handoff. The registration itself remains a classic script contract.
    const loader = 'window.__ModuleLoader__.load('
    const loaderIndex = bundle.indexOf(loader)
    assert.notEqual(loaderIndex, -1, `${name} client must register with DSH ModuleLoader`)
    const body = bundle.slice(loaderIndex)
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
