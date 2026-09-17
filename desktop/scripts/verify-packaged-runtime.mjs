import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractFile, listPackage } from '@electron/asar'
import { chromium } from 'playwright'
import { locatePackagedApp } from './packaged-app.mjs'
import { verifySettingsLocales } from './verify-settings-locales.mjs'

const hostCookies = new Map()
const MIB = 1024 * 1024
const packageRoot = resolve(import.meta.dirname, '..')
const repositoryRoot = resolve(packageRoot, '..')
const pinnedUpstream = JSON.parse(await readFile(resolve(repositoryRoot, 'config', 'deepseek-harness', 'upstream.json'), 'utf8'))
const pinnedIntegrations = JSON.parse(await readFile(resolve(repositoryRoot, 'config', 'integrations', 'upstream-sources.json'), 'utf8'))
const desktopManifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'))
const desktopOnly = process.argv.includes('--desktop-only')
const hostOnly = process.argv.includes('--host-only')

if (process.argv.includes('--audit-source')) {
  await verifySourceRuntimePolicy()
  console.log(`ZeroWall source runtime policy verified for DSH ${pinnedUpstream.version} and iLink-only WeChat.`)
  process.exit(0)
}

const packaged = await locatePackagedApp(packageRoot)
const asarPath = resolve(packaged.resourcesRoot, 'app.asar')
await access(asarPath)

const archiveEntries = listPackage(asarPath, { isPack: false })
const archiveFiles = archiveEntries.map(normalizeArchivePath)
const archiveEntryByPath = new Map(archiveEntries.map(entry => [normalizeArchivePath(entry), entry.replace(/^[/\\]+/, '')]))
const archiveSet = new Set(archiveFiles)
if (archiveFiles.some(path => path.includes('node_modules/@fylar/'))) {
  throw new Error('Excluded commercial Fylar Office SDK found in the packaged runtime.')
}
if (archiveFiles.some(path => path.startsWith('node_modules/@daweifu/capability-menu/'))) {
  throw new Error('Removed capability-menu module is still in the packaged runtime.')
}
for (const retired of ['@zerowallscience/plugin-opencode', 'dsh-opencode-zen-free-provider', '@zerowallscience/plugin-image-dup', '@zerowallscience/plugin-presentations', '@zerowallscience/presentations-runtime']) {
  if (archiveFiles.some(path => path.startsWith(`node_modules/${retired}/`))) {
    throw new Error(`Retired module is still in the packaged runtime: ${retired}`)
  }
}
const packagedManifest = JSON.parse(readArchiveFile('package.json').toString('utf8'))
for (const entry of ['out/main/index.js', 'out/preload/index.cjs']) {
  if (!readArchiveFile(entry).equals(await readFile(resolve(packageRoot, entry)))) {
    throw new Error(`Packaged ${entry} differs from the completed desktop build. Rebuild before packaging.`)
  }
}
const requiredArchivePaths = [
  'node_modules/@dsh-external/zotero-harvest/lib/index.js',
  'node_modules/@dsh-external/zotero-harvest/lib/save/local-api.js',
  'node_modules/@dsh-external/zotero-harvest/LICENSE',
  'node_modules/dsh-zotero/lib/index.js',
  'node_modules/dsh-zotero/lib/client.js',
  'node_modules/dsh-zotero/lib/item-graph.js',
  'node_modules/dsh-zotero/lib/local/detail.js',
  'node_modules/dsh-zotero/cordis.patch.yml',
  'node_modules/dsh-zotero/LICENSE',
  'node_modules/dsh-ssh-ops/lib/index.js',
  'node_modules/dsh-ssh-ops/lib/client.js',
  'node_modules/dsh-ssh-ops/lib/typert.js',
  'node_modules/dsh-ssh-ops/cordis.patch.yml',
  'node_modules/dsh-progressive-tools/lib/index.js',
  'node_modules/dsh-progressive-tools/cordis.patch.yml',
  'node_modules/@dingyi222666/dsh-session-notification/lib/index.js',
  'node_modules/@dingyi222666/dsh-session-notification/lib/client.js',
  'node_modules/@dingyi222666/dsh-session-notification/cordis.patch.yml',
  'out/main/index.js',
  'out/preload/index.cjs',
  'runtime/harness-node-entry.mjs',
  'runtime/runtime-esm-register.mjs',
  'runtime/runtime-esm-loader.mjs',
  'node_modules/@deepseek-ai/dsh/lib/bin.js',
  'node_modules/@deepseek-ai/dsh-api-gateway/lib/index.js',
  'node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js',
  'node_modules/@deepseek-ai/dsh-api-settings-controller/lib/index.js',
  'node_modules/@deepseek-ai/dsh-api-workspace-controller/lib/index.js',
  'node_modules/@deepseek-ai/dsh-client-connection/lib/client.js',
  'node_modules/@deepseek-ai/dsh-client-store/lib/index.js',
  'node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js',
  'node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js',
  'node_modules/@deepseek-ai/dsh-client-ui-session/lib/client.js',
  'node_modules/dsh-better-sidebar/lib/index.js',
  'node_modules/dsh-better-sidebar/lib/client.js',
  'node_modules/dsh-better-sidebar/lib/client-registry.js',
  'node_modules/dsh-better-sidebar/lib/client-editor.js',
  'node_modules/dsh-better-sidebar/lib/client-terminal.js',
  'node_modules/dsh-better-sidebar/lib/client-mermaid.js',
  'node_modules/dsh-better-sidebar/package.json',
  'node_modules/dsh-dream-skin/lib/index.js',
  'node_modules/dsh-dream-skin/lib/client.js',
  'node_modules/dsh-dream-skin/package.json',
  'node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js',
  'node_modules/@deepseek-ai/dsh-subagent-claude-code/lib/index.js',
  'node_modules/@deepseek-ai/dsh-subagent-codex/lib/index.js',
  'node_modules/@deepseek-ai/dsh-client-ui-user-questions/lib/client.js',
  'node_modules/@deepseek-ai/schemastery/lib/index.mjs',
  'node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js',
  'node_modules/@earendil-works/pi-ai/dist/index.js',
  'node_modules/@pdf-lib/fontkit/dist/fontkit.es.js',
  'node_modules/@deepseek-ai/cordis-plugin-group/lib/index.js',
  'node_modules/@zerowallscience/plugin-base/lib/client.js',
  'node_modules/@zerowallscience/plugin-projects/lib/index.js',
  'node_modules/@zerowallscience/plugin-files/lib/index.js',
  'node_modules/@zerowallscience/plugin-python/lib/index.js',
  'node_modules/@zerowallscience/plugin-pubmed/lib/index.js',
  'node_modules/@zerowallscience/plugin-pubmed/lib/typert.host.js',
  'node_modules/@zerowallscience/plugin-pubmed/lib/typert.remote-client.js',
  'node_modules/@zerowallscience/plugin-pubmed/THIRD_PARTY_LICENSES/Apache-2.0.txt',
  'node_modules/@zerowallscience/plugin-images/lib/client.js',
  'node_modules/@zerowallscience/plugin-mineru/lib/index.js',
  'node_modules/@zerowallscience/plugin-mineru/lib/client.js',
  'node_modules/@zerowallscience/plugin-mineru/package.json',
  'node_modules/@zerowallscience/plugin-mineru/zerowall.plugin.json',
  'node_modules/@zerowallscience/integrity-runtime/hash-worker.mjs',
  'node_modules/dsh-univer-office/lib/index.js',
  'node_modules/dsh-univer-office/lib/client.js',
  'node_modules/dsh-univer-office/artifacts/gateway.cjs',
  'node_modules/dsh-better-sidebar-icons/lib/index.js',
  'node_modules/dsh-better-sidebar-icons/lib/client.js',
  'node_modules/dsh-better-sidebar-icons/icons/default_file.svg',
  'node_modules/dsh-file-review/lib/index.js',
  'node_modules/dsh-file-review/lib/client.js',
  'node_modules/dsh-file-review/cordis.patch.yml',
  'node_modules/dsh-wechat/dist/index.js',
  'node_modules/dsh-wechat/dist/client.js',
  'node_modules/dsh-auto-review/lib/index.js',
  'node_modules/dsh-auto-review/lib/client.js',
  'node_modules/dsh-free-search/lib/index.js',
  'node_modules/dsh-free-search/lib/client.js',
  'node_modules/dsh-free-search/package.json',
  'node_modules/@jiesou/dsh-opencode-zen-free-provider/lib/index.js',
  'node_modules/@jiesou/dsh-opencode-zen-free-provider/lib/openai-completions.js',
  'node_modules/@jiesou/dsh-opencode-zen-free-provider/lib/openai-responses.js',
  'node_modules/@jiesou/dsh-opencode-zen-free-provider/cordis.patch.yml',
  'node_modules/@jiesou/dsh-opencode-zen-free-provider/LICENSE',
  'node_modules/@changfenhuang/dsh-genui/lib/index.js',
  'node_modules/@changfenhuang/dsh-genui/lib/client.js',
  'node_modules/@changfenhuang/dsh-genui/lib/assets/mermaid.js',
  'node_modules/@changfenhuang/dsh-genui/lib/assets/three.js',
  'node_modules/@changfenhuang/dsh-genui/lib/assets/echarts-core.js',
  'node_modules/@changfenhuang/dsh-genui/lib/assets/echarts-full.js',
  'node_modules/@changfenhuang/dsh-genui/SKILL.md',
  'node_modules/@changfenhuang/dsh-genui/cordis.patch.yml',
  'node_modules/dsh-wechat/cordis.patch.yml',
  'node_modules/@zerowallscience/research-store/lib/index.js',
  'node_modules/jszip/lib/index.js',
  'node_modules/any-base/src/converter.js',
  'node_modules/gifwrap/src/index.js',
  'node_modules/pdf-lib/es/index.js',
  'node_modules/pptxgenjs/dist/pptxgen.es.js',
]
for (const path of requiredArchivePaths) {
  if (!archiveSet.has(path)) throw new Error(`Required ASAR runtime file is missing: ${path}`)
}

for (const path of [
  resolve(packaged.resourcesRoot, 'splash.html'),
  resolve(packaged.resourcesRoot, 'zerowall.patch.yml'),
  resolve(packaged.resourcesRoot, 'skills', 'literature-review', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'skills', 'pubmed-literature', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'skills', 'mineru-document-parser', 'SKILL.md'),
  ...['zerowall-image-dup', 'zerowall-paper-analysis', 'zerowall-paper-compare', 'zerowall-integrity-report'].map(name => resolve(packaged.resourcesRoot, 'skills', name, 'SKILL.md')),
  resolve(packaged.resourcesRoot, 'skills', 'bioinfor-figure-export', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'skills', 'bioinfor-literature-search-digest', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'skills', 'bioinfor-public-data-access', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'skills', 'code-organization', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'skills', 'managing-pixi-environments', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'skills', 'pixi-environment-builder', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'skills', 'project-scaffold', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'skills', 'sc-upstream', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'skills', 'singlecell-milor', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'skills', 'singlecell-milor', 'scripts', 'generate_milor_r_script.py'),
  resolve(packaged.resourcesRoot, 'skills', 'singlecell-milor', 'templates', 'milor_readable_template.R'),
  resolve(packaged.resourcesRoot, 'skills', 'singlecell-qc', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'skills', 'singlecell-qc', 'scripts', 'calculate_metrics.py'),
  resolve(packaged.resourcesRoot, 'skills', 'singlecell-qc', 'scripts', 'calculate_metrics.R'),
  resolve(packaged.resourcesRoot, 'skills', 'singlecell-qc', 'assets', 'gene_sets', 'hbb_genes_human.txt'),
  resolve(packaged.resourcesRoot, 'skills', 'bioinfor-public-data-access', 'scripts', 'public_data_plan.py'),
  resolve(packaged.resourcesRoot, 'licenses', 'THIRD_PARTY_NOTICES.md'),
  resolve(packaged.resourcesRoot, 'licenses', 'deepseek-harness.version.json'),
]) await access(path)

const packagedSplash = await readFile(resolve(packaged.resourcesRoot, 'splash.html'), 'utf8')
const sourceSplash = await readFile(resolve(packageRoot, 'build', 'splash.html'), 'utf8')
if (packagedSplash !== sourceSplash) throw new Error('Packaged splash.html differs from the current desktop source.')
for (const marker of ["params.get('version')", 'width: min(720px, calc(100% - 64px))', 'height: 9px']) {
  if (!packagedSplash.includes(marker)) throw new Error(`Packaged splash.html is missing the startup UI marker: ${marker}`)
}
for (const retired of ['6.1.0', '工作台就绪后，将在后台连接已启用的 MCP 服务。', '你的会话与设置保存在本机']) {
  if (packagedSplash.includes(retired)) throw new Error(`Packaged splash.html contains retired startup copy: ${retired}`)
}

await verifyArchivePolicy()
await verifyExternalPolicy()
await verifySizePolicy()
await verifyImports()
verifyQuestionComposerBundle()
verifyZoteroAdapters()
await verifyNativeRuntime()
await verifyDirectoryPickerWorker()
if (!desktopOnly) await verifyHostStartup()
if (!hostOnly) await verifyDesktopStartup()

console.log(`Packaged ZeroWall ASAR runtime and package policy verified; startup: ${hostOnly ? 'Host' : desktopOnly ? 'Desktop' : 'Host and Desktop'}.`)

async function verifyArchivePolicy() {
  const forbidden = archiveFiles.filter(path => path.startsWith('node_modules/') && (
    /\.(?:d\.ts|ts|tsx|mts|cts|map|pdb|tsbuildinfo)$/i.test(path)
    || hasForbiddenRuntimeDirectory(path)
  ))
  if (forbidden.length > 0) throw new Error(`Forbidden production runtime files found in ASAR:\n${forbidden.slice(0, 50).join('\n')}`)

  const nativeMismatch = archiveFiles.filter(path => /\.(?:node|dll|exe)$/i.test(path)
    && /(darwin|linux|android|arm64|ia32|x86)/i.test(path)
    && !/(win32|windows).*(x64|amd64)/i.test(path))
  if (nativeMismatch.length > 0) throw new Error(`Non-Windows-x64 native files found in ASAR:\n${nativeMismatch.join('\n')}`)

  const pluginNames = [
    'base', 'desktop-compat', 'secrets', 'environment', 'projects', 'account', 'ai-cloud', 'files', 'images', 'mineru', 'mcp',
    'skills', 'reviewer', 'research', 'execution', 'python', 'runs', 'publications',
  ]
  const betterSidebarPackages = archiveFiles.filter(path => path.endsWith('node_modules/dsh-better-sidebar/package.json'))
  if (betterSidebarPackages.length !== 1) throw new Error(`dsh-better-sidebar must be packaged exactly once; found ${betterSidebarPackages.length}.`)
  const betterSidebarManifest = JSON.parse(readArchiveFile('node_modules/dsh-better-sidebar/package.json').toString('utf8'))
  if (`v${betterSidebarManifest.version}` !== pinnedIntegrations.betterSidebar.tag) throw new Error(`Packaged dsh-better-sidebar must be ${pinnedIntegrations.betterSidebar.tag}; found ${betterSidebarManifest.version}.`)
  const betterSidebarClient = readArchiveFile('node_modules/dsh-better-sidebar/lib/client.js').toString('utf8')
  // Prove the dependency build chain reached the installer, including lazy
  // chunks; source-only tests cannot detect a stale prepared runtime.
  for (const [archivePath, sourcePath] of [
    ['node_modules/@zerowallscience/plugin-base/lib/index.js', 'plugins/base/lib/index.js'],
    ['node_modules/@zerowallscience/plugin-base/lib/client.js', 'plugins/base/lib/client.js'],
    ['node_modules/dsh-better-sidebar/lib/client-editor.js', 'packages/dsh-better-sidebar/lib/client-editor.js'],
    ['node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js', 'deepseek-harness/packages/client/ui-model-selection/lib/client.js'],
    ['node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js', 'deepseek-harness/packages/api/session-controller/lib/index.js'],
  ]) {
    if (!readArchiveFile(archivePath).equals(await readFile(resolve(repositoryRoot, sourcePath)))) {
      throw new Error(`Packaged runtime differs from its built source: ${archivePath}`)
    }
  }
  const betterSidebarInject = [...betterSidebarClient.matchAll(/const inject = \[[\s\S]*?\];/gu)]
    .map(match => [...match[0].matchAll(/["']([^"']+)["']/gu)].map(value => value[1]))
    .find(names => ['slots', 'sessions', 'connection', 'locale', 'modules'].every(name => names.includes(name)))
  const moduleSidebar = betterSidebarClient.startsWith('window.__ModuleLoader__.load(')
  // Current Sidebar resolves conversation lazily through ctx.get and routes
  // draft edits through the session scope. Legacy bundles use eager injection.
  if (!moduleSidebar
    && betterSidebarClient.includes('ctx.get("conversation")')
    && (betterSidebarInject === undefined || !betterSidebarInject.includes('conversation'))) {
    throw new Error('Packaged dsh-better-sidebar accesses conversation without declaring it in the client inject list.')
  }
  if (moduleSidebar) {
    for (const marker of ['ctx.sessions.scope(sessionId)', 'conversation.input.for(actx)', 'slash/input-insert-reference']) {
      if (!betterSidebarClient.includes(marker)) throw new Error(`Packaged dsh-better-sidebar is missing its session draft bridge: ${marker}`)
    }
  }
  if (!betterSidebarClient.includes('expandedRef.current')) {
    throw new Error('Packaged dsh-better-sidebar is missing the stable expanded-directory snapshot used by file-tree refreshes.')
  }

  const forbiddenBetterSidebarFiles = archiveFiles.filter(path => path.startsWith('node_modules/dsh-better-sidebar/') && (
    /^node_modules\/dsh-better-sidebar\/README(?:_[^/]+)?\.md$/iu.test(path)
    || /^node_modules\/dsh-better-sidebar\/LICENSE$/iu.test(path)
    || /^node_modules\/dsh-better-sidebar\/scripts\//iu.test(path)
  ))
  if (forbiddenBetterSidebarFiles.length > 0) throw new Error(`Better-sidebar documentation/install files found in ASAR:\n${forbiddenBetterSidebarFiles.join('\n')}`)
  const officePackages = archiveFiles.filter(path => path.endsWith('node_modules/@huanlin/dsh-plugin-better-sidebar-plugin-office/package.json'))
  if (officePackages.length !== 1) throw new Error(`Better-sidebar Office plugin must be packaged exactly once; found ${officePackages.length}.`)
  const officeManifest = JSON.parse(readArchiveFile('node_modules/@huanlin/dsh-plugin-better-sidebar-plugin-office/package.json').toString('utf8'))
  if (officeManifest.version !== '0.2.0') throw new Error(`Packaged Better-sidebar Office plugin must be 0.2.0; found ${officeManifest.version}.`)
  const officeClient = readArchiveFile('node_modules/@huanlin/dsh-plugin-better-sidebar-plugin-office/lib/client.js').toString('utf8')
  for (const marker of ['registerFileViewer', '.docx', '.xlsx', '.pptx']) {
    if (!officeClient.includes(marker)) throw new Error(`Packaged Better-sidebar Office plugin is missing viewer marker: ${marker}`)
  }
  const duplicatedOfficeDependencies = [
    'node_modules/@aiden0z/pptx-renderer/',
    'node_modules/@univerjs/preset-sheets-core/',
    'node_modules/@univerjs/presets/',
    'node_modules/docx-preview/',
  ].filter(prefix => archiveFiles.some(path => path.startsWith(prefix)))
  const nestedOfficeDependencies = archiveFiles.filter(path => path.startsWith(
    'node_modules/@huanlin/dsh-plugin-better-sidebar-plugin-office/node_modules/',
  ))
  duplicatedOfficeDependencies.push(...nestedOfficeDependencies)
  if (duplicatedOfficeDependencies.length > 0) {
    throw new Error(`Office dependencies bundled in client.js must not be copied into ASAR again:\n${duplicatedOfficeDependencies.join('\n')}`)
  }
  const dreamSkinPackages = archiveFiles.filter(path => path.endsWith('node_modules/dsh-dream-skin/package.json'))
  if (dreamSkinPackages.length !== 1) throw new Error(`dsh-dream-skin must be packaged exactly once; found ${dreamSkinPackages.length}.`)
  const dreamSkinManifest = JSON.parse(readArchiveFile('node_modules/dsh-dream-skin/package.json').toString('utf8'))
  if (dreamSkinManifest.version !== desktopManifest.dependencies['dsh-dream-skin']) throw new Error(`Packaged dsh-dream-skin must be ${desktopManifest.dependencies['dsh-dream-skin']}; found ${dreamSkinManifest.version}.`)
  const dreamSkinClient = readArchiveFile('node_modules/dsh-dream-skin/lib/client.js').toString('utf8')
  const dreamSkinDefaults = dreamSkinClient.match(/const FACTORY_DEFAULTS = \{([\s\S]*?)\n\t\t\};/u)?.[1] ?? ''
  if (!dreamSkinDefaults.includes('[BUILTIN_LAST_KEY]: "light"')
    || !dreamSkinDefaults.includes('[STORAGE_KEY]: DEFAULT_SKIN')
    || !dreamSkinDefaults.includes('[COMPOSER_OPACITY_KEY]: "1"')
    || /\[WALLPAPER_(?:KEY|URL_KEY|GRADIENT_KEY)\]:/u.test(dreamSkinDefaults)
    || /data:image\/jpeg;base64,[A-Za-z0-9+/=]{10000}/u.test(dreamSkinClient)) {
    throw new Error('Dream Skin must ship the built-in light appearance with solid surfaces and no bundled wallpaper.')
  }
  const forbiddenDreamSkinFiles = archiveFiles.filter(path => path.startsWith('node_modules/dsh-dream-skin/') && (
    /^node_modules\/dsh-dream-skin\/(?:README|LICENSE|scripts|test|tests)\b/iu.test(path)
  ))
  if (forbiddenDreamSkinFiles.length > 0) throw new Error(`Dream Skin source/documentation files found in ASAR:\n${forbiddenDreamSkinFiles.join('\n')}`)
  const freeSearchPackages = archiveFiles.filter(path => path.endsWith('node_modules/dsh-free-search/package.json'))
  if (freeSearchPackages.length !== 1) throw new Error(`dsh-free-search must be packaged exactly once; found ${freeSearchPackages.length}.`)
  const freeSearchManifest = JSON.parse(readArchiveFile('node_modules/dsh-free-search/package.json').toString('utf8'))
  if (freeSearchManifest.version !== desktopManifest.dependencies['dsh-free-search'] || freeSearchManifest.license !== 'MIT') {
    throw new Error(`Packaged dsh-free-search must be MIT-licensed ${desktopManifest.dependencies['dsh-free-search']}; found ${freeSearchManifest.version} (${freeSearchManifest.license}).`)
  }
  const freeSearchInject = freeSearchManifest.dsh?.client?.inject
  if (!Array.isArray(freeSearchInject) || !freeSearchInject.includes('slots') || !freeSearchInject.includes('commandUi')) {
    throw new Error(`Packaged dsh-free-search has an incompatible client inject contract: ${JSON.stringify(freeSearchInject)}.`)
  }
  const freeSearchHost = readArchiveFile('node_modules/dsh-free-search/lib/index.js').toString('utf8')
  const freeSearchClient = readArchiveFile('node_modules/dsh-free-search/lib/client.js').toString('utf8')
  for (const marker of ['id: "ddg"', 'searchBing', 'advanced_search', 'platform_search', 'free_search_test', 'registerSearchProvider']) {
    if (!freeSearchHost.includes(marker)) throw new Error(`Packaged dsh-free-search Host is missing marker: ${marker}`)
  }
  for (const marker of ['settings.plugin.item', 'free-search-engine', 'slots', 'commandUi']) {
    if (!freeSearchClient.includes(marker)) throw new Error(`Packaged dsh-free-search client is missing marker: ${marker}`)
  }
  for (const forbidden of ['@deepseek-ai/dsh-client-runtime', 'node:child_process', 'pnpm add dsh-free-search@latest', '/update']) {
    if (freeSearchHost.includes(forbidden) || freeSearchClient.includes(forbidden) || JSON.stringify(freeSearchManifest).includes(forbidden)) {
      throw new Error(`Packaged dsh-free-search contains removed compatibility or self-update marker: ${forbidden}`)
    }
  }
  const openCodePackages = archiveFiles.filter(path => path.endsWith('node_modules/@jiesou/dsh-opencode-zen-free-provider/package.json'))
  if (openCodePackages.length !== 1) throw new Error(`OpenCode Zen Free provider must be packaged exactly once; found ${openCodePackages.length}.`)
  const openCodeManifest = JSON.parse(readArchiveFile('node_modules/@jiesou/dsh-opencode-zen-free-provider/package.json').toString('utf8'))
  if (openCodeManifest.version !== '0.1.18' || openCodeManifest.license !== 'MIT') {
    throw new Error(`Packaged OpenCode Zen Free provider must be MIT-licensed 0.1.18; found ${openCodeManifest.version} (${openCodeManifest.license}).`)
  }
  const openCodeHost = readArchiveFile('node_modules/@jiesou/dsh-opencode-zen-free-provider/lib/index.js').toString('utf8')
  for (const marker of [
    'OpenCode Zen Free',
    'opencode-zen-free-provider',
    'mimo-v2.5-free',
    'registration.replace([PROVIDER])',
    'CATALOG_RETRY_DELAYS_MS',
    'CATALOG_REFRESH_INTERVAL_MS',
  ]) {
    if (!openCodeHost.includes(marker)) throw new Error(`Packaged OpenCode Zen Free provider is missing marker: ${marker}`)
  }
  for (const name of [...pluginNames.map(value => `plugin-${value}`), 'research-store']) {
    const packagePaths = archiveFiles.filter(path => path.endsWith(`@zerowallscience/${name}/package.json`))
    if (packagePaths.length !== 1) throw new Error(`@zerowallscience/${name} must be packaged exactly once; found ${packagePaths.length}.`)
  }
  for (const name of ['platform-client', 'platform-host', 'plugin-wechat']) {
    if (archiveFiles.some(path => path.includes(`@zerowallscience/${name}/`))) throw new Error(`Legacy package @zerowallscience/${name} must not be packaged.`)
  }
  if (archiveFiles.some(path => path.startsWith('node_modules/@zerowallscience/plugin-web-search/'))) {
    throw new Error('Removed @zerowallscience/plugin-web-search must not be packaged.')
  }
  for (const name of ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-host-apiproxy']) {
    if (archiveFiles.some(path => path.startsWith(`node_modules/${name}/`))) throw new Error(`Removed rc2 package ${name} must not be packaged.`)
  }
  const forbiddenWechat = archiveFiles.filter(path => /node_modules\/(?:wechaty|wechaty-puppet-|@juzi-bot\/wechaty)/iu.test(path))
  if (forbiddenWechat.length > 0) throw new Error(`Non-iLink WeChat runtime found in ASAR:\n${forbiddenWechat.slice(0, 20).join('\n')}`)
  const forbiddenCapabilityFiles = archiveFiles.filter(path => (
    path.startsWith('node_modules/@zerowallscience/integrity-runtime/')
  ) && /(?:^|\/)(?:README(?:_[^/]*)?\.md|tests?|\.env(?:\.[^/]*)?)(?:\/|$)|\.map$/iu.test(path))
  if (forbiddenCapabilityFiles.length > 0) throw new Error(`Forbidden integrity runtime development files found in ASAR:\n${forbiddenCapabilityFiles.join('\n')}`)
  const hardcodedUserPath = archiveFiles.filter(path => /node_modules\/@zerowallscience\/integrity-runtime\/.+\.(?:js|mjs|json|yml)$/iu.test(path))
    .find(path => /[A-Za-z]:[\\/]Users[\\/][^\\/]+/iu.test(readArchiveFile(path).toString('utf8')))
  if (hardcodedUserPath !== undefined) throw new Error(`Hard-coded user path found in packaged capability runtime: ${hardcodedUserPath}`)

  const mineruHost = readArchiveFile('node_modules/@zerowallscience/plugin-mineru/lib/index.js').toString('utf8')
  for (const tool of ['mineru_activate', 'mineru_parse', 'mineru_batch_parse', 'mineru_task']) {
    if (!mineruHost.includes(tool)) throw new Error(`Packaged MinerU Host is missing required tool registration: ${tool}`)
  }
  if (!mineruHost.includes('MinerU Host tool registration failed')) {
    throw new Error('Packaged MinerU Host is missing its startup tool-registration assertion.')
  }
  const singlecellHost = readArchiveFile('node_modules/@zerowallscience/plugin-singlecell/lib/index.js').toString('utf8')
  for (const tool of ['sc_tenifold_knockout_validate', 'sc_tenifold_knockout_plan', 'sc_tenifold_knockout_run', 'sc_tenifold_knockout_status', 'sc_tenifold_knockout_cancel', 'sc_tenifold_knockout_collect', 'sc_tenifold_knockout_review', 'sc_tenifold_knockout_report']) {
    if (!singlecellHost.includes(tool)) throw new Error(`Packaged singlecell Host is missing required tool registration: ${tool}`)
  }
  const filesHost = readArchiveFile('node_modules/@zerowallscience/plugin-files/lib/index.js').toString('utf8')
  if (!filesHost.includes('extract_uploaded_file')) {
    throw new Error('Packaged Files Host is missing the on-demand extraction tool.')
  }
  const modelSelectionClient = readArchiveFile('node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js').toString('utf8')
  if (!modelSelectionClient.includes('selectingKey')) {
    throw new Error('Packaged model selector is missing row-scoped selection state.')
  }
  const sessionControllerHost = readArchiveFile('node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js').toString('utf8')
  if (!sessionControllerHost.includes('checkAllModels')) {
    throw new Error('Packaged Session Controller is missing the Host-owned concurrent model probe.')
  }
  const llmHost = readArchiveFile('node_modules/@deepseek-ai/dsh-llm/lib/index.js').toString('utf8')
  if (!llmHost.includes('Use read_uploaded_file or extract_uploaded_file')) {
    throw new Error('Packaged LLM runtime is missing the on-demand attachment extraction instruction.')
  }

  if (!/^\d+\.\d+\.\d+$/u.test(packagedManifest.version)) throw new Error(`Packaged desktop version must be a semantic release; found ${packagedManifest.version}.`)
  const dshManifest = JSON.parse(readArchiveFile('node_modules/@deepseek-ai/dsh/package.json').toString('utf8'))
  if (dshManifest.version !== pinnedUpstream.version) throw new Error(`Packaged DSH must be ${pinnedUpstream.version}; found ${dshManifest.version}.`)
}

function verifyQuestionComposerBundle() {
  const bundle = readArchiveFile('node_modules/@deepseek-ai/dsh-client-ui-user-questions/lib/client.js').toString('utf8')
  for (const marker of ['data-question-key', 'radio', 'checkbox', 'pending.answer']) {
    if (!bundle.includes(marker)) throw new Error(`Packaged QuestionComposer bundle is missing interaction marker: ${marker}`)
  }
}

function verifyZoteroAdapters() {
  const client = readArchiveFile('node_modules/dsh-zotero/lib/client.js').toString('utf8')
  const itemGraph = readArchiveFile('node_modules/dsh-zotero/lib/item-graph.js').toString('utf8')
  const detail = readArchiveFile('node_modules/dsh-zotero/lib/local/detail.js').toString('utf8')
  if (!client.includes('visit(root, key, 1)') || !client.includes('order.push(`${key}:${block.callId}`)')) {
    throw new Error('Packaged Zotero Sources tab cannot track nested Progressive Tools calls.')
  }
  const dispatcher = readArchiveFile('node_modules/dsh-progressive-tools/lib/index.js').toString('utf8')
  const conversation = readArchiveFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js').toString('utf8')
  const ssh = readArchiveFile('node_modules/dsh-ssh-ops/lib/client.js').toString('utf8')
  if (!client.includes('function zoteroDispatch(block)') || !dispatcher.includes('targetMeta: definition.output.presentationMeta')) {
    throw new Error('Packaged Zotero dispatcher metadata/replay adapter is missing.')
  }
  if (!conversation.includes('data-conversation-view') || !ssh.includes('data-zerowall-ssh-view')) {
    throw new Error('Packaged conversation view isolation or SSH main view is missing.')
  }
  if (!itemGraph.includes('options.fetchAnnotationChildren ?? options.fetchChildren')
    || !detail.includes("new URLSearchParams({ itemType: 'annotation' })")) {
    throw new Error('Packaged Zotero annotation traversal is missing its Local API itemType filter.')
  }
}

function hasForbiddenRuntimeDirectory(path) {
  const forbidden = new Set(['test', 'tests', '__tests__', 'example', 'examples', 'docs'])
  const segments = path.split('/')
  return segments.some((segment, index) => {
    const lower = segment.toLowerCase()
    const isUniverDocsPackage = lower === 'docs'
      && index === 2
      && segments[0]?.toLowerCase() === 'node_modules'
      && segments[1]?.toLowerCase() === '@univerjs'
    const isUniverBundledDocumentation = lower === 'docs'
      && index === 2
      && segments[0] === 'node_modules'
      && segments[1] === 'dsh-univer-office'
    return forbidden.has(lower) && !isUniverDocsPackage && !isUniverBundledDocumentation
  })
}

async function verifyExternalPolicy() {
  const externalFiles = await listDiskFiles(packaged.resourcesRoot)
  const forbiddenSkills = externalFiles.filter(path => path.startsWith('skills/') && (
    /(?:^|\/)(?:__pycache__|tests?|outputs?|rendered|screenshots|test-results)(?:\/|$)/i.test(path)
    || /\.pyc$/i.test(path)
    || /(?:^|\/)(?:academic-ppt-studio|gpt-image2-ppt|journal-club-ppt)(?:\/|$)/i.test(path)
  ))
  if (forbiddenSkills.length > 0) throw new Error(`Forbidden runtime Skill artifacts found:\n${forbiddenSkills.slice(0, 50).join('\n')}`)
  const legacyPptFiles = externalFiles.filter(path => /(?:^|\/)(?:academic-ppt-studio|gpt-image2-ppt|journal-club-ppt)(?:\/|$)/i.test(path))
  if (legacyPptFiles.length > 0) throw new Error(`Legacy PPT Skills are forbidden in the packaged runtime:\n${legacyPptFiles.slice(0, 50).join('\n')}`)
  if (externalFiles.length > 3_000) throw new Error(`ASAR-external file count ${externalFiles.length} exceeds the 3,000-file gate.`)

  const nodeExecutables = (await listDiskFiles(packaged.root)).filter(path => /(?:^|\/)node\.exe$/i.test(path))
  if (nodeExecutables.length > 0) throw new Error(`Standalone Node runtime is forbidden:\n${nodeExecutables.join('\n')}`)
  try {
    await access(resolve(packaged.resourcesRoot, 'app', 'node_modules'))
    throw new Error('A loose resources/app/node_modules tree is forbidden; production dependencies must live in app.asar.')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

async function verifySizePolicy() {
  const installedBytes = await directorySize(packaged.root)
  // 6.2.0 adds Univer's offline Gateway, Viewer, render worker (~181 MiB),
  // and Windows native Office dependencies to the existing Claude runtime.
  // Measured output is 1,375 MiB installed and 320 MiB compressed.
  if (installedBytes > 1_500 * MIB) throw new Error(`Installed output ${(installedBytes / MIB).toFixed(1)} MiB exceeds the 1,500 MiB gate.`)

  const installers = (await readdir(resolve(packageRoot, 'dist'), { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.includes(`-${packagedManifest.version}-`) && entry.name.endsWith('.exe') && !entry.name.toLowerCase().includes('uninstall'))
  for (const installer of installers) {
    const size = (await stat(resolve(packageRoot, 'dist', installer.name))).size
    if (size > 360 * MIB) throw new Error(`Installer ${installer.name} ${(size / MIB).toFixed(1)} MiB exceeds the 360 MiB gate.`)
  }
}

async function verifyImports() {
  const expression = `
    const load = name => import(import.meta.resolve(name, process.env.ZEROWALL_RUNTIME_ANCHOR));
    const { KNOWN_SESSION_EVENT_TYPES } = await load('@deepseek-ai/dsh-session');
    if (!KNOWN_SESSION_EVENT_TYPES.has('zerowall/capabilities/selection')) throw new Error('Built Session catalog is missing legacy ZeroWall history.');
    await load('@deepseek-ai/dsh-mcp-client');
    await load('@deepseek-ai/dsh-session-telemetry-otel');
    await load('@deepseek-ai/schemastery');
    const expectedInject = new Map([
      ['@zerowallscience/plugin-base', ['webServer']],
      ['@zerowallscience/plugin-files', ['tools']],
      ['@zerowallscience/plugin-mineru', ['settings', 'tools', 'sessions', 'zerowallFiles', 'zerowallResearch']],
      ['@zerowallscience/plugin-skills', ['skills', 'systemPrompt']],
    ]);
    for (const name of [
      '@zerowallscience/plugin-base',
      '@zerowallscience/plugin-projects',
      '@zerowallscience/plugin-account',
      '@zerowallscience/plugin-ai-cloud',
      '@zerowallscience/plugin-files',
      '@zerowallscience/plugin-images',

      '@zerowallscience/plugin-mineru',

      '@zerowallscience/plugin-mcp',
      '@zerowallscience/plugin-skills',
      'dsh-free-search',
      'dsh-wechat',
    ]) {
      const module = await load(name);
      const plugin = module.default ?? module;
      if (typeof plugin !== 'object' || typeof plugin.apply !== 'function') {
        throw new Error(name + ' did not preserve its Cordis plugin object during packaging.');
      }
      const required = expectedInject.get(name) ?? [];
      for (const service of required) {
        if (!Array.isArray(plugin.inject) || !plugin.inject.includes(service)) {
          throw new Error(name + ' lost required Cordis inject metadata: ' + service);
        }
      }
    }
    const { Context: HarvestContext } = await load('@deepseek-ai/cordis');
    const { default: HarvestPrompt } = await load('@deepseek-ai/dsh-system-prompt');
    const { default: HarvestTools } = await load('@deepseek-ai/dsh-tools');
    const harvest = await load('@dsh-external/zotero-harvest');
    const harvestCtx = new HarvestContext();
    try {
      harvestCtx.provide('sessions', {});
      await harvestCtx.plugin(HarvestPrompt);
      await harvestCtx.plugin(HarvestTools);
      await harvestCtx.plugin(harvest);
      const names = harvestCtx.tools.schemas().map(row => row.name);
      for (const name of ['lit_fetch', 'lit_paper_detail', 'lit_save', 'lit_sufficiency_check', 'lit_download_links', 'lit_review_run']) {
        if (!names.includes(name)) throw new Error('Packaged harvest tool missing: ' + name);
      }
      const definitions = [];
      harvest.apply({ tools: { register: tool => definitions.push(tool) } });
      const result = await definitions.find(row => row.name === 'lit_sufficiency_check').execute({ topic: 'test', collected: [] }, {});
      if (result.sufficient !== false) throw new Error('Packaged harvest invocation failed');
    } finally { await harvestCtx.fiber.dispose(); }
    const { validateStoredEvents } = await load('@deepseek-ai/dsh-session-persistence');
    const legacy = { type: 'zerowall/capabilities/selection', seq: 52, time: 1, data: { tools: ['read'], disabled: [], onDemand: ['python'] } };
    const restored = validateStoredEvents({ id: 'packaged-legacy-history' }, [legacy]);
    if (JSON.stringify(restored[0]) !== JSON.stringify(legacy)) throw new Error('Legacy capability selection was changed during restoration.');
    if (process.env.ZEROWALL_VERIFY_HISTORY_PATH) {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const { tmpdir } = await import('node:os');
      const { Context } = await load('@deepseek-ai/cordis');
      const { default: Persistence } = await load('@deepseek-ai/dsh-session-persistence-jsonl');
      const source = process.env.ZEROWALL_VERIFY_HISTORY_PATH;
      const bytes = await fs.readFile(source);
      const header = JSON.parse(bytes.toString('utf8').split('\\n')[0]);
      const root = await fs.mkdtemp(path.join(tmpdir(), 'zerowall-packaged-history-'));
      const copy = path.join(root, path.basename(path.dirname(path.dirname(source))), header.id, 'session.v3.jsonl');
      const ctx = new Context();
      try {
        await fs.mkdir(path.dirname(copy), { recursive: true });
        await fs.writeFile(copy, bytes);
        await ctx.plugin(Persistence, { root, compression: 'none' });
        const handle = await ctx.sessionPersistence.open(header.id, 'read');
        try {
          const record = await handle.read();
          if (!record.events.some(event => event.type === legacy.type)) throw new Error('Legacy history metadata was not retained.');
        } finally { await handle.close(); }
        if (!(await fs.readFile(source)).equals(bytes) || !(await fs.readFile(copy)).equals(bytes)) throw new Error('History bytes changed during verification.');
      } finally {
        await ctx.fiber.dispose();
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  `
  await runEmbeddedNode([
    '--import', pathToFileURL(resolve(asarPath, 'runtime', 'runtime-esm-register.mjs')).href,
    '--experimental-import-meta-resolve', '--input-type=module', '--eval', expression,
  ], { cwd: packaged.root })
}

async function verifyNativeRuntime() {
  const unpackedModules = resolve(packaged.resourcesRoot, 'app.asar.unpacked', 'node_modules')
  const ptyRoot = resolve(unpackedModules, 'node-pty', 'prebuilds', 'win32-x64')
  // node-pty 1.2 split the Windows native module into
  // conpty.node; older releases exposed pty.node. Accept either ABI layout,
  // then let the smoke test below validate the loaded package.
  const ptyCandidates = [
    resolve(ptyRoot, 'pty.node'),
    resolve(ptyRoot, 'conpty.node'),
  ]
  const nativePaths = [
    resolve(unpackedModules, '@img', 'sharp-win32-x64', 'lib', 'sharp-win32-x64-0.35.3.node'),
    resolve(unpackedModules, '@koromix', 'koffi-win32-x64', 'win32_x64', 'koffi.node'),
  ]
  const ripgrepPath = resolve(unpackedModules, '@vscode', 'ripgrep-win32-x64', 'bin', 'rg.exe')
  if (!(await Promise.any(ptyCandidates.map(async path => { await access(path); return true })).catch(() => false))) {
    throw new Error(`node-pty native module is missing under ${ptyRoot}`)
  }
  for (const path of nativePaths) await access(path)
  await access(ripgrepPath)

  const expression = `
    (async () => {
    const pty = await import('node-pty');
    const { default: sharp } = await import('sharp');
    const { default: koffi } = await import('koffi');
    const { PDFDocument } = await import('pdf-lib');
    const { default: PptxGenJS } = await import('pptxgenjs');
    const terminal = pty.spawn(process.env.ComSpec, ['/d', '/s', '/c', 'echo ZEROWALL_PTY_OK'], { cols: 80, rows: 24, useConpty: false });
    const terminalOutput = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('PTY smoke timeout')), 10000);
      terminal.onData(data => { output += data; });
      terminal.onExit(() => { clearTimeout(timeout); resolve(output); });
    });
    if (!terminalOutput.includes('ZEROWALL_PTY_OK')) throw new Error('PTY smoke marker missing');
    const image = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#ffffffff' } }).png().toBuffer();
    if (image.length === 0 || typeof koffi.load !== 'function') throw new Error('Native image or Koffi smoke failed');
    const pdf = await PDFDocument.create(); pdf.addPage([10, 10]); if ((await pdf.save()).length === 0) throw new Error('PDF smoke failed');
    const pptx = new PptxGenJS(); pptx.addSlide();
    process.exit(0);
    })().catch(error => { console.error(error); process.exit(1); });
  `
  await runEmbeddedNode([
    '--import', pathToFileURL(resolve(asarPath, 'runtime', 'runtime-esm-register.mjs')).href,
    '--eval', expression,
  ], { cwd: packaged.root })

  const ripgrep = spawnSync(ripgrepPath, ['--version'], { encoding: 'utf8', windowsHide: true })
  if (ripgrep.status !== 0 || !ripgrep.stdout.includes('ripgrep')) throw new Error(`ripgrep smoke failed: ${ripgrep.stderr}`)
  await runEmbeddedNode([
    resolve(unpackedModules, '@zerowallscience', 'integrity-runtime', 'hash-worker.mjs'), '--selftest',
  ], { cwd: packaged.root })
}

async function verifyDirectoryPickerWorker() {
  const workerPath = resolve(packaged.resourcesRoot, 'app.asar.unpacked', 'node_modules', '@deepseek-ai', 'dsh-host-directory-picker-native', 'lib', 'worker.cjs')
  await access(workerPath)
  const child = spawn(packaged.executablePath, [workerPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_PATH: resolve(asarPath, 'node_modules'),
      DSH_DIALOG_TITLE: 'ZeroWall packaged directory picker smoke',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk.toString('utf8') })
  child.stderr.on('data', chunk => { output += chunk.toString('utf8') })
  try {
    await new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Packaged directory picker worker did not start.\n${output}`)), 10_000)
      child.once('message', message => {
        if (message?.kind !== 'showing') return
        clearTimeout(timeout)
        resolvePromise()
      })
      child.once('error', error => {
        clearTimeout(timeout)
        reject(error)
      })
      child.once('exit', code => {
        clearTimeout(timeout)
        reject(new Error(`Packaged directory picker worker exited before showing (code ${code ?? 'unknown'}).\n${output}`))
      })
    })
  } finally {
    if (child.exitCode === null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      else child.kill('SIGTERM')
    }
  }
}

async function verifyHostStartup() {
  const root = await mkdtemp(resolve(tmpdir(), 'zerowall-packaged-host-'))
  const port = await reservePort()
  const url = `http://127.0.0.1:${port}`
  const dshEntry = resolve(asarPath, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const child = spawn(packaged.executablePath, [
    '--import', pathToFileURL(resolve(asarPath, 'runtime', 'runtime-esm-register.mjs')).href,
    '--expose-internals',
    resolve(asarPath, 'runtime', 'harness-node-entry.mjs'),
    dshEntry,
    'web',
    '--patch', resolve(packaged.resourcesRoot, 'zerowall.patch.yml'),
    '--host', '127.0.0.1',
    '--port', String(port),
    '--no-open',
  ], {
    cwd: root,
    env: hostEnvironment(root, dshEntry),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  })
  // This isolated Host has no OS vault. Match the desktop IPC contract with
  // an empty, read-only test broker; the real broker is exercised by the
  // packaged Desktop account checks. Never touch the user's credentials.
  child.on('message', message => {
    if (message?.kind !== 'zerowall-secret-request') return
    child.send({ kind: 'zerowall-secret-response', requestId: message.requestId,
      ok: message.operation === 'get', ...(message.operation === 'get' ? {} : { error: 'The test credential broker is read-only.' }) })
  })
  let output = ''
  let lastProbeError = ''
  let freeSearchVerified = false
  child.stdout.on('data', chunk => { output += chunk.toString('utf8') })
  child.stderr.on('data', chunk => { output += chunk.toString('utf8') })

  try {
    const deadline = Date.now() + (process.platform === 'win32' ? 120_000 : 60_000)
    while (Date.now() < deadline && child.exitCode === null) {
      let response
      try {
        response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(1_000) })
      } catch {
        // Expected while the packaged Host binds its loopback endpoint.
      }
      if (response !== undefined && response.status >= 200 && response.status < 500) {
        const token = /https?:\/\/127\.0\.0\.1:\d+\/?\?token=([A-Za-z0-9_-]+)/u.exec(output)?.[1]
        if (token === undefined) { await new Promise(resolve => setTimeout(resolve, 250)); continue }
        const probeUrl = `${url}/?token=${token}`
        try {
          await verifyWebBootManifest(probeUrl)
          await verifyPluginInventory(probeUrl)
          await verifyOpenCodeCatalog(probeUrl)
          await verifyZoteroStatus(probeUrl)
          if (!freeSearchVerified) {
            await verifyFreeSearch(probeUrl)
            freeSearchVerified = true
          }
          await verifyMineruStatus(probeUrl)
          await verifyPubmedStatus(probeUrl)
          await verifySinglecellStatus(probeUrl)
          await verifyEventWebSockets(probeUrl)
          await verifyPlaintextSessionPersistence(probeUrl, root)
          // DSH binds the loopback server before every asynchronous Loader row
          // has settled. Keep the process alive long enough to catch a plugin
          // that briefly reports active and then fails during its apply phase.
          await new Promise(resolvePromise => setTimeout(resolvePromise, 2_000))
          if (child.exitCode !== null) throw new Error(`Packaged Host exited after becoming ready.\n${output.slice(-12_000).replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]')}`)
          await verifyWebBootManifest(probeUrl)
          await verifyPluginInventory(probeUrl)
          await verifyMineruStatus(probeUrl)
          await verifyPubmedStatus(probeUrl)
          await verifySinglecellStatus(probeUrl)
          await verifyEventWebSockets(probeUrl)
          return
        } catch (error) {
          if (lastProbeError !== (error instanceof Error ? error.message : String(error))) console.log(`Host probe pending: ${error instanceof Error ? error.message : String(error)}`)
          lastProbeError = error instanceof Error ? error.message : String(error)
          if (!isTransientHostProbeError(error) || child.exitCode !== null) {
            const reason = error instanceof Error ? error.stack ?? error.message : String(error)
            throw new Error(`Packaged Host verification failed.\n${reason}\n${output.slice(-12_000).replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]')}`)
          }
        }
      }
      await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
    }
    throw new Error(`Packaged Host did not become ready. Last probe: ${lastProbeError}\n${output.slice(-12_000).replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]')}`)
  } finally {
    if (child.exitCode === null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      else child.kill('SIGTERM')
    }
  }
}

function isTransientHostProbeError(error) {
  for (let current = error; current !== undefined && current !== null; current = current.cause) {
    if (current instanceof DOMException && ['AbortError', 'TimeoutError'].includes(current.name)) return true
    if (current instanceof TypeError && current.message === 'fetch failed') return true
    if (current instanceof Error && /^Packaged Web boot manifest is incomplete\./u.test(current.message)) return true
    if (current instanceof Error && /^Packaged Host plugin inventory is missing:/u.test(current.message)) return true
    if (current instanceof Error && /^Packaged Host ZeroWall plugins are not active:/u.test(current.message)) return true
    if (current instanceof Error && /^Packaged Host MinerU status is unavailable:/u.test(current.message)) return true
    if (current instanceof Error && /^Packaged Host singlecell status is unavailable:/u.test(current.message)) return true
    if (current instanceof Error && /^Packaged Host WebSocket (?:failed to open|timed out): /u.test(current.message)) return true
    if (typeof current === 'object' && ['UND_ERR_SOCKET', 'ECONNRESET', 'ECONNREFUSED'].includes(current.code)) return true
  }
  return false
}

async function hostFetch(input, options = {}) {
  const url = new URL(input)
  const token = url.searchParams.get('token')
  if (!hostCookies.has(url.origin) && token) {
    const exchange = new URL('/', url)
    exchange.searchParams.set('token', token)
    const response = await fetch(exchange, { redirect: 'manual', signal: AbortSignal.timeout(5_000) })
    const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).filter(value => value.startsWith('dsh-auth-')).join('; ')
    if (response.status !== 303 || !cookie) throw new Error('Host authentication exchange failed.')
    hostCookies.set(url.origin, cookie)
  }
  // DSH module URLs use the raw /plugins/??specifier query. URLSearchParams
  // serialization changes that routing syntax, so remove only a real token.
  if (token !== null) url.searchParams.delete('token')
  return fetch(url, { ...options, headers: { ...options.headers, Cookie: hostCookies.get(url.origin) ?? '', Origin: url.origin } })
}

function authUrl(base, path) {
  const value = new URL(path, base)
  const token = new URL(base).searchParams.get('token')
  if (token !== null && !hostCookies.has(value.origin)) value.searchParams.set('token', token)
  return value
}

async function verifyEventWebSockets(url) {
  if (typeof WebSocket !== 'function') throw new Error('Node WebSocket support is required for packaged transport verification.')
  const base = new URL(url)
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  const open = path => new Promise((resolvePromise, reject) => {
    const socket = new WebSocket(new URL(path, base), { headers: { Cookie: hostCookies.get(new URL(url).origin) ?? '', Origin: new URL(url).origin } })
    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error(`Packaged Host WebSocket timed out: ${path}`))
    }, 10_000)
    socket.addEventListener('open', () => {
      clearTimeout(timeout)
      resolvePromise(socket)
    }, { once: true })
    socket.addEventListener('error', () => {
      clearTimeout(timeout)
      reject(new Error(`Packaged Host WebSocket failed to open: ${path}`))
    }, { once: true })
  })
  const close = socket => new Promise(resolvePromise => {
    if (socket.readyState === WebSocket.CLOSED) return resolvePromise()
    const timeout = setTimeout(() => {
      socket.close()
      resolvePromise()
    }, 2_000)
    socket.addEventListener('close', () => {
      clearTimeout(timeout)
      resolvePromise()
    }, { once: true })
    socket.close(1000, 'packaged transport verification')
  })

  // The pinned rc.2 Gateway multiplexes event streams on remote.mux.
  const first = await Promise.all(['/api/remote.mux', '/api/remote.mux'].map(open))
  const second = await Promise.all(['/api/remote.mux', '/api/remote.mux'].map(open))
  await Promise.all([...first, ...second].map(close))
  const reconnected = await Promise.all(['/api/remote.mux', '/api/remote.mux'].map(open))
  await Promise.all(reconnected.map(close))
}

async function verifyPluginInventory(url) {
  const rpcId = randomUUID()
  const response = await hostFetch(authUrl(new URL(url), '/api/pluginInventory/list'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method: 'pluginInventory/list',
      payload: { args: {} },
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Packaged Host pluginInventory/list returned HTTP ${response.status}.`)
  const envelope = await response.json()
  if (envelope?.rpcId !== rpcId || envelope?.result?.ok !== true || !Array.isArray(envelope.result.value?.entries)) {
    throw new Error(`Packaged Host plugin inventory is unavailable: ${JSON.stringify(envelope)}`)
  }
  const entries = envelope.result.value.entries
  if (entries.some(entry => String(entry?.moduleName).startsWith('@daweifu/capability-menu'))) {
    throw new Error('Removed capability-menu module is still mounted in the Host.')
  }
  const expected = [
    'base', 'desktop-compat', 'secrets', 'environment', 'projects', 'account', 'ai-cloud', 'files', 'images', 'mineru', 'mcp',
    'skills', 'reviewer', 'research', 'pubmed', 'singlecell', 'execution', 'python', 'runs', 'publications',
  ].map(name => `@zerowallscience/plugin-${name}`)
  expected.push('@dsh-external/zotero-harvest', '@jiesou/dsh-opencode-zen-free-provider', 'dsh-free-search', 'dsh-wechat', 'dsh-file-review', '@changfenhuang/dsh-genui', 'dsh-zotero')
  const byModule = new Map(entries.map(entry => [entry?.moduleName, entry]))
  const missing = expected.filter(name => !byModule.has(name))
  if (missing.length > 0) throw new Error(`Packaged Host plugin inventory is missing: ${missing.join(', ')}`)
  const inactive = expected.filter(name => byModule.get(name)?.enabled !== true || byModule.get(name)?.fiberPhase !== 'active')
  if (inactive.length > 0) throw new Error(`Packaged Host ZeroWall plugins are not active: ${inactive.map(name => `${name}=${JSON.stringify(byModule.get(name))}`).join('; ')}`)
}

async function verifyOpenCodeCatalog(url) {
  const call = async (request, timeout = 30_000) => {
    const rpcId = randomUUID()
    const response = await hostFetch(authUrl(new URL(url), '/api/session/modelCatalog'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId,
        method: 'session/modelCatalog',
        payload: { args: { request } },
      }),
      signal: AbortSignal.timeout(timeout),
    })
    if (!response.ok) throw new Error(`Packaged OpenCode catalog returned HTTP ${response.status}.`)
    const envelope = await response.json()
    if (envelope?.rpcId !== rpcId || envelope?.result?.ok !== true) {
      throw new Error(`Packaged OpenCode catalog request failed: ${JSON.stringify(envelope)}`)
    }
    return envelope.result.value
  }

  let catalog
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    catalog = await call({ refresh: true })
    if (catalog?.groups?.some(group => group.id === 'opencode-zen-free-provider' && group.models?.length > 0)) break
    await new Promise(resolvePromise => setTimeout(resolvePromise, 500))
  }
  const group = catalog?.groups?.find(candidate => candidate.id === 'opencode-zen-free-provider')
  if (group?.name !== 'OpenCode Zen Free' || !Array.isArray(group.models) || group.models.length === 0) {
    throw new Error(`Packaged OpenCode Zen Free dynamic catalog is unavailable: ${JSON.stringify(catalog)}`)
  }
  const invalid = group.models.filter(model => typeof model?.id !== 'string' || !model.id.endsWith('-free'))
  if (invalid.length > 0) throw new Error(`Packaged OpenCode catalog contains non-free models: ${JSON.stringify(invalid)}`)
  if (!group.models.some(model => model.id === 'mimo-v2.5-free')) {
    throw new Error(`Packaged OpenCode catalog is missing mimo-v2.5-free: ${JSON.stringify(group.models)}`)
  }

  const checked = await call({ check: true, refresh: true, provider: group.id, model: 'mimo-v2.5-free' }, 120_000)
  const model = checked?.groups?.find(candidate => candidate.id === group.id)?.models?.find(candidate => candidate.id === 'mimo-v2.5-free')
  if (model?.status !== 'available' || !Number.isFinite(model.lastCheckedAt)) {
    throw new Error(`Packaged OpenCode mimo-v2.5-free inference probe failed: ${JSON.stringify(model)}`)
  }
  if (!['supported', 'unsupported', 'unknown'].includes(model.visionStatus ?? 'unknown')) {
    throw new Error(`Packaged OpenCode vision status is invalid: ${JSON.stringify(model)}`)
  }

  const persisted = await call({ refresh: true })
  const persistedModel = persisted?.groups?.find(candidate => candidate.id === group.id)?.models?.find(candidate => candidate.id === model.id)
  if (persistedModel?.status !== 'available' || persistedModel.lastCheckedAt !== model.lastCheckedAt) {
    throw new Error(`Packaged OpenCode model status was not retained: ${JSON.stringify(persistedModel)}`)
  }
  console.log(`Packaged OpenCode Zen Free catalog and mimo-v2.5-free inference verified (${group.models.length} dynamic models).`)
}

async function verifyFreeSearch(url) {
  const endpoint = path => authUrl(new URL(url), `/api/dsh-free-search-settings/${path}`)
  const post = async (path, body = {}) => {
    const response = await hostFetch(endpoint(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`Packaged Host free-search ${path} returned HTTP ${response.status}.`)
    return response.json()
  }

  const valueOf = described => described?.value?.namespaces?.find(candidate => candidate?.ns === 'free-search')?.value
  const valueOfMutation = mutation => mutation?.value?.value
  const switched = await post('mutate', { ns: 'free-search', ops: [{ op: 'set', path: ['provider'], value: 'ddg' }] })
  if (switched?.ok !== true || valueOfMutation(switched)?.provider !== 'ddg') {
    throw new Error(`Packaged Host free-search setting write failed: ${JSON.stringify(switched)}`)
  }
  const restored = await post('mutate', { ns: 'free-search', ops: [{ op: 'set', path: ['provider'], value: 'bing' }] })
  if (restored?.ok !== true || valueOfMutation(restored)?.provider !== 'bing') {
    throw new Error(`Packaged Host free-search default restore failed: ${JSON.stringify(restored)}`)
  }
  const described = await post('describe')
  const settings = valueOf(described)
  const expected = { provider: 'bing', bingMarket: 'zh-CN', lang: 'zh', safeSearch: 'off', cache: true, cacheTtl: 5, keyStorage: 'credentials' }
  for (const [key, value] of Object.entries(expected)) {
    if (settings?.[key] !== value) throw new Error(`Packaged Host free-search setting ${key} must be ${JSON.stringify(value)}; found ${JSON.stringify(settings?.[key])}.`)
  }

  const query = { query: '人工智能 科学研究 最新进展', maxResults: 3 }
  const first = await post('raw-search', query)
  const second = await post('raw-search', query)
  for (const [label, result] of [['first', first], ['second', second]]) {
    const sources = result?.value?.sources
    if (result?.ok !== true || result?.value?.provider !== 'bing' || !Array.isArray(sources) || sources.length === 0) {
      throw new Error(`Packaged Host free-search ${label} query failed: ${JSON.stringify(result)}`)
    }
    if (!sources.every(source => typeof source?.title === 'string' && source.title.length > 0
      && typeof source?.url === 'string' && /^https?:\/\//u.test(source.url)
      && typeof source?.snippet === 'string' && source.snippet.length > 0)) {
      throw new Error(`Packaged Host free-search ${label} query returned incomplete sources: ${JSON.stringify(sources)}`)
    }
  }
  if (first.value.cache !== 'miss' || second.value.cache !== 'hit') {
    throw new Error(`Packaged Host free-search cache contract failed: first=${first.value.cache}, second=${second.value.cache}.`)
  }
}

async function verifyZoteroStatus(url) {
  const rpcId = randomUUID()
  const response = await hostFetch(authUrl(new URL(url), '/api/zotero/status'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'zotero/status', payload: { args: {} } }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Packaged Zotero status returned HTTP ${response.status}.`)
  const envelope = await response.json()
  const value = envelope?.result?.value
  if (envelope?.rpcId !== rpcId || envelope?.result?.ok !== true
    || typeof value?.connected !== 'boolean' || typeof value?.diagnosis !== 'string'
    || value?.diagnosis === 'The Zotero service is not composed.') {
    throw new Error(`Packaged Zotero status contract failed: ${JSON.stringify(envelope)}`)
  }
}

async function verifyPubmedStatus(url) {
  const rpcId = randomUUID()
  const response = await hostFetch(authUrl(new URL(url), '/api/zerowallPubmed/getConfigStatus'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'zerowallPubmed/getConfigStatus', payload: { args: {} } }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Packaged PubMed status returned HTTP ${response.status}.`)
  const envelope = await response.json()
  const value = envelope?.result?.value
  if (envelope?.rpcId !== rpcId || envelope?.result?.ok !== true || value?.config?.enabled !== true || !Array.isArray(value?.keys)) {
    throw new Error('Packaged PubMed configuration service is unavailable.')
  }
  for (const name of ['NCBI_API_KEY', 'S2_API_KEY', 'OPENALEX_API_KEY']) {
    const key = value.keys.find(item => item.name === name)
    if (!key || typeof key.configured !== 'boolean' || !['dedicated', 'variable', 'environment', 'none'].includes(key.source)
      || Object.keys(key).some(field => !['name', 'configured', 'source'].includes(field))) {
      throw new Error(`Packaged PubMed credential status contract failed: ${name}.`)
    }
  }
}

async function verifyMineruStatus(url) {
  const rpcId = randomUUID()
  const response = await hostFetch(authUrl(new URL(url), '/api/zerowallMineru/getConfigStatus'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method: 'zerowallMineru/getConfigStatus',
      payload: { args: {} },
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Packaged Host MinerU status returned HTTP ${response.status}.`)
  const envelope = await response.json()
  const value = envelope?.result?.value
  if (envelope?.rpcId !== rpcId || envelope?.result?.ok !== true || value?.available !== true) {
    throw new Error(`Packaged Host MinerU status is unavailable: ${JSON.stringify(envelope)}`)
  }
  const expectedTools = ['mineru_activate', 'mineru_parse', 'mineru_batch_parse', 'mineru_task']
  const missingTools = expectedTools.filter(tool => !value.registeredTools?.includes(tool))
  if (missingTools.length > 0) throw new Error(`Packaged Host MinerU tools are missing: ${missingTools.join(', ')}`)
  if (value.tokenConfigured !== false || value.api !== 'local') {
    throw new Error(`Fresh packaged Host must select local extraction without a MinerU Token: ${JSON.stringify(value)}`)
  }
}

async function verifySinglecellStatus(url) {
  const rpcId = randomUUID()
  const response = await hostFetch(authUrl(new URL(url), '/api/zerowallSinglecell/searchGenes'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request', rpcId, method: 'zerowallSinglecell/searchGenes',
      payload: { args: { request: { targetGenes: ['HSPA1A'], maxCandidates: 1 } } },
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Packaged Host singlecell status returned HTTP ${response.status}.`)
  const envelope = await response.json()
  const value = envelope?.result?.value
  if (envelope?.rpcId !== rpcId || envelope?.result?.ok !== true || !Array.isArray(value)) {
    throw new Error(`Packaged Host singlecell status is unavailable: ${JSON.stringify(envelope)}`)
  }
  if (!value.some(candidate => candidate?.symbol === 'HSPA1A')) {
    throw new Error(`Packaged Host singlecell candidate resolver is unavailable: ${JSON.stringify(value)}`)
  }
}

async function verifyWebBootManifest(url) {
  const response = await hostFetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`Packaged Host index returned HTTP ${response.status}.`)
  const html = await response.text()
  // Current DSH injects the boot graph as `globalThis["__DSH_BOOT__"]`; earlier
  // releases assigned `window.__DSH_BOOT__`. Accept either spelling, and take
  // everything up to the closing tag so a nested object is not truncated.
  const match = /(?:window\.__DSH_BOOT__|globalThis\[["']__DSH_BOOT__["']\])\s*=\s*(\{[\s\S]*?\})\s*;?<\/script>/u.exec(html)
  if (match?.[1] === undefined) throw new Error('Packaged Host index did not contain the __DSH_BOOT__ graph.')
  const graph = JSON.parse(match[1])
  const entries = Array.isArray(graph?.entries) ? graph.entries : []
  const ids = new Set(entries.map(entry => entry?.id).filter(id => typeof id === 'string'))
  const required = [
    '@deepseek-ai/dsh-api-gateway',
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-api-workspace-controller',
    '@deepseek-ai/dsh-client-connection',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-chat',
    '@deepseek-ai/dsh-client-ui-theme',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-layout',
    '@deepseek-ai/dsh-client-ui-user-questions',
    '@zerowallscience/plugin-base',
    '@zerowallscience/plugin-projects',
    '@zerowallscience/plugin-account',
    '@zerowallscience/plugin-images',

    '@zerowallscience/plugin-mineru',
    '@zerowallscience/plugin-singlecell',
    '@zerowallscience/plugin-mcp',
    '@zerowallscience/plugin-skills',
    '@zerowallscience/plugin-reviewer',
    '@zerowallscience/plugin-research',

    'dsh-free-search', 'dsh-zotero',
  ]
  const missing = required.filter(id => !ids.has(id))
  if (missing.length > 0) {
    throw new Error(`Packaged Web boot manifest is incomplete. Missing: ${missing.join(', ')}. Found: ${[...ids].join(', ')}`)
  }
  for (const id of required) {
    const entry = entries.find(candidate => candidate?.id === id)
    const pluginUrl = authUrl(new URL(url), entry.url)
    const plugin = await hostFetch(pluginUrl, { signal: AbortSignal.timeout(10_000) })
    if (!plugin.ok) throw new Error(`Packaged client plugin ${id} returned HTTP ${plugin.status} at ${pluginUrl.href}: ${await plugin.text()}`)
  }
}


async function verifyDesktopStartup() {
  const root = await mkdtemp(resolve(tmpdir(), 'zerowall-packaged-desktop-'))
  // Reproduce the upgrade failure using durable storage, not just an empty
  // first-run profile. The optional replay file is copied, never modified.
  const sshPath = resolve(root, 'user-data/harness/storages/ssh_ops_profiles.json')
  await mkdir(resolve(root, 'user-data/harness/storages'), { recursive: true })
  const sshProfile = process.env.ZEROWALL_SSH_PROFILE_REPLAY
    ? JSON.parse(await readFile(process.env.ZEROWALL_SSH_PROFILE_REPLAY, 'utf8'))
    : { unit: { name: 'ssh_ops_profiles', version: 1 }, global: null, tables: { profiles: {
      '00000000-0000-4000-8000-000000000001': {
        name: 'Saved SSH regression', host: '192.0.2.1', port: 22, username: 'test', authKind: 'key', groupId: null,
        defaultProjectPath: null, createdAt: '2026-09-17T00:00:00Z', updatedAt: '2026-09-17T00:00:00Z',
      },
    }, groups: {} } }
  await writeFile(sshPath, JSON.stringify(sshProfile))
  if (process.env.ZEROWALL_ZOTERO_REPLAY_LOG) {
    const rows = (await readFile(process.env.ZEROWALL_ZOTERO_REPLAY_LOG, 'utf8')).trim().split(/\r?\n/u).map(JSON.parse)
    // Isolate the supplied history and cwd; never write into the user's profile.
    rows[0].cwd = root
    for (const row of rows) if (row.type === 'session/title') row.data.title = 'Zotero replay verification'
    const project = `--${root.replace(/[:\\/]+/gu, '-')}--`
    const dir = resolve(root, 'user-data/harness/sessions', project, rows[0].id)
    await mkdir(dir, { recursive: true })
    await writeFile(resolve(dir, 'session.v3.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n')
  }
  // Electron's app.getPath('appData') throws when APPDATA/LOCALAPPDATA do not
  // exist yet. Create the isolated roots so this smoke covers a clean first
  // launch instead of failing before the Harness can start.
  await mkdir(resolve(root, 'appdata'), { recursive: true })
  await mkdir(resolve(root, 'localappdata'), { recursive: true })
  const child = spawn(packaged.executablePath, ['--remote-debugging-port=0', `--user-data-dir=${resolve(root, 'chromium')}`], {
    cwd: packaged.root,
    // Isolate Electron's app.getPath('userData') as well as the Harness home.
    // Without this, a running installed copy can win Electron's single
    // instance lock and the verifier observes the wrong executable/profile.
    env: {
      ...process.env,
      APPDATA: resolve(root, 'appdata'),
      LOCALAPPDATA: resolve(root, 'localappdata'),
      ZEROWALL_USER_DATA_DIR: resolve(root, 'user-data'),
      USERPROFILE: root,
      HOME: root,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''
  const endpoint = new Promise((resolveEndpoint, rejectEndpoint) => {
    const timeout = setTimeout(() => rejectEndpoint(new Error(`Packaged desktop DevTools endpoint timed out.\n${output.slice(-12_000).replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]')}`)), 120_000)
    const onData = chunk => {
      output = `${output}${chunk.toString('utf8')}`.slice(-20_000)
      const match = /DevTools listening on (ws:\/\/[^\s]+)/u.exec(output)
      if (match?.[1] === undefined) return
      clearTimeout(timeout)
      resolveEndpoint(match[1])
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('exit', code => {
      clearTimeout(timeout)
      rejectEndpoint(new Error(`Packaged desktop exited before DevTools was ready (exit ${String(code)}).\n${output.slice(-12_000).replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]')}`))
    })
  })
  let browser
  try {
    browser = await chromium.connectOverCDP(await endpoint)
    const context = browser.contexts()[0]
    if (context === undefined) throw new Error('Packaged desktop did not expose a browser context.')
    const deadline = Date.now() + 120_000
    let page
    while (Date.now() < deadline) {
      page = context.pages().find(candidate => candidate.url().startsWith('http://127.0.0.1:'))
      if (page !== undefined) break
      await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
    }
    if (page === undefined) throw new Error(`Packaged desktop did not navigate to its Host.\n${output.slice(-12_000).replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]')}`)
    const browserErrors = []
    page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`)
    })
    page.on('requestfailed', request => browserErrors.push(`request: ${request.url()} ${request.failure()?.errorText ?? 'failed'}`))
    try {
      await page.waitForFunction(() => Array.isArray(window.__DSH_BOOT__?.entries), undefined, { timeout: 120_000 })
    } catch (error) {
      throw new Error(`Desktop boot failed at ${page.url()}. Body: ${(await page.locator('body').innerText()).slice(0, 6000)}\nBrowser: ${browserErrors.slice(-15).join('\n')}\nProcess: ${output.slice(-6000)}\n${error}`)
    }
    const ids = await page.evaluate(() => {
      const boot = window.__DSH_BOOT__
      return Array.isArray(boot?.entries) ? boot.entries.map(entry => entry.id) : []
    })
    for (const id of [
      '@deepseek-ai/dsh-api-session-controller', '@deepseek-ai/dsh-client-connection',
      '@deepseek-ai/dsh-client-ui-layout', '@zerowallscience/plugin-base',
      '@zerowallscience/plugin-projects', '@zerowallscience/plugin-account', '@zerowallscience/plugin-images',

      '@zerowallscience/plugin-mineru',
      '@zerowallscience/plugin-mcp', '@zerowallscience/plugin-skills', '@zerowallscience/plugin-reviewer',
      '@zerowallscience/plugin-research',
      'dsh-free-search', 'dsh-zotero',
      '@changfenhuang/dsh-genui',
    ]) {
      if (!ids.includes(id)) throw new Error(`Packaged desktop Web boot is missing ${id}.`)
    }
    try {
      // The packaged profile may initialize optional MCP/WeChat providers
      // before the shell replaces its loading card. Keep this aligned with
      // the overall desktop startup budget instead of treating a slow but
      // healthy plugin graph as a white-screen failure.
      await page.getByText('ZeroWall Science', { exact: true }).first().waitFor({ state: 'visible', timeout: 240_000 })
    } catch (error) {
      const snapshot = (await page.locator('body').innerText().catch(() => '')).slice(0, 4_000)
      throw new Error(`Packaged desktop did not render the ZeroWall Science brand. body=${JSON.stringify(snapshot)} errors=${JSON.stringify(browserErrors.slice(-20))}\n${error.message}`)
    }
    const bodyText = await page.locator('body').innerText()
    const startupDeadline = Date.now() + 60_000
    while (Date.now() < startupDeadline && (await page.evaluate(() => window.zerowallDesktop.getStartupStatus())).phase !== 'ready') await new Promise(resolve => setTimeout(resolve, 200))
    const startup = await page.evaluate(() => window.zerowallDesktop.getStartupStatus())
    if (startup.phase !== 'ready') throw new Error(`Desktop startup failed: ${startup.message}`)
    console.log(`Packaged startup ready in ${Date.now() - startup.startedAt} ms; saved SSH profiles: ${Object.keys(sshProfile.tables.profiles).length}; evidence: ${root}`)
    if (await readFile(sshPath, 'utf8') !== JSON.stringify(sshProfile)) throw new Error('Startup unexpectedly rewrote saved SSH profiles.')
    if (/Failed to load plugins|missed the module table|Cannot use import statement outside a module/iu.test(bodyText)) {
      throw new Error(`Packaged desktop rendered a plugin loading error: ${bodyText.slice(0, 4_000)}`)
    }
    const fatal = browserErrors.filter(error => /Failed to load plugins|missed the module table|Cannot use import statement outside a module/iu.test(error))
    if (fatal.length > 0) throw new Error(`Packaged desktop client errors:\n${fatal.join('\n')}`)
    const notice = page.getByRole('dialog', { name: '内测声明' })
    await notice.waitFor({ state: 'visible', timeout: 30_000 })
    await notice.getByRole('button', { name: '继续' }).click()
    const credential = page.getByRole('dialog', { name: '添加一个 API Key 开始使用' })
    const needsCredential = await credential.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false)
    if (needsCredential) {
      await credential.getByRole('button', { name: '稍后配置' }).click()
      await credential.waitFor({ state: 'hidden' })
    }
    await page.getByRole('button', { name: /^(设置|Settings)$/ }).click()
    const settings = page.getByRole('dialog', { name: /^(设置|Settings)$/ })
    const settingsNav = settings.locator('nav button')
    const settingsNavLabels = (await settingsNav.allInnerTexts()).map(label => label.trim()).filter(Boolean)
    if (!/^(关于|About)$/u.test(settingsNavLabels.at(-1) ?? '')) {
      throw new Error(`About must be the final Settings navigation entry; found ${JSON.stringify(settingsNavLabels)}.`)
    }
    await settingsNav.last().click()
    await settings.getByRole('heading', { name: 'ZeroWall Science', exact: true }).waitFor({ state: 'visible' })
    await settings.getByText(desktopManifest.version, { exact: true }).waitFor({ state: 'visible' })
    await page.screenshot({ path: resolve(root, 'settings-about-last.png'), fullPage: true })
    console.log(`Packaged Settings keeps About last and reports version ${desktopManifest.version}. Evidence: ${root}`)
    await settings.getByRole('button', { name: 'Zotero', exact: true }).click()
    await settings.locator('input[value="http://127.0.0.1:23119/api"]').waitFor({ state: 'visible', timeout: 30_000 })
    // Locale assertions use controlled fixture names; user-supplied names
    // retain their original language during saved-profile replay.
    if (!process.env.ZEROWALL_SSH_PROFILE_REPLAY) await verifySettingsLocales(page, settings, root)
    await verifyOpenCodeSettings(page, settings, root)
    await settings.getByRole('button', { name: /^(关闭|Close)$/ }).click()
    await verifyOpenCodeConversationSelector(page, root)
    if (process.env.ZEROWALL_ZOTERO_REPLAY_LOG) {
      try { await verifyConversationViews(page, root) } catch (error) {
        await page.screenshot({ path: resolve(root, 'replay-failure.png'), fullPage: true })
        await writeFile(resolve(root, 'replay-failure.txt'), await page.locator('body').innerText())
        throw new Error(`${error.message}\nReplay evidence: ${root}\nBrowser errors: ${browserErrors.slice(-10).join('\n')}`)
      }
    }
    const clientCss = await page.evaluate(() => {
      const markers = [...document.querySelectorAll('style[data-zerowall-plugin-css]')]
        .map(style => style.getAttribute('data-zerowall-plugin-css'))
      const update = document.querySelector('button[aria-label="检查应用更新"], button[aria-label="Check for app updates"]')
      const account = document.querySelector('button[aria-label="登录AI平台"], button[aria-label="Sign in to AI platform"], button[aria-label="ZeroWall 云账户"], button[aria-label="ZeroWall Cloud account"]')
      const inspect = (element) => element instanceof HTMLElement
        ? { className: element.className, height: getComputedStyle(element).height, cursor: getComputedStyle(element).cursor }
        : undefined
      return { markers, update: inspect(update), account: inspect(account) }
    })
    for (const id of ['@zerowallscience/plugin-base', '@zerowallscience/plugin-account']) {
      if (!clientCss.markers.includes(id)) throw new Error(`Packaged desktop did not inject CSS for ${id}.`)
    }
    for (const [name, button] of [['update', clientCss.update], ['AI Cloud account', clientCss.account]]) {
      if (button === undefined || button.className === '' || button.height === '0px' || button.cursor !== 'pointer') {
        throw new Error(`Packaged desktop ${name} button is missing or unstyled: ${JSON.stringify(button)}`)
      }
    }

  } finally {
    await browser?.close().catch(() => undefined)
    if (child.exitCode === null && child.pid !== undefined) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
      else child.kill('SIGTERM')
    }
  }
}

async function verifyConversationViews(page, root) {
  await page.getByText(root.split(/[\\/]/u).at(-1), { exact: true }).first().click()
  await page.getByText(root.split(/[\\/]/u).at(-1), { exact: true }).nth(1).click({ timeout: 30_000 })
  const tabs = page.locator('[data-conversation-view]')
  await tabs.waitFor({ state: 'visible' })
  const composer = page.locator('[data-composer-seat]')
  const editor = composer.locator('[contenteditable]')
  await tabs.locator('[data-conversation-tab="chat"]').click()
  const switchTo = async id => {
    await tabs.locator(`[data-conversation-tab="${id}"]`).click()
    await page.waitForFunction(id => document.querySelector('[data-conversation-view]')?.getAttribute('data-conversation-view') === id, id)
    if (await tabs.locator('[aria-selected="true"]').count() !== 1) throw new Error(`Multiple selected main tabs: ${id}`)
    if (await composer.isVisible()) throw new Error(`Composer still visible in ${id}`)
  }
  await switchTo('zotero')
  await page.getByText('Red blood cell distribution width to albumin ratio (RAR) is associated with low cognitive performance in American older adults: NHANES 2011-2014', { exact: true }).first().waitFor({ state: 'visible' })
  const rows = page.locator('[data-slot="conversation.view"] [role="option"][data-provenance]')
  if (await rows.count() !== 19) throw new Error(`Expected 19 literature rows, found ${await rows.count()}`)
  await rows.nth(1).click()
  if (await rows.nth(1).getAttribute('aria-selected') !== 'true') throw new Error('Literature row selection failed')
  await page.locator('[data-inspector-panel="overview"]').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: /问这篇|Ask about this/u }).click()
  await page.waitForFunction(() => document.querySelector('[data-conversation-view]')?.getAttribute('data-conversation-view') === 'chat')
  const draft = await editor.innerText()
  if (!draft.includes('zotero://')) throw new Error('Source action did not populate the resident draft')
  await switchTo('zotero')
  await page.screenshot({ path: resolve(root, 'zotero.png'), fullPage: true })
  await switchTo('ssh')
  const ssh = page.locator('[data-zerowall-ssh-view]')
  await ssh.waitFor({ state: 'visible' })
  const box = await ssh.boundingBox()
  if (!box || box.height < 250 || box.width < 300) throw new Error(`SSH workspace is collapsed: ${JSON.stringify(box)}`)
  await page.screenshot({ path: resolve(root, 'ssh.png'), fullPage: true })
  for (const id of await tabs.locator('[data-conversation-tab]').evaluateAll(elements => elements.map(el => el.getAttribute('data-conversation-tab')))) {
    if (id !== 'chat') await switchTo(id)
  }
  await tabs.locator('[data-conversation-tab="chat"]').click()
  if (await editor.innerText() !== draft) throw new Error('Chat draft lost across views')
  await switchTo('zotero')
  await page.reload()
  await page.locator('[data-conversation-tab="zotero"]').waitFor({ state: 'visible' })
  await page.locator('[data-conversation-tab="zotero"]').click()
  await page.getByText('Red blood cell distribution width to albumin ratio (RAR) is associated with low cognitive performance in American older adults: NHANES 2011-2014', { exact: true }).first().waitFor({ state: 'visible' })
  if (await rows.count() !== 19) throw new Error('Literature list was not restored after reload')
  console.log(`Packaged conversation replay, tabs, SSH and draft verified. Screenshots: ${root}`)
}

function hostEnvironment(root, dshEntry) {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_PATH: resolve(asarPath, 'node_modules'),
    ZEROWALL_RUNTIME_ANCHOR: pathToFileURL(dshEntry).href,
    DSH_HOME: resolve(root, 'harness'),
    DSH_BUNDLED_SKILL_DIR: resolve(packaged.resourcesRoot, 'skills'),
    ZEROWALL_RESEARCH_DB: resolve(root, 'research', 'zerowall-research.sqlite'),
    ZEROWALL_BUNDLED_SKILLS: resolve(packaged.resourcesRoot, 'skills'),
    DSH_TELEMETRY_DISABLED: '1',
    NO_COLOR: '1',
  }
}

async function verifyPlaintextSessionPersistence(url, root) {
  const sessionId = randomUUID()
  const rpcId = randomUUID()
  const response = await hostFetch(authUrl(new URL(url), '/api/session/create'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'session/create', payload: { args: { request: { cwd: root, sessionId } } } }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Packaged Host session.create returned HTTP ${response.status}.`)
  const envelope = await response.json()
  if (envelope?.rpcId !== rpcId || envelope?.result?.ok !== true || envelope.result.value?.sessionId !== sessionId) {
    throw new Error(`Packaged Host session.create returned an invalid response: ${JSON.stringify(envelope)}`)
  }

  const sessionsRoot = resolve(root, 'harness', 'sessions')
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const files = await listDiskFiles(sessionsRoot).catch(error => error?.code === 'ENOENT' ? [] : Promise.reject(error))
    if (files.some(path => path.endsWith('session.jsonl.zstd'))) throw new Error('Packaged Host wrote a compressed session.')
    const jsonl = files.find(path => path.endsWith('session.v3.jsonl'))
    if (jsonl !== undefined) {
      const firstLine = (await readFile(resolve(sessionsRoot, jsonl), 'utf8')).split('\n', 1)[0]
      if (JSON.parse(firstLine).id !== sessionId) throw new Error('Packaged Host persisted the wrong session id.')
      return
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  throw new Error('Packaged Host did not persist the smoke session as plaintext JSONL.')
}

async function runEmbeddedNode(arguments_, options) {
  await new Promise((resolvePromise, reject) => {
    const dshEntry = resolve(asarPath, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    const child = spawn(packaged.executablePath, arguments_, {
      ...options,
      env: hostEnvironment(options.cwd, dshEntry),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk.toString('utf8') })
    child.stderr.on('data', chunk => { output += chunk.toString('utf8') })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0
      ? resolvePromise()
      : reject(new Error(`Embedded Electron Node verification failed (${signal ?? `exit ${code}`}).\n${output.slice(-12_000).replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]')}`)))
  })
}

async function listDiskFiles(root) {
  const result = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name)
    if (entry.isDirectory()) {
      for (const child of await listDiskFiles(path)) result.push(`${entry.name}/${child}`)
    } else result.push(entry.name)
  }
  return result
}

async function directorySize(root) {
  let size = 0
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name)
    size += entry.isDirectory() ? await directorySize(path) : (await stat(path)).size
  }
  return size
}

async function reservePort() {
  return await new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const address = server.address()
      if (address === null || typeof address === 'string') return reject(new Error('Could not reserve a loopback port.'))
      server.close(error => error === undefined ? resolvePromise(address.port) : reject(error))
    })
  })
}

function normalizeArchivePath(path) {
  return path.replaceAll('\\', '/').replace(/^\/+/, '')
}

function readArchiveFile(path) {
  const entry = archiveEntryByPath.get(path)
  if (entry === undefined) throw new Error(`ASAR file is missing: ${path}`)
  return extractFile(asarPath, entry)
}

async function verifySourceRuntimePolicy() {
  const upstream = JSON.parse(await readFile(resolve(repositoryRoot, 'config', 'deepseek-harness', 'upstream.json'), 'utf8'))
  if (upstream.version !== '0.1.5-rc.2' || upstream.tag !== 'dsh-v0.1.5-rc.2') {
    throw new Error(`Pinned DSH must be rc.2; found ${upstream.version ?? 'unknown'} (${upstream.tag ?? 'no tag'}).`)
  }
  const sourceDsh = JSON.parse(await readFile(resolve(repositoryRoot, 'deepseek-harness', 'package.json'), 'utf8'))
  if (sourceDsh.version !== upstream.version) throw new Error(`DSH source package must be ${upstream.version}; found ${sourceDsh.version}.`)

  for (const oldPath of ['dsh/source', 'dsh/lock', 'apps/desktop', 'vendor/deepseek-harness', 'packages/platform-host', 'packages/platform-client', 'plugins/presentations-runtime']) {
    try {
      await access(resolve(repositoryRoot, oldPath))
      throw new Error(`Legacy repository path still exists: ${oldPath}`)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }

  const manifests = [
    resolve(repositoryRoot, 'package.json'),
    resolve(repositoryRoot, 'desktop', 'package.json'),
    ...await pluginManifestPaths(),
  ]
  const manifestText = (await Promise.all(manifests.map(path => readFile(path, 'utf8')))).join('\n')
  for (const forbidden of ['0.1.1-rc.2', '@deepseek-ai/dsh-client-runtime', '@zerowallscience/platform-host', '@zerowallscience/platform-client']) {
    if (manifestText.includes(forbidden)) throw new Error(`Runtime manifests contain forbidden legacy reference: ${forbidden}`)
  }

  const wechat = JSON.parse(await readFile(resolve(repositoryRoot, 'packages', 'dsh-wechat', 'package.json'), 'utf8'))
  if (wechat.name !== 'dsh-wechat' || wechat.version !== pinnedIntegrations.wechat.version) throw new Error(`Expected the pinned dsh-wechat snapshot; found ${wechat.name}@${wechat.version}.`)
  await access(resolve(repositoryRoot, 'packages', 'dsh-wechat', 'dist', 'index.js'))
  const stableProfile = await readFile(resolve(repositoryRoot, 'profiles', 'generated', 'stable.yml'), 'utf8')
  const desktopPatch = await readFile(resolve(repositoryRoot, 'desktop', 'build', 'zerowall.patch.yml'), 'utf8')
  if (!stableProfile.includes("'@huanlin/dsh-plugin-better-sidebar-plugin-office'")
    || !stableProfile.includes("'dsh-wechat'")
    || !/wechat:[\s\S]*enabled:\s*true[\s\S]*autoConnect:\s*false[\s\S]*channel:\s*ilink/u.test(stableProfile)) {
    throw new Error('Stable profile must include the Office viewer and enable WeChat while keeping first-start autoConnect disabled.')
  }
  if (!desktopPatch.includes("name: '@huanlin/dsh-plugin-better-sidebar-plugin-office'")) {
    throw new Error('Packaged Electron patch must mount the Better-sidebar Office viewer.')
  }
  if (!desktopPatch.includes("name: 'dsh-wechat'")) throw new Error('Packaged Electron patch must mount dsh-wechat.')
  if (!desktopPatch.includes("name: '@jiesou/dsh-opencode-zen-free-provider'")
    || !stableProfile.includes("'@jiesou/dsh-opencode-zen-free-provider'")) {
    throw new Error('OpenCode Zen Free provider must be mounted in the packaged desktop and Stable profile.')
  }
  if (/opencode2dsh|@zerowallscience\/plugin-opencode/u.test(desktopPatch + stableProfile)) {
    throw new Error('Retired local OpenCode provider must not be mounted or selected.')
  }
}

async function verifyOpenCodeSettings(page, settings, root) {
  try {
    await settings.getByRole('button', { name: '模型', exact: true }).click()
    await settings.getByRole('heading', { name: '模型', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
    await settings.getByText('OpenCode Zen Free', { exact: true }).first().waitFor({ state: 'visible', timeout: 60_000 })
    await settings.getByRole('button', { name: '检测全部模型', exact: true }).waitFor({ state: 'visible' })
    const model = settings.locator('li').filter({ has: page.locator('[title="mimo-v2.5-free"]') }).first()
    await model.waitFor({ state: 'visible', timeout: 60_000 })
    await model.getByRole('button', { name: /^检测 /u }).waitFor({ state: 'visible' })
    await waitForModelAvailability(model, 60_000).catch(async () => {
      await model.getByRole('button', { name: /^检测 /u }).click()
      await waitForModelAvailability(model, 120_000)
    })
    if (!await model.getByText('可用', { exact: true }).isVisible()) throw new Error('mimo-v2.5-free did not render the available status')
    await page.screenshot({ path: resolve(root, 'settings-models-opencode-zen-free.png'), fullPage: true })
    console.log(`Packaged OpenCode Zen Free model settings and detection controls verified. Evidence: ${root}`)
  } catch (error) {
    await page.screenshot({ path: resolve(root, 'settings-models-opencode-failure.png'), fullPage: true })
    await writeFile(resolve(root, 'settings-models-opencode-failure.txt'), await page.locator('body').innerText())
    throw new Error(`${error.message}\nOpenCode settings evidence: ${root}`)
  }
}

async function verifyOpenCodeConversationSelector(page, root) {
  try {
    const trigger = page.getByRole('button', { name: /^(选择模型，当前|Select model, current)/u }).first()
    await trigger.waitFor({ state: 'visible', timeout: 30_000 })
    await trigger.click()
    const menu = page.getByRole('menu', { name: /^(模型与推理等级|Model and reasoning effort)$/u })
    await menu.waitFor({ state: 'visible' })
    await menu.getByRole('menuitem', { name: /^(模型|Model)\s/u }).click()
    const group = menu.getByRole('group', { name: 'OpenCode Zen Free', exact: true })
    await group.waitFor({ state: 'visible', timeout: 60_000 })
    const model = group.getByRole('menuitemradio', { name: 'MiMo V2.5 Free', exact: true })
    await model.waitFor({ state: 'visible' })
    await model.scrollIntoViewIfNeeded()
    await page.screenshot({ path: resolve(root, 'conversation-models-opencode-zen-free.png'), fullPage: true })
    await page.keyboard.press('Escape')
    console.log(`Packaged conversation model selector includes OpenCode Zen Free. Evidence: ${root}`)
  } catch (error) {
    await page.screenshot({ path: resolve(root, 'conversation-models-opencode-failure.png'), fullPage: true })
    await writeFile(resolve(root, 'conversation-models-opencode-failure.txt'), await page.locator('body').innerText())
    throw new Error(`${error.message}\nOpenCode conversation selector evidence: ${root}`)
  }
}

async function waitForModelAvailability(model, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await model.getAttribute('data-status') === 'available') return
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
  }
  throw new Error(`mimo-v2.5-free remained ${await model.getAttribute('data-status') ?? 'unknown'}`)
}

async function pluginManifestPaths() {
  const root = resolve(repositoryRoot, 'plugins')
  const manifests = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifest = resolve(root, entry.name, 'package.json')
    try {
      await access(manifest)
      manifests.push(manifest)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return manifests
}
