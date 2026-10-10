import { stageRoot, targetPackageRoot } from '../../tools/build/paths.mjs'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import { access, mkdir, mkdtemp, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractFile, listPackage } from '@electron/asar'
import { chromium } from 'playwright'
import yaml from 'yaml'
import { verifyOfflineProfile, prepareOfflineCandidate } from '../../tools/commands/offline-profile.mjs'
import { locatePackagedApp } from './packaged-app.mjs'
import { verifySettingsLocales } from './verify-settings-locales.mjs'
import { prepareOfflineNetworkProbe, verifyOfflineNetworkProbe } from './offline-network-probe.mjs'
import { verifyZoteroDispatch } from '../../tools/packaging/verify-zotero-dispatch.mjs'

const hostCookies = new Map()
const MIB = 1024 * 1024
const packageRoot = resolve(import.meta.dirname, '..')
const repositoryRoot = resolve(packageRoot, '..')
const pinnedUpstream = JSON.parse(await readFile(resolve(repositoryRoot, 'config', 'deepseek-harness', 'upstream.json'), 'utf8'))
const pinnedIntegrations = JSON.parse(await readFile(resolve(repositoryRoot, 'config', 'integrations', 'upstream-sources.json'), 'utf8'))
const desktopManifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'))
const runtimeProfile = JSON.parse(await readFile(resolve(repositoryRoot, 'config', 'layout', 'runtime-profile.json'), 'utf8'))
const fullOffline = runtimeProfile.optionalPluginPolicy?.offlineClosure === 'offline-profile/modules'
const coreOnly = runtimeProfile.optionalPluginPolicy?.bundled === false && !fullOffline
const desktopOnly = process.argv.includes('--desktop-only')
const hostOnly = process.argv.includes('--host-only')
const offlineNetwork = process.argv.includes('--offline-network')
const requireBundledPython = process.argv.includes('--require-bundled-python')
const requireThinPython = process.argv.includes('--require-thin-python')

if (process.argv.includes('--audit-source')) {
  await verifySourceRuntimePolicy()
  console.log(`ZeroWall source runtime policy verified for DSH ${pinnedUpstream.version} and iLink-only WeChat.`)
  process.exit(0)
}

const packaged = await locatePackagedApp(packageRoot)
const asarPath = resolve(packaged.resourcesRoot, 'app.asar')
await access(asarPath)
const bundledPythonManifestPath = resolve(packaged.resourcesRoot, 'python', 'base-manifest.json')
const bundledPythonArchivePath = resolve(packaged.resourcesRoot, 'python', 'base-runtime.zip')
if (requireThinPython) {
  const [hasManifest, hasArchive] = await Promise.all([bundledPythonManifestPath, bundledPythonArchivePath].map(path => access(path).then(() => true, () => false)))
  if (hasManifest || hasArchive) throw new Error('Stable Windows package must not bundle the Python bootstrap archive; Python + pip are installed from the signed resource feed after first launch.')
  console.log('[python] thin installer verified: no bundled bootstrap manifest or archive.')
}
let bundledPythonManifest
try {
  bundledPythonManifest = JSON.parse(await readFile(bundledPythonManifestPath, 'utf8'))
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
  if (requireBundledPython) throw new Error('Windows Stable package is missing its signed Python base manifest; offline recovery is required.')
  try {
    await access(bundledPythonArchivePath)
    throw new Error('Packaged ZeroWall Python archive exists without its manifest.')
  } catch (archiveError) {
    if (archiveError?.code !== 'ENOENT') throw archiveError
  }
  console.log('[python] no bundled base runtime; this verification was run without --require-bundled-python.')
}
if (bundledPythonManifest !== undefined) {
  if (bundledPythonManifest.schema !== 2 || bundledPythonManifest.environmentId !== 'zerowall-python' || bundledPythonManifest.platform !== 'win32' || bundledPythonManifest.architecture !== 'x64' || typeof bundledPythonManifest.environmentVersion !== 'string' || bundledPythonManifest.signature?.algorithm !== 'ed25519') {
    throw new Error(`Packaged ZeroWall Python manifest identity or target is invalid: schema=${bundledPythonManifest.schema}, environmentId=${bundledPythonManifest.environmentId}, platform=${bundledPythonManifest.platform}, architecture=${bundledPythonManifest.architecture}.`)
  }
  const bundledPythonArchiveInfo = await stat(bundledPythonArchivePath)
  if (!bundledPythonArchiveInfo.isFile() || bundledPythonArchiveInfo.size !== bundledPythonManifest.archiveSize) throw new Error('Packaged ZeroWall Python archive size does not match its signed manifest.')
  const bundledPythonHash = createHash('sha256')
  for await (const chunk of createReadStream(bundledPythonArchivePath)) bundledPythonHash.update(chunk)
  if (bundledPythonHash.digest('hex') !== bundledPythonManifest.archiveSha256) throw new Error('Packaged ZeroWall Python archive SHA-256 does not match its signed manifest.')
}

const archiveEntries = listPackage(asarPath, { isPack: false })
const rawArchiveFiles = archiveEntries.map(normalizeArchivePath)
const archiveFiles = [...rawArchiveFiles]
const archiveEntryByPath = new Map(archiveEntries.map(entry => [normalizeArchivePath(entry), entry.replace(/^[/\\]+/, '')]))
const archiveSet = new Set(archiveFiles)
const rawArchiveSet = new Set(rawArchiveFiles)
let offlineReceipt, offlineProbe
if (fullOffline) {
  const keys = JSON.parse(await readFile(resolve(repositoryRoot, 'config/catalogs/trusted-keys.json'), 'utf8'))
  offlineReceipt = (await verifyOfflineProfile(resolve(packaged.resourcesRoot, 'offline-profile'), keys, {
    desktopVersion: desktopManifest.version, dshVersion: pinnedUpstream.version, dshCommit: pinnedUpstream.commit,
    platform: process.platform, architecture: process.arch,
  })).receipt
  for (const entry of offlineReceipt.files.filter(entry => entry.path.startsWith('modules/'))) {
    const logical = 'node_modules/' + entry.path.slice('modules/'.length)
    if (!archiveSet.has(logical)) { archiveFiles.push(logical); archiveSet.add(logical) }
  }
  await verifyCoreRuntimeArchive()
  // Imports exercise the installed generation's real node_modules boundary.
  const probeHome = await mkdtemp(resolve(tmpdir(), 'zerowall-离线闭包-'))
  const { initializeProfile } = await import('../../tools/commands/profile.mjs')
  const defaults = JSON.parse(await readFile(resolve(packaged.resourcesRoot, 'commands/default-plugins.json'), 'utf8'))
  const bundledSkillVersions = JSON.parse(await readFile(resolve(packaged.resourcesRoot, 'commands/bundled-skill-versions.json'), 'utf8'))
  const skillVersions = JSON.parse(await readFile(resolve(repositoryRoot, 'config/catalogs/resource-versions.json'), 'utf8')).skill
  for (const [id, version] of Object.entries(bundledSkillVersions)) {
    if (version !== (skillVersions[id] ?? '0.1.0')) throw new Error(`Packaged Skill version snapshot is stale: ${id}`)
  }
  await initializeProfile(probeHome, defaults, offlineReceipt.plugins)
  offlineProbe = await prepareOfflineCandidate({ home: probeHome, source: resolve(packaged.resourcesRoot, 'offline-profile'), keys,
    target: { desktopVersion: desktopManifest.version, dshVersion: pinnedUpstream.version, dshCommit: pinnedUpstream.commit, platform: process.platform, architecture: process.arch }, defaults, yaml,
  })
  if (offlineProbe.blocked.length) throw new Error('New offline import profile unexpectedly blocked')
}

if (archiveFiles.some(path => path.includes('node_modules/@fylar/'))) {
  throw new Error('Excluded commercial Fylar Office SDK found in the packaged runtime.')
}
if (archiveFiles.some(path => path.startsWith('node_modules/@daweifu/capability-menu/'))) {
  throw new Error('Retired capability-menu package must not enter the packaged runtime.')
}
const claudeCodeRuntimePatterns = [
  /(?:^|\/)claude\.exe$/iu,
  /(?:^|\/)node_modules\/@deepseek-ai\/dsh-subagent-claude-code\//iu,
  /(?:^|\/)node_modules\/@anthropic-ai\/claude-agent-sdk\//iu,
  /(?:^|\/)node_modules\/@anthropic-ai\/claude-code(?:-linux|-darwin|-win32)?-/iu,
  /(?:^|\/)hooks-claude-code\//iu,
]
const bundledClaudeCodeRuntime = archiveFiles.find(path => claudeCodeRuntimePatterns.some(pattern => pattern.test(path)))
if (bundledClaudeCodeRuntime) {
  throw new Error(`Claude Code runtime must not be packaged: ${bundledClaudeCodeRuntime}`)
}
for (const retired of ['@zerowallscience/plugin-opencode', '@jiesou/dsh-opencode-zen-free-provider', 'dsh-opencode-zen-free-provider', '@zerowallscience/plugin-image-dup', '@zerowallscience/plugin-presentations', '@zerowallscience/presentations-runtime']) {
  if (archiveFiles.some(path => path.startsWith(`node_modules/${retired}/`))) {
    throw new Error(`Retired module is still in the packaged runtime: ${retired}`)
  }
}
const packagedManifest = JSON.parse(readArchiveFile('package.json').toString('utf8'))
const packagedBuildReceipt = JSON.parse(await readFile(resolve(packaged.resourcesRoot, 'licenses/build-receipt.json'), 'utf8'))
const runtimeBuildReceipt = JSON.parse(await readFile(resolve(stageRoot, 'runtime/build-receipt.json'), 'utf8'))
if (packagedBuildReceipt.commit !== pinnedUpstream.commit
  || packagedBuildReceipt.version !== pinnedUpstream.version
  || packagedBuildReceipt.applicationVersion !== desktopManifest.version
  || JSON.stringify(packagedBuildReceipt) !== JSON.stringify(runtimeBuildReceipt)) {
  throw new Error('Packaged Harness receipt differs from the current pinned build. Repackage the current runtime.')
}
if (coreOnly) {
  await verifyCoreRuntimeArchive()
  await verifyExternalPolicy()
  await verifySizePolicy()
  await verifyCoreImports()
  await verifyNativeRuntime()
  await verifyDirectoryPickerWorker()
  if (!desktopOnly) await verifyHostStartup()
  if (!hostOnly) await verifyDesktopStartup()
  console.log(`Packaged ZeroWall Core runtime verified; optional plugins and resource payloads remain profile-managed; startup: ${hostOnly ? 'Host' : desktopOnly ? 'Desktop' : 'Host and Desktop'}.`)
  process.exit(0)
}
for (const [plugin, file] of ['mcp', 'research'].flatMap(plugin => ['lib/client.js', 'lib/index.js'].map(file => [plugin, file]))) {
  const path = `node_modules/@zerowallscience/plugin-${plugin}/${file}`
  if (!readArchiveFile(path).equals(await readFile(resolve(stageRoot, fullOffline && !rawArchiveSet.has(path) ? 'offline-profile/modules' : 'runtime/node_modules', path.slice('node_modules/'.length))))) {
    throw new Error(`Packaged ${plugin} ${file} is stale. Repackage the current runtime.`)
  }
}
const moleculePrefix = 'node_modules/@zerowallscience/plugin-research/lib/'
const moleculeManifest = JSON.parse(readArchiveFile(`${moleculePrefix}molecule-runtime.manifest.json`).toString('utf8'))
const moleculeRuntime = readArchiveFile(`${moleculePrefix}molecule-runtime.js`)
if (moleculeManifest.version !== '5.11.0' || moleculeRuntime.length !== moleculeManifest.size || createHash('sha256').update(moleculeRuntime).digest('hex') !== moleculeManifest.sha256) {
  throw new Error('Packaged molecular viewer runtime differs from its fixed version/hash manifest.')
}
if (!readArchiveFile(`${moleculePrefix}molecule-runtime.LICENSE.txt`).toString('utf8').includes('MIT')) throw new Error('Packaged molecular viewer license is missing.')
for (const entry of ['out/main/index.js', 'out/main/python-updater-worker.js', 'out/preload/index.cjs']) {
  if (!readArchiveFile(entry).equals(await readFile(resolve(packageRoot, entry)))) {
    throw new Error(`Packaged ${entry} differs from the completed desktop build. Rebuild before packaging.`)
  }
}
for (const entry of fullOffline ? [] : ['out/main/python-updater-worker.js', 'node_modules/yauzl/index.js', 'node_modules/pend/index.js']) {
  await access(resolve(packaged.resourcesRoot, 'app.asar.unpacked', entry))
}
const packagedMcpHost = readArchiveFile('node_modules/@zerowallscience/plugin-mcp/lib/index.js').toString('utf8')
if (/from\s*['"]@deepseek-ai\/dsh-mcp-client\/src\//u.test(packagedMcpHost)) {
  throw new Error('MCP generation bridge must be bundled; the packaged app cannot import unpublished MCP source files.')
}
const requiredArchivePaths = [
  'node_modules/@dsh-external/zotero-harvest/lib/index.js',
  'node_modules/@dsh-external/zotero-harvest/lib/save/local-api.js',
  'node_modules/@dsh-external/zotero-harvest/LICENSE',
  'node_modules/dsh-zotero/lib/index.js',
  'node_modules/dsh-zotero/lib/client.js',
  // dsh-zotero 0.11.x moved annotation graph traversal into the local
  // children-wire module. Older 0.8.x builds shipped item-graph.js instead.
  'node_modules/dsh-zotero/lib/local/children-wire.js',
  'node_modules/dsh-zotero/lib/local/detail.js',
  'node_modules/dsh-zotero/cordis.patch.yml',
  'node_modules/dsh-zotero/docs/images/icon.png',
  'node_modules/dsh-zotero/locale/zh.json',
  'node_modules/dsh-dream-skin/icon.svg',
  'node_modules/dsh-better-sidebar/icon.svg',
  'node_modules/dsh-zotero/LICENSE',
  'node_modules/dsh-ssh-ops/lib/index.js',
  'node_modules/dsh-ssh-ops/lib/client.js',
  'node_modules/dsh-ssh-ops/lib/typert.js',
  'node_modules/dsh-ssh-ops/cordis.patch.yml',
  'node_modules/@everclear077/dsh-progressive-tools/lib/index.js',
  'node_modules/@everclear077/dsh-progressive-tools/cordis.patch.yml',
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
  'node_modules/dsh-better-sidebar/lib/client-mermaid.js',
  'node_modules/dsh-better-sidebar/package.json',
  'node_modules/dsh-dream-skin/lib/index.js',
  'node_modules/dsh-dream-skin/lib/client.js',
  'node_modules/dsh-dream-skin/package.json',
  'node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js',
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
  'node_modules/dsh-file-review/lib/index.js',
  'node_modules/dsh-file-review/lib/client.js',
  'node_modules/dsh-file-review/cordis.patch.yml',
  'node_modules/dsh-wechat/dist/index.js',
  'node_modules/dsh-wechat/dist/client.js',
  'node_modules/dsh-free-search/lib/index.js',
  'node_modules/dsh-free-search/lib/client.js',
  'node_modules/dsh-free-search/package.json',
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
  resolve(packaged.resourcesRoot, 'extensions/mcp/bio-tools', 'run_server.py'),
  resolve(packaged.resourcesRoot, 'extensions/mcp/ketcher-chemistry', 'server.js'),
  resolve(packaged.resourcesRoot, 'sci', 'dist', 'cli.mjs'),
  resolve(packaged.resourcesRoot, 'sci', 'dist', 'mcp.cjs'),
  resolve(packaged.resourcesRoot, 'sci', 'zerowall-mcp-launcher.cjs'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'literature-review', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'pubmed-literature', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'mineru-document-parser', 'SKILL.md'),
  ...['zerowall-image-dup', 'zerowall-paper-analysis', 'zerowall-paper-compare', 'zerowall-integrity-report'].map(name => resolve(packaged.resourcesRoot, 'extensions/skills', name, 'SKILL.md')),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'bioinfor-figure-export', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'bioinfor-literature-search-digest', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'bioinfor-public-data-access', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'code-organization', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'managing-pixi-environments', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'pixi-environment-builder', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'project-scaffold', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'sc-upstream', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'singlecell-milor', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'singlecell-milor', 'scripts', 'generate_milor_r_script.py'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'singlecell-milor', 'templates', 'milor_readable_template.R'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'singlecell-qc', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'singlecell-qc', 'scripts', 'calculate_metrics.py'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'singlecell-qc', 'scripts', 'calculate_metrics.R'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'singlecell-qc', 'assets', 'gene_sets', 'hbb_genes_human.txt'),
  resolve(packaged.resourcesRoot, 'extensions/skills', 'bioinfor-public-data-access', 'scripts', 'public_data_plan.py'),
  resolve(packaged.resourcesRoot, 'licenses', 'THIRD_PARTY_NOTICES.md'),
  resolve(packaged.resourcesRoot, 'licenses', 'deepseek-harness.version.json'),
]) await access(path)

const packagedSplash = await readFile(resolve(packaged.resourcesRoot, 'splash.html'), 'utf8')
const sourceSplash = await readFile(resolve(packageRoot, 'build', 'splash.html'), 'utf8')
if (packagedSplash !== sourceSplash) throw new Error('Packaged splash.html differs from the current desktop source.')
for (const marker of ["params.get('version')", 'width: min(860px, calc(100% - 96px))', 'height: 14px']) {
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
  // Different Sharp native builds share libvips in one Windows Host process.
  // Mixed versions can load successfully yet corrupt colourspace operations.
  const sharpVersions = new Set(archiveFiles.filter(path => /(?:^|\/)node_modules\/sharp\/package\.json$/.test(path)).map(path => JSON.parse(readArchiveFile(path).toString('utf8')).version))
  if (sharpVersions.size !== 1 || !sharpVersions.has('0.35.3')) throw new Error(`Packaged Host must use one Sharp 0.35.3 native ABI; found ${[...sharpVersions].join(', ')}.`)
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
    ['node_modules/dsh-better-sidebar/lib/client-editor.js', 'packages/dsh/dsh-better-sidebar/lib/client-editor.js'],
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
  // Sidebar 0.22.1 renamed the internal snapshot ref used by its directory
  // watcher from `expandedRef` to `wantedRef`; both implementations preserve
  // the same contract: the watcher reconciles a stable expanded-directory
  // snapshot instead of closing over a render-time array.
  if (!betterSidebarClient.includes('expandedRef.current')
    && !betterSidebarClient.includes('wantedRef.current')) {
    throw new Error('Packaged dsh-better-sidebar is missing the stable expanded-directory snapshot used by file-tree refreshes.')
  }

  const forbiddenBetterSidebarFiles = archiveFiles.filter(path => path.startsWith('node_modules/dsh-better-sidebar/') && (
    /^node_modules\/dsh-better-sidebar\/README(?:_[^/]+)?\.md$/iu.test(path)
    || /^node_modules\/dsh-better-sidebar\/LICENSE$/iu.test(path)
    || /^node_modules\/dsh-better-sidebar\/scripts\//iu.test(path)
  ))
  if (forbiddenBetterSidebarFiles.length > 0) throw new Error(`Better-sidebar documentation/install files found in ASAR:\n${forbiddenBetterSidebarFiles.join('\n')}`)
  for (const removed of ['node_modules/dsh-better-sidebar-icons/', 'node_modules/@huanlin/dsh-plugin-better-sidebar-plugin-office/']) {
    if (archiveFiles.some(path => path.startsWith(removed))) throw new Error(`Removed plugin must not be packaged: ${removed}`)
  }
  const dreamSkinPackages = archiveFiles.filter(path => path.endsWith('node_modules/dsh-dream-skin/package.json'))
  if (dreamSkinPackages.length !== 1) throw new Error(`dsh-dream-skin must be packaged exactly once; found ${dreamSkinPackages.length}.`)
  const dreamSkinManifest = JSON.parse(readArchiveFile('node_modules/dsh-dream-skin/package.json').toString('utf8'))
  const dreamSkinLock = JSON.parse(await readFile(resolve(repositoryRoot, 'config/integrations/upstream-sources.json'), 'utf8')).dreamSkin
  if (desktopManifest.dependencies['dsh-dream-skin'] !== dreamSkinLock.version || dreamSkinManifest.version !== (dreamSkinLock.resourceVersion ?? dreamSkinLock.version)) throw new Error(`Packaged dsh-dream-skin must match locked source ${dreamSkinLock.version} and resource ${dreamSkinLock.resourceVersion ?? dreamSkinLock.version}; found ${dreamSkinManifest.version}.`)
  const dreamSkinClient = readArchiveFile('node_modules/dsh-dream-skin/lib/client.js')
  const sourceDreamSkinClient = await readFile(resolve(repositoryRoot, 'desktop/node_modules/dsh-dream-skin/lib/client.js'))
  const { adaptDreamSkinClient } = await import('../../tools/packaging/adapt-dream-skin.mjs')
  if (!dreamSkinClient.equals(Buffer.from(adaptDreamSkinClient(sourceDreamSkinClient.toString('utf8'))))) {
    throw new Error('Packaged Dream Skin client must match the pinned v10.9.3 source and ZeroWall appearance patch.')
  }
  const dreamSkinSource = dreamSkinClient.toString('utf8')
  const factoryDefaults = dreamSkinSource.match(/const FACTORY_DEFAULTS = \{([\s\S]*?)\n\t\t\};/u)?.[1]
  const wallpaper = factoryDefaults?.match(/\[WALLPAPER_KEY\]: "data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)"/u)?.[1]
  if (!dreamSkinSource.includes('const FACTORY_SKIN_ID = "nebula";')
    || !factoryDefaults?.includes('[STORAGE_KEY]: FACTORY_SKIN_ID,') || !wallpaper
    || !dreamSkinSource.includes('FACTORY_DEFAULTS[STORAGE_KEY] = "ivory"')
    || !dreamSkinSource.includes('FACTORY_DEFAULTS[WALLPAPER_KEY] = ""')
    || !dreamSkinSource.includes('FACTORY_DEFAULTS[WALLPAPER_GRADIENT_KEY] = ""')
    || !dreamSkinSource.includes('id: "ivory",')
    || !dreamSkinSource.includes('"skin.ivory": "iOS Flat"')
    || !dreamSkinSource.includes('function migrateLegacyFactoryAppearance()')
    || !dreamSkinSource.includes('const legacyHostFactory = parsed.value[STORAGE_KEY] === LEGACY_FACTORY_SKIN')) {
    throw new Error('Dream Skin must start with iOS Flat, no purple wallpaper, and an old-factory migration.')
  }
  const defaultSvg = Buffer.from(wallpaper, 'base64').toString('utf8')
  if (!defaultSvg.startsWith('<svg') || !defaultSvg.includes('<radialGradient') || /<(?:path|image|text|use|foreignObject)\b/iu.test(defaultSvg)) {
    throw new Error('Dream Skin legacy factory wallpaper fingerprint must be an abstract SVG rather than a picture.')
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
  const expectedFreeSearchInject = ['@deepseek-ai/dsh-client-ui-commands', '@deepseek-ai/dsh-client-ui-plugin-manager', '@deepseek-ai/dsh-client-ui-renderer']
  if (JSON.stringify(freeSearchInject) !== JSON.stringify(expectedFreeSearchInject)) {
    throw new Error(`Packaged dsh-free-search has an incompatible client inject contract: ${JSON.stringify(freeSearchInject)}; expected ${JSON.stringify(expectedFreeSearchInject)}.`)
  }
  const freeSearchHost = readArchiveFile('node_modules/dsh-free-search/lib/index.js').toString('utf8')
  const freeSearchClient = readArchiveFile('node_modules/dsh-free-search/lib/client.js').toString('utf8')
  for (const marker of ['id: "ddg"', 'searchBing', 'advanced_search', 'platform_search', 'free_search_test', 'registerSearchProvider']) {
    if (!freeSearchHost.includes(marker)) throw new Error(`Packaged dsh-free-search Host is missing marker: ${marker}`)
  }
  const freeSearchClientMarkers = ['plugins.row.config', 'free-search-engine', 'slots', 'commandUi']
  for (const marker of freeSearchClientMarkers) {
    if (!freeSearchClient.includes(marker)) throw new Error(`Packaged dsh-free-search client is missing marker: ${marker}`)
  }
  const expectedFreeSearchClientInject = 'const inject = ["slots", "commandUi"]'
  if (!freeSearchClient.includes(expectedFreeSearchClientInject) || !freeSearchClient.includes('ctx.inject(["commandUi"]')) {
    throw new Error('Packaged dsh-free-search must keep the settings card independent from the optional command UI service.')
  }
  const fileReviewClient = readArchiveFile('node_modules/dsh-file-review/lib/client.js').toString('utf8')
  for (const forbidden of ['https://github.com/left0ver/dsh-file-review', 'Star on GitHub', '去 GitHub 点 Star']) {
    if (fileReviewClient.includes(forbidden)) throw new Error(`Packaged file review settings still contains the removed GitHub promotion: ${forbidden}`)
  }
  for (const forbidden of ['@deepseek-ai/dsh-client-runtime']) {
    if (freeSearchHost.includes(forbidden) || freeSearchClient.includes(forbidden) || JSON.stringify(freeSearchManifest).includes(forbidden)) {
      throw new Error(`Packaged dsh-free-search contains removed compatibility or self-update marker: ${forbidden}`)
    }
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
  const modelSelectionMarkers = [
    'modelDirectories',
    'directoryFor(sessionId)',
    'conversation.input.model',
    'selectModel({',
  ]
  const missingModelSelectionMarkers = modelSelectionMarkers.filter((marker) => !modelSelectionClient.includes(marker))
  if (missingModelSelectionMarkers.length > 0) {
    throw new Error(`Packaged model selector is missing session-scoped selection behavior: ${missingModelSelectionMarkers.join(', ')}`)
  }
  const sessionControllerHost = readArchiveFile('node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js').toString('utf8')
  const sessionControllerMarkers = ['buildModelCatalog', 'modelCatalog', 'Promise.all(']
  const missingSessionControllerMarkers = sessionControllerMarkers.filter((marker) => !sessionControllerHost.includes(marker))
  if (missingSessionControllerMarkers.length > 0) {
    throw new Error(`Packaged Session Controller is missing the Host-owned concurrent model catalog: ${missingSessionControllerMarkers.join(', ')}`)
  }
  const llmHost = readArchiveFile('node_modules/@deepseek-ai/dsh-llm/lib/index.js').toString('utf8')
  const llmAttachmentMarkers = [
    'fileHandleText',
    'verbatim read-only copy saved at',
    'Read that path with your file tools when its contents are needed',
  ]
  const missingLlmAttachmentMarkers = llmAttachmentMarkers.filter((marker) => !llmHost.includes(marker))
  if (missingLlmAttachmentMarkers.length > 0) {
    throw new Error(`Packaged LLM runtime is missing the read-only attachment handle: ${missingLlmAttachmentMarkers.join(', ')}`)
  }

  if (!/^\d+\.\d+\.\d+$/u.test(packagedManifest.version)) throw new Error(`Packaged desktop version must be a semantic release; found ${packagedManifest.version}.`)
  const dshManifest = JSON.parse(readArchiveFile('node_modules/@deepseek-ai/dsh/package.json').toString('utf8'))
  if (dshManifest.version !== pinnedUpstream.version) throw new Error(`Packaged DSH must be ${pinnedUpstream.version}; found ${dshManifest.version}.`)
}

async function verifyCoreRuntimeArchive() {
  const forbidden = rawArchiveFiles.filter(path => path.startsWith('node_modules/') && (
    /\.(?:d\.ts|ts|tsx|mts|cts|map|pdb|tsbuildinfo)$/i.test(path)
    || hasForbiddenRuntimeDirectory(path)
  ))
  if (forbidden.length > 0) throw new Error(`Forbidden production runtime files found in Core ASAR:\n${forbidden.slice(0, 50).join('\n')}`)
  const nativeMismatch = rawArchiveFiles.filter(path => /\.(?:node|dll|exe)$/i.test(path)
    && /(darwin|linux|android|arm64|ia32|x86)/i.test(path)
    && !/(win32|windows).*(x64|amd64)/i.test(path))
  if (nativeMismatch.length > 0) throw new Error(`Non-Windows-x64 native files found in Core ASAR:\n${nativeMismatch.join('\n')}`)

  const required = [
    'out/main/index.js', 'out/preload/index.cjs',
    'runtime/harness-node-entry.mjs', 'runtime/runtime-esm-register.mjs', 'runtime/runtime-esm-loader.mjs',
    'node_modules/@deepseek-ai/dsh/lib/bin.js',
    'node_modules/@deepseek-ai/dsh-base/package.json',
    'node_modules/@deepseek-ai/dsh-web-app/package.json',
    'node_modules/@zerowallscience/integrity-runtime/hash-worker.mjs',
  ]
  for (const id of runtimeProfile.corePlugins) {
    required.push(`node_modules/${id}/package.json`, `node_modules/${id}/zerowall.plugin.json`, `node_modules/${id}/lib/index.js`)
  }
  for (const id of [...(runtimeProfile.corePackageDependencies ?? []), ...(runtimeProfile.coreRuntimeSeeds ?? [])]) {
    required.push(`node_modules/${id}/package.json`)
  }
  required.push('node_modules/pend/package.json', 'node_modules/pend/index.js')
  for (const path of required) if (!rawArchiveSet.has(path)) throw new Error(`Core ASAR is missing required startup file: ${path}`)
  for (const entry of ['out/main/index.js', 'out/main/python-updater-worker.js', 'out/preload/index.cjs']) {
    if (!readArchiveFile(entry).equals(await readFile(resolve(packageRoot, entry)))) {
      throw new Error(`Packaged ${entry} differs from the completed desktop build. Rebuild before packaging.`)
    }
  }

  const updaterRoot = resolve(packaged.resourcesRoot, 'python-updater')
  const updaterReceipt = JSON.parse(await readFile(resolve(updaterRoot, 'receipt.json'), 'utf8'))
  const stagedDesktopReceipt = JSON.parse(await readFile(resolve(stageRoot, 'desktop-package-receipt.json'), 'utf8'))
  if (updaterReceipt.schema !== 1 || updaterReceipt.buildId !== stagedDesktopReceipt.buildId || !Array.isArray(updaterReceipt.files)) {
    throw new Error('External Python updater assets do not belong to the current desktop build.')
  }
  for (const entry of ['python-updater-worker.js', ...rawArchiveFiles
    .filter(path => /^out\/main\/chunks\/mcp-environment-.+\.js$/u.test(path))
    .map(path => path.slice('out/main/'.length))]) {
    const bytes = await readFile(resolve(updaterRoot, entry))
    if (!bytes.equals(readArchiveFile(`out/main/${entry}`))) throw new Error(`External Python updater asset differs from ASAR: ${entry}`)
  }
  for (const asset of updaterReceipt.files) {
    if (typeof asset.path !== 'string' || asset.path.includes('\\') || asset.path.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error('External Python updater receipt contains an unsafe path.')
    }
    const absolute = resolve(updaterRoot, asset.path)
    const rel = relative(updaterRoot, absolute)
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('External Python updater receipt escapes its resource directory.')
    const bytes = await readFile(absolute)
    if (bytes.length !== asset.size || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
      throw new Error(`External Python updater asset failed its build receipt: ${asset.path}`)
    }
  }
  for (const entry of ['modules/yauzl/package.json', 'modules/yauzl/index.js', 'modules/pend/package.json', 'modules/pend/index.js']) {
    await access(resolve(updaterRoot, entry))
  }
  const updaterModulesPath = resolve(updaterRoot, 'modules')
  const updaterRequireCheck = spawnSync(process.execPath, ['-e', [
    "const requireFromWorker = require('node:module').createRequire(process.argv[1]);",
    "if (typeof requireFromWorker('yauzl').open !== 'function') throw new Error('ZIP reader is unavailable');",
    "requireFromWorker('pend');",
  ].join(' '), resolve(updaterRoot, 'python-updater-worker.js')], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, NODE_PATH: [updaterModulesPath, process.env.NODE_PATH].filter(Boolean).join(delimiter) },
  })
  if (updaterRequireCheck.status !== 0) {
    throw new Error(`External Python updater cannot load its ZIP runtime: ${(updaterRequireCheck.stderr || updaterRequireCheck.error?.message || 'unknown error').trim()}`)
  }
  const updaterChunkPaths = rawArchiveFiles.filter(path => /^out\/main\/chunks\/mcp-environment-.+\.js$/u.test(path))
  if (updaterChunkPaths.length === 0) throw new Error('Core ASAR is missing the Python updater environment chunk.')
  for (const name of ['yauzl', 'pend']) {
    const externalManifest = JSON.parse(await readFile(resolve(updaterRoot, 'modules', name, 'package.json'), 'utf8'))
    const archiveManifest = JSON.parse(readArchiveFile(`node_modules/${name}/package.json`).toString('utf8'))
    for (const field of ['name', 'version', 'main', 'dependencies']) {
      if (JSON.stringify(externalManifest[field]) !== JSON.stringify(archiveManifest[field])) {
        throw new Error(`External Python updater ${name} manifest differs from Core ASAR in ${field}.`)
      }
    }
    const entry = `modules/${name}/index.js`
    if (!(await readFile(resolve(updaterRoot, entry))).equals(readArchiveFile(`node_modules/${name}/index.js`))) {
      throw new Error(`External Python updater dependency differs from Core ASAR: ${entry}`)
    }
  }

  const defaults = JSON.parse(await readFile(resolve(packaged.resourcesRoot, 'commands/default-plugins.json'), 'utf8'))
  for (const entry of ['resource-manager.mjs', 'profile.mjs', 'zws.mjs', ...(fullOffline ? ['offline-profile.mjs'] : [])]) {
    const bytes = await readFile(resolve(packaged.resourcesRoot, 'commands', entry))
    if (!bytes.equals(await readFile(resolve(repositoryRoot, 'tools/commands', entry)))) {
      throw new Error(`Packaged management command is stale: ${entry}. Regenerate commands and repackage.`)
    }
  }
  const inventory = JSON.parse(await readFile(resolve(repositoryRoot, 'config/deepseek-harness/plugin-inventory.json'), 'utf8'))
  const expectedDefaults = [...new Set(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', ...(fullOffline ? inventory.profiles.stable.plugins : runtimeProfile.corePlugins)])].sort()
  if (JSON.stringify([...defaults].sort()) !== JSON.stringify(expectedDefaults)) {
    throw new Error(`Core profile contains unexpected default plugins: ${JSON.stringify(defaults)}`)
  }
  const layout = JSON.parse(await readFile(resolve(repositoryRoot, 'config/layout/package-layout.json'), 'utf8'))
  const optional = new Set()
  for (const entry of await readdir(resolve(repositoryRoot, 'plugins'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'wechat') continue
    const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'plugins', entry.name, 'package.json'), 'utf8').catch(error => {
      if (error?.code === 'ENOENT') return '{}'
      throw error
    }))
    if (manifest.name && !runtimeProfile.corePlugins.includes(manifest.name)) optional.add(manifest.name)
  }
  for (const name of layout.roots?.dsh ?? []) if (name !== 'dsh-better-sidebar') optional.add(name)
  for (const name of [
    '@dsh-external/zotero-harvest', '@dingyi222666/dsh-session-notification',
    '@changfenhuang/dsh-genui', 'dsh-free-search', 'dsh-zotero',
  ]) optional.add(name)
  const includedOptional = [...optional].filter(name => rawArchiveFiles.some(path => path.startsWith(`node_modules/${name}/`)))
  if (includedOptional.length > 0) throw new Error(`Optional plugins were embedded in the Core ASAR: ${includedOptional.join(', ')}`)
  const packagedResourceFiles = await listDiskFiles(packaged.resourcesRoot)
  const optionalResourceRoots = [
    'skills/', 'extensions/skills/', 'mcp/', 'extensions/mcp/',
    'extensions/runtimes/', 'extensions/engines/r/', 'extensions/capabilities/biogenie/',
    'biogenie/', 'bio-tools/', 'ketcher-chemistry/', 'sci/',
  ]
  const embeddedResources = packagedResourceFiles.filter(path => optionalResourceRoots.some(prefix => path.startsWith(prefix)))
  if (!fullOffline && embeddedResources.length > 0) {
    throw new Error(`Independently updateable resource payload was embedded in the Core installer: ${embeddedResources.slice(0, 30).join(', ')}`)
  }
  console.log(`Core ASAR verified with ${runtimeProfile.corePlugins.length} ZeroWall Core plugins and ${optional.size} excluded optional packages.`)
}

async function verifyCoreImports() {
  const expression = `
    const load = name => import(import.meta.resolve(name, process.env.ZEROWALL_RUNTIME_ANCHOR));
    const { KNOWN_SESSION_EVENT_TYPES } = await load('@deepseek-ai/dsh-session');
    if (!KNOWN_SESSION_EVENT_TYPES.has('zerowall/capabilities/selection')) throw new Error('Built Session catalog is missing legacy ZeroWall history.');
    await load('@deepseek-ai/dsh-mcp-client');
    await load('@deepseek-ai/schemastery');
    for (const name of ${JSON.stringify(runtimeProfile.corePlugins)}) {
      const module = await load(name);
      const plugin = module.default ?? module;
      if (typeof plugin !== 'object' || typeof plugin.apply !== 'function') throw new Error(name + ' did not preserve its Core Cordis plugin object.');
    }
  `
  await runEmbeddedNode([
    '--import', pathToFileURL(resolve(asarPath, 'runtime', 'runtime-esm-register.mjs')).href,
    '--experimental-import-meta-resolve', '--input-type=module', '--eval', expression,
  ], { cwd: packaged.root })
}

function verifyQuestionComposerBundle() {
  const bundle = readArchiveFile('node_modules/@deepseek-ai/dsh-client-ui-user-questions/lib/client.js').toString('utf8')
  for (const marker of ['data-question-key', 'radio', 'checkbox', 'pending.answer']) {
    if (!bundle.includes(marker)) throw new Error(`Packaged QuestionComposer bundle is missing interaction marker: ${marker}`)
  }
}

function verifyZoteroAdapters() {
  const client = readArchiveFile('node_modules/dsh-zotero/lib/client.js').toString('utf8')
  const detail = readArchiveFile('node_modules/dsh-zotero/lib/local/detail.js').toString('utf8')
  const modernClient = client.includes('function visitVisibleZoteroCalls(snapshot, visit)')
    && client.includes('order.push({ callId: block.callId, path });')
  const legacyClient = client.includes('visit(root, key, 1)')
    && client.includes('order.push(`${key}:${block.callId}`)')
  if (!modernClient && !legacyClient) {
    throw new Error('Packaged Zotero Sources tab cannot track nested Progressive Tools calls.')
  }
  const dispatcher = readArchiveFile('node_modules/@everclear077/dsh-progressive-tools/lib/index.js').toString('utf8')
  const progressive = JSON.parse(readArchiveFile('node_modules/@everclear077/dsh-progressive-tools/package.json').toString('utf8'))
  if (progressive.version !== pinnedIntegrations.progressiveTools.resourceVersion || ['agent', 'llm', 'system-prompt', 'tools'].some(name => progressive.peerDependencies?.[`@deepseek-ai/dsh-${name}`] !== '0.2.0-rc.2')) {
    throw new Error('Packaged Progressive Tools manifest must use the audited rc.2 resource adaptation.')
  }
  const progressivePatch = yaml.parse(readArchiveFile('node_modules/@everclear077/dsh-progressive-tools/cordis.patch.yml').toString('utf8'))
  if (progressivePatch?.[0]?.insert?.[0]?.name !== progressive.name) {
    throw new Error('Packaged Progressive Tools bundle registration must match its package identity.')
  }
  const conversation = readArchiveFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js').toString('utf8')
  const ssh = readArchiveFile('node_modules/dsh-ssh-ops/lib/client.js').toString('utf8')
  verifyZoteroDispatch(client, dispatcher)
  if (!conversation.includes('data-conversation-view')) {
    throw new Error('Packaged conversation view isolation is missing.')
  }
  for (const marker of ['sidebarRightTabs.register', 'sidebar.right.pane.tab', 'ctx.sidebarRight.openTab(SSH_TAB_KIND)', 'data-dsh-ssh-ops-sidebar-body', 'data-dsh-ssh-ops-tab', 'viewSignal: tabInfo.tab.signal']) {
    if (!ssh.includes(marker)) throw new Error(`Packaged SSH Sidebar registration/lifetime contract is missing: ${marker}`)
  }
  const modernAnnotationWire = archiveSet.has('node_modules/dsh-zotero/lib/local/children-wire.js')
    && (() => {
      const wire = readArchiveFile('node_modules/dsh-zotero/lib/local/children-wire.js').toString('utf8')
      return wire.includes('fetchAnnotationChildren')
        && (wire.includes("itemType: 'annotation'") || wire.includes('itemType:"annotation"'))
    })()
  const modernAnnotationTraversal = modernAnnotationWire
    && detail.includes('fetchAnnotationChildren')
  const legacyItemGraph = archiveSet.has('node_modules/dsh-zotero/lib/item-graph.js')
    && readArchiveFile('node_modules/dsh-zotero/lib/item-graph.js').toString('utf8').includes('options.fetchAnnotationChildren ?? options.fetchChildren')
    && detail.includes("new URLSearchParams({ itemType: 'annotation' })")
  if (!modernAnnotationTraversal && !legacyItemGraph) {
    throw new Error('Packaged Zotero annotation traversal is missing its Local API itemType filter.')
  }
}

function hasForbiddenRuntimeDirectory(path) {
  if (['node_modules/dsh-zotero/docs', 'node_modules/dsh-zotero/docs/images', 'node_modules/dsh-zotero/docs/images/icon.png'].includes(path)) return false
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
  const forbiddenClaudeFiles = externalFiles.filter(path => /(?:^|\/)(?:claude\.exe|claude-agent-sdk|dsh-subagent-claude-code|hooks-claude-code)(?:[/.]|$)/iu.test(path))
  if (forbiddenClaudeFiles.length > 0) {
    throw new Error(`Claude Code runtime found outside ASAR: ${forbiddenClaudeFiles.slice(0, 50).join('\n')}`)
  }
  const skillRoots = ['skills/', 'extensions/skills/']
  const forbiddenSkills = externalFiles.filter(path => skillRoots.some(root => path.startsWith(root)) && (
    /(?:^|\/)(?:__pycache__|tests?|outputs?|rendered|screenshots|test-results)(?:\/|$)/i.test(path)
    || /\.pyc$/i.test(path)
    || /(?:^|\/)(?:academic-ppt-studio|gpt-image2-ppt|journal-club-ppt)(?:\/|$)/i.test(path)
  ))
  if (forbiddenSkills.length > 0) throw new Error(`Forbidden runtime Skill artifacts found:\n${forbiddenSkills.slice(0, 50).join('\n')}`)
  const legacyPptFiles = externalFiles.filter(path => skillRoots.some(root => path.startsWith(root))
    && /(?:^|\/)(?:academic-ppt-studio|gpt-image2-ppt|journal-club-ppt)(?:\/|$)/i.test(path))
  if (legacyPptFiles.length > 0) throw new Error(`Legacy PPT Skills are forbidden in the packaged runtime:\n${legacyPptFiles.slice(0, 50).join('\n')}`)
  const offlineCount = externalFiles.filter(path => path.startsWith('offline-profile/')).length
  if (externalFiles.length > 6_000) throw new Error(`Installed resource file count ${externalFiles.length} exceeds the 6,000-file gate.`)
  console.log(`[files] installed resources: ${externalFiles.length}; signed offline closure: ${offlineCount}`)

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
  // Univer's offline Gateway, Viewer, render worker (~181 MiB), and Windows
  // native Office dependencies are included in the installed application.
  //
  // Stable builds download the signed Python/pip bootstrap on first use.
  // Scientific wheels, Skills, and MCP services are installed or mounted
  // through their own signed/resource channels and stay out of the installer.
  //
  // Installed size is diagnostic; the installer must meet the verified
  // 8.0.6 baseline while retaining the complete offline feature set.
  const budgetNote = (label, size, budget) => {
    const verdict = size > budget ? 'over advisory budget' : 'within advisory budget'
    console.log(`[size] ${label}: ${(size / MIB).toFixed(1)} MiB (${verdict}, budget ${(budget / MIB).toFixed(0)} MiB)`)
  }
  budgetNote('installed output', installedBytes, 1_500 * MIB)

  const installers = (await readdir(targetPackageRoot, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.includes(`-${packagedManifest.version}-`) && entry.name.endsWith('.exe') && !entry.name.toLowerCase().includes('uninstall'))
  for (const installer of installers) {
    const size = (await stat(resolve(targetPackageRoot, installer.name))).size
    if (size > 379_604_648) throw new Error(`Installer ${installer.name} is ${size} bytes; exceeds the 8.0.6 limit of 379604648 bytes`)
    budgetNote(`installer ${installer.name}`, size, 379_604_648)
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
  const root = await mkdtemp(resolve(tmpdir(), 'zerowall-离线验收-'))
  const { initializeProfile } = await import('./../../tools/commands/profile.mjs')
  await initializeProfile(resolve(root, 'harness'), JSON.parse(await readFile(resolve(packaged.resourcesRoot, 'commands/default-plugins.json'), 'utf8')), JSON.parse(await readFile(resolve(packaged.resourcesRoot, 'commands/bundled-plugins.json'), 'utf8')))
  if (fullOffline) {
    const home = resolve(root, 'harness')
    const result = await prepareOfflineCandidate({ home, source: resolve(packaged.resourcesRoot, 'offline-profile'),
      keys: JSON.parse(await readFile(resolve(repositoryRoot, 'config/catalogs/trusted-keys.json'), 'utf8')),
      target: { desktopVersion: desktopManifest.version, dshVersion: pinnedUpstream.version, dshCommit: pinnedUpstream.commit, platform: process.platform, architecture: process.arch },
      defaults: JSON.parse(await readFile(resolve(packaged.resourcesRoot, 'commands/default-plugins.json'), 'utf8')), yaml,
    })
    if (result.blocked.length) throw new Error('New offline profile unexpectedly has blocked plugins')
    await rename(resolve(home, 'profiles/web'), resolve(home, 'profiles/verification-before-repair'))
    await rename(result.candidate, resolve(home, 'profiles/web'))
  }
  const port = await reservePort()
  const url = `http://127.0.0.1:${port}`
  const dshEntry = resolve(asarPath, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const networkProbe = offlineNetwork ? await prepareOfflineNetworkProbe(root) : undefined
  const networkGuardEvidence = networkProbe ? await verifyOfflineNetworkProbe(networkProbe, { executablePath: packaged.executablePath }) : undefined
  const child = spawn(packaged.executablePath, [
    ...(networkProbe ? ['--import', pathToFileURL(networkProbe.path).href] : []),
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
          if (coreOnly) {
            await verifyEventWebSockets(probeUrl)
            await new Promise(resolvePromise => setTimeout(resolvePromise, 2_000))
            if (child.exitCode !== null) throw new Error(`Packaged Core Host exited after becoming ready.\n${output.slice(-12_000).replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]')}`)
            await verifyWebBootManifest(probeUrl)
            await verifyPluginInventory(probeUrl)
            return
          }
          await verifyZoteroStatus(probeUrl)
          await verifyZoteroAuthorization(probeUrl)
          if (!offlineNetwork && !freeSearchVerified) {
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
          if (networkProbe) {
            const evidence = JSON.parse(await readFile(networkProbe.receipt, 'utf8'))
            if (!evidence.isolated || evidence.packageInstallsAttempted !== 0) throw new Error('Offline Host attempted package installation')
            await mkdir(resolve(repositoryRoot, 'artifacts/verification', desktopManifest.version), { recursive: true })
            await writeFile(resolve(repositoryRoot, 'artifacts/verification', desktopManifest.version, 'offline-host.json'), JSON.stringify({ ...evidence, guard: networkGuardEvidence, applicationVersion: desktopManifest.version, fullDefaultProfile: fullOffline, evidenceRoot: root }, null, 2))
            console.log('Full default Host activated with outbound networking blocked and zero package installation attempts.')
          }
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
  if (entries.some(entry => entry?.moduleName === '@deepseek-ai/dsh-hmr' && entry.enabled === true)) {
    throw new Error('Packaged desktop must disable the development HMR watcher.')
  }
  if (entries.some(entry => /opencode-zen-free-provider|plugin-opencode|opencode2dsh/u.test(String(entry?.moduleName)))) {
    throw new Error('Retired OpenCode free provider is still present in the running Host inventory.')
  }
  if (entries.some(entry => String(entry?.moduleName).startsWith('@daweifu/capability-menu'))) {
    throw new Error('Retired capability-menu package must not be mounted in the Host.')
  }
  const expected = coreOnly ? [...runtimeProfile.corePlugins] : [
    'base', 'desktop-compat', 'secrets', 'environment', 'projects', 'account', 'ai-cloud', 'files', 'images', 'mineru', 'mcp',
    'skills', 'reviewer', 'research', 'pubmed', 'singlecell', 'execution', 'python', 'runs', 'publications', 'extension-center',
  ].map(name => `@zerowallscience/plugin-${name}`)
  if (!coreOnly) expected.push('@dsh-external/zotero-harvest', 'dsh-free-search', 'dsh-wechat', 'dsh-file-review', '@changfenhuang/dsh-genui', 'dsh-zotero')
  const byModule = new Map(entries.map(entry => [entry?.moduleName, entry]))
  const missing = expected.filter(name => !byModule.has(name))
  if (missing.length > 0) throw new Error(`Packaged Host plugin inventory is missing: ${missing.join(', ')}`)
  const inactive = expected.filter(name => byModule.get(name)?.enabled !== true || byModule.get(name)?.fiberPhase !== 'active')
  if (inactive.length > 0) throw new Error(`Packaged Host ZeroWall plugins are not active: ${inactive.map(name => `${name}=${JSON.stringify(byModule.get(name))}`).join('; ')}`)
  if (coreOnly) {
    const unexpected = entries.filter(entry => typeof entry?.moduleName === 'string'
      && entry.moduleName.startsWith('@zerowallscience/plugin-')
      && !runtimeProfile.corePlugins.includes(entry.moduleName)
      && entry.enabled === true)
    if (unexpected.length > 0) throw new Error(`Core Host activated optional ZeroWall plugins: ${unexpected.map(entry => entry.moduleName).join(', ')}`)
  }
}

async function verifyFreeSearch(url) {
  // dsh-free-search 0.8.3 stores its config under its composition entry id.
  // Keep this in sync with the official cordis.patch.yml and client bridge.
  const namespace = 'web-search-free'
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

  const valueOf = described => described?.value?.namespaces?.find(candidate => candidate?.ns === namespace)?.value
  const valueOfMutation = mutation => mutation?.value?.value
  const initial = await post('describe')
  if (initial?.ok !== true || !valueOf(initial)) {
    throw new Error(`Packaged Host free-search namespace ${namespace} is unavailable: ${JSON.stringify(initial)}`)
  }
  const switched = await post('mutate', { ns: namespace, ops: [{ op: 'set', path: ['provider'], value: 'ddg' }] })
  if (switched?.ok !== true || valueOfMutation(switched)?.provider !== 'ddg') {
    throw new Error(`Packaged Host free-search setting write failed: ${JSON.stringify(switched)}`)
  }
  const restored = await post('mutate', { ns: namespace, ops: [{ op: 'set', path: ['provider'], value: 'bing' }] })
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

async function verifyZoteroAuthorization(url) {
  const rpcId = randomUUID()
  const response = await hostFetch(authUrl(new URL(url), '/api/zotero/localAuthorization'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request', rpcId, method: 'zotero/localAuthorization',
      payload: { args: { request: { action: 'status' } } },
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const text = await response.text()
  let envelope
  try {
    envelope = JSON.parse(text)
  } catch {
    throw new Error(`Packaged Zotero authorization returned non-JSON HTTP ${response.status}: ${text.slice(0, 200)}`)
  }
  if (!response.ok || envelope?.rpcId !== rpcId || envelope?.result?.ok !== true
    || typeof envelope.result.value !== 'string') {
    throw new Error(`Packaged Zotero authorization RPC failed: HTTP ${response.status} ${JSON.stringify(envelope)}`)
  }
  let value
  try {
    value = JSON.parse(envelope.result.value)
  } catch {
    throw new Error('Packaged Zotero authorization returned invalid result JSON.')
  }
  if (typeof value?.authorized !== 'boolean' || typeof value?.remember !== 'boolean') {
    throw new Error(`Packaged Zotero authorization status contract failed: ${JSON.stringify(value)}`)
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
  const coreRequired = [
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
    ...await coreClientPluginIds(),
  ]
  const required = coreOnly ? coreRequired : [
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

async function coreClientPluginIds() {
  const result = []
  for (const entry of await readdir(resolve(repositoryRoot, 'plugins'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const directory = resolve(repositoryRoot, 'plugins', entry.name)
    const descriptor = await readFile(resolve(directory, 'zerowall.plugin.json'), 'utf8').then(JSON.parse, error => {
      if (error?.code === 'ENOENT') return undefined
      throw error
    })
    if (descriptor && runtimeProfile.corePlugins.includes(descriptor.name) && typeof descriptor.client === 'string') result.push(descriptor.name)
  }
  return result.sort()
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
    const browserErrors = []
    const observedPages = new WeakSet()
    const observePage = candidate => {
      if (observedPages.has(candidate)) return
      observedPages.add(candidate)
      candidate.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`))
      candidate.on('console', message => {
        if (['error', 'warning'].includes(message.type())) browserErrors.push(`${message.type()}: ${message.text()}`)
      })
      candidate.on('requestfailed', request => browserErrors.push(`request: ${request.url()} ${request.failure()?.errorText ?? 'failed'}`))
    }
    context.pages().forEach(observePage)
    context.on('page', observePage)
    const deadline = Date.now() + 120_000
    let page
    while (Date.now() < deadline) {
      page = context.pages().find(candidate => candidate.url().startsWith('http://127.0.0.1:'))
      if (page !== undefined) break
      await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
    }
    if (page === undefined) throw new Error(`Packaged desktop did not navigate to its Host.\n${output.slice(-12_000).replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]')}`)
    observePage(page)
    try {
      await page.waitForFunction(() => Array.isArray(window.__DSH_BOOT__?.entries), undefined, { timeout: 120_000 })
    } catch (error) {
      throw new Error(`Desktop boot failed at ${page.url()}. Body: ${(await page.locator('body').innerText()).slice(0, 6000)}\nBrowser: ${browserErrors.slice(-15).join('\n')}\nProcess: ${output.slice(-6000)}\n${error}`)
    }
    const ids = await page.evaluate(() => {
      const boot = window.__DSH_BOOT__
      return Array.isArray(boot?.entries) ? boot.entries.map(entry => entry.id) : []
    })
    const expectedBootModules = coreOnly ? [
      '@deepseek-ai/dsh-api-session-controller', '@deepseek-ai/dsh-client-connection',
      '@deepseek-ai/dsh-client-ui-layout', ...await coreClientPluginIds(),
    ] : [
      '@deepseek-ai/dsh-api-session-controller', '@deepseek-ai/dsh-client-connection',
      '@deepseek-ai/dsh-client-ui-layout', '@zerowallscience/plugin-base',
      '@zerowallscience/plugin-projects', '@zerowallscience/plugin-account', '@zerowallscience/plugin-images',

      '@zerowallscience/plugin-mineru',
      '@zerowallscience/plugin-mcp', '@zerowallscience/plugin-skills', '@zerowallscience/plugin-reviewer',
      '@zerowallscience/plugin-research',
      'dsh-free-search', 'dsh-zotero',
      '@changfenhuang/dsh-genui',
    ]
    for (const id of expectedBootModules) {
      if (!ids.includes(id)) throw new Error(`Packaged desktop Web boot is missing ${id}. Found: ${ids.join(', ')}`)
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
    if (startup.phase !== 'ready') {
      const renderer = await page.evaluate(() => ({
        body: document.body?.innerText?.slice(0, 2_000) ?? null,
        boot: document.querySelector('[data-dsh-boot]')?.textContent?.slice(0, 600) ?? null,
        sidebar: document.querySelector('[data-dsh-better-sidebar]') !== null,
        conversation: document.querySelector('[data-zerowall-conversation]') !== null,
        editable: document.querySelector('[contenteditable]') !== null,
        legacyBootState: document.documentElement.dataset.zerowallBoot ?? null,
      }))
      throw new Error(`Desktop startup failed: ${startup.message}; renderer=${JSON.stringify(renderer)}; browser=${JSON.stringify(browserErrors.slice(-30)).replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]')}; process=${output.slice(-4_000).replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]')}; evidence=${root}`)
    }
    console.log(`Packaged startup ready in ${Date.now() - startup.startedAt} ms; saved SSH profiles: ${Object.keys(sshProfile.tables.profiles).length}; evidence: ${root}`)
    if (await readFile(sshPath, 'utf8') !== JSON.stringify(sshProfile)) throw new Error('Startup unexpectedly rewrote saved SSH profiles.')
    if (/Failed to load plugins|missed the module table|Cannot use import statement outside a module/iu.test(bodyText)) {
      throw new Error(`Packaged desktop rendered a plugin loading error: ${bodyText.slice(0, 4_000)}`)
    }
    const fatal = browserErrors.filter(error => /Failed to load plugins|missed the module table|Cannot use import statement outside a module/iu.test(error))
    if (fatal.length > 0) throw new Error(`Packaged desktop client errors:\n${fatal.join('\n')}`)
    const notice = page.getByRole('dialog', { name: '内测声明' })
    const hasNotice = await notice.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false)
    if (hasNotice) await notice.getByRole('button', { name: '继续' }).click()
    const credential = page.getByRole('dialog', { name: '添加一个 API Key 开始使用' })
    const needsCredential = await credential.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false)
    if (needsCredential) {
      await credential.getByRole('button', { name: '稍后配置' }).click()
      await credential.waitFor({ state: 'hidden' })
    }
    await page.getByRole('button', { name: /^(设置|Settings)$/ }).click()
    const settings = page.getByRole('dialog', { name: /^(设置|Settings)$/ })
    // Only inspect the Settings shell navigation. Extension Center renders a
    // nested resource-tab <nav>; including its buttons makes the last item
    // become Python and sends the About check to the wrong section.
    const settingsNav = settings.locator(':scope > nav button')
    // Settings sections are contributed by plugins after the shell mounts.
    // Wait for the ledger projection before asserting ordering; otherwise a
    // healthy packaged startup can be sampled between the dialog render and
    // the first slot update.
    try {
      await settingsNav.first().waitFor({ state: 'visible', timeout: 30_000 })
    } catch (error) {
      await writeFile(resolve(root, 'settings-debug.html'), await settings.evaluate(node => node.outerHTML).catch(() => '<settings dialog unavailable>'))
      await writeFile(resolve(root, 'settings-debug.txt'), await page.locator('body').innerText().catch(() => ''))
      throw error
    }
    const settingsNavLabels = (await settingsNav.allInnerTexts()).map(label => label.trim()).filter(Boolean)
    if (!/^(关于|About)$/u.test(settingsNavLabels.at(-1) ?? '')) {
      throw new Error(`About must be the final Settings navigation entry; found ${JSON.stringify(settingsNavLabels)}.`)
    }
    if (coreOnly) {
      const extensionCenter = settings.getByRole('button', { name: /^(扩展中心|Extension Center)$/u })
      await extensionCenter.waitFor({ state: 'visible', timeout: 30_000 })
      await extensionCenter.click()
      await settings.getByRole('heading', { name: /^(扩展中心|Extension Center)$/u }).waitFor({ state: 'visible' })
      const localChecks = await page.evaluate(async () => {
        const api = window.zerowallDesktop.resources
        const before = await api.listJobs()
        const checks = await Promise.all(['plugin', 'skill', 'mcp'].map(kind => api.check(kind, true)))
        const after = await api.listJobs()
        return { before, after, checks }
      })
      if (JSON.stringify(localChecks.before) !== JSON.stringify(localChecks.after)) throw new Error('Read-only Core catalog checks created or modified a resource task.')
      for (const result of localChecks.checks) {
        if (result.catalogStatus !== 'local' || !Array.isArray(result.resources)) throw new Error(`Core local catalog inspection failed: ${JSON.stringify(result)}`)
      }
      await writeFile(resolve(root, 'core-catalog-checks.json'), JSON.stringify(localChecks, null, 2))
      await page.screenshot({ path: resolve(root, 'core-extension-center.png'), fullPage: true })
      await settingsNav.last().click()
      try {
        await settings.getByRole('heading', { name: 'ZeroWall Science', exact: true }).waitFor({ state: 'visible' })
      } catch (error) {
        await page.screenshot({ path: resolve(root, 'core-about-failure.png'), fullPage: true }).catch(() => undefined)
        await writeFile(resolve(root, 'core-about-failure.txt'), await page.locator('body').innerText().catch(() => ''))
        throw error
      }
      await settings.getByText(desktopManifest.version, { exact: true }).waitFor({ state: 'visible' })
      await page.screenshot({ path: resolve(root, 'core-version.png'), fullPage: true })
      console.log(`Packaged Core startup and Extension Center are ready; optional plugins and resources remain profile-managed. Evidence: ${root}`)
      return
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
    await settings.getByRole('button', { name: /^(关闭|Close)$/ }).click()
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
      const update = document.querySelector('button[data-update]')
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
  await tabs.locator('[data-conversation-tab="chat"]').click()
  const sshAction = tabs.locator('[data-dsh-ssh-ops-tab="true"]')
  await sshAction.click()
  await page.waitForFunction(() => document.querySelector('[data-dsh-ssh-ops-tab="true"]')?.getAttribute('aria-pressed') === 'true')
  const ssh = page.locator('[data-dsh-ssh-ops-sidebar-body="true"]')
  await ssh.waitFor({ state: 'visible' })
  const box = await ssh.boundingBox()
  if (!box || box.height < 250 || box.width < 300) throw new Error(`SSH workspace is collapsed: ${JSON.stringify(box)}`)
  if (!await composer.isVisible() || await editor.innerText() !== draft) throw new Error('Opening the SSH Sidebar hid the Chat composer or lost its draft')
  await sshAction.click()
  if (await ssh.count() !== 1) throw new Error('Repeated SSH action created a duplicate terminal pane')
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
    NODE_PATH: [resolve(asarPath, 'node_modules'), ...(fullOffline ? [resolve(offlineProbe.candidate, 'node_modules')] : [])].join(delimiter),
    ...(fullOffline ? { ZEROWALL_PROFILE_ANCHOR: pathToFileURL(resolve(offlineProbe.candidate, 'package.json')).href } : {}),
    ZEROWALL_RUNTIME_ANCHOR: pathToFileURL(dshEntry).href,
    // Match the packaged desktop's product environment so ZeroWall-owned
    // profile bundles (including File Review) join this isolated Host probe.
    ZEROWALL_USER_DATA_DIR: root,
    DSH_HOME: resolve(root, 'harness'),
    DSH_BUNDLED_SKILL_DIR: resolve(packaged.resourcesRoot, 'extensions/skills'),
    ZEROWALL_RESEARCH_DB: resolve(root, 'research', 'zerowall-research.sqlite'),
    ZEROWALL_BUNDLED_SKILLS: resolve(packaged.resourcesRoot, 'extensions/skills'),
    ZEROWALL_DEFER_DEFAULT_MCP: '1',
    DSH_CLIENT_VERSION: desktopManifest.version,
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
    // Current Harness releases can persist newer session schemas (for example
    // v4) while retaining the same plaintext JSONL contract. Verify the
    // contract independently of the schema version.
    const jsonl = files.find(path => /(?:^|\/)session\.v\d+\.jsonl$/u.test(path))
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
  if (entry === undefined) {
    const physical = 'modules/' + path.slice('node_modules/'.length)
    if (fullOffline && path.startsWith('node_modules/') && offlineReceipt.files.some(item => item.path === physical)) return offlineReceipt.schema === 2 ? extractFile(resolve(packaged.resourcesRoot, 'offline-profile/profile-runtime.asar'), path.split('/').join(sep)) : readFileSync(resolve(packaged.resourcesRoot, 'offline-profile', physical))
    throw new Error(`Verified runtime file is missing: ${path}`)
  }
  return extractFile(asarPath, entry)
}

async function verifySourceRuntimePolicy() {
  const upstream = JSON.parse(await readFile(resolve(repositoryRoot, 'config', 'deepseek-harness', 'upstream.json'), 'utf8'))
  if (!/^0\.2\.0-rc\.2$/u.test(String(upstream.version)) || upstream.tag !== `dsh-v${upstream.version}`) {
    throw new Error(`Pinned DSH must be dsh-v0.2.0-rc.2; found ${upstream.version ?? 'unknown'} (${upstream.tag ?? 'no tag'}).`)
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
  for (const forbidden of ['0.1.1-rc.2', '@deepseek-ai/dsh-client-runtime', '@zerowallscience/platform-host', '@zerowallscience/platform-client', '@deepseek-ai/dsh-subagent-claude-code', '@anthropic-ai/claude-agent-sdk', 'hooks-claude-code']) {
    if (manifestText.includes(forbidden)) throw new Error(`Runtime manifests contain forbidden legacy reference: ${forbidden}`)
  }

  const wechat = JSON.parse(await readFile(resolve(repositoryRoot, 'packages', 'dsh-wechat', 'package.json'), 'utf8'))
  if (wechat.name !== 'dsh-wechat' || wechat.version !== pinnedIntegrations.wechat.version) throw new Error(`Expected the pinned dsh-wechat snapshot; found ${wechat.name}@${wechat.version}.`)
  await access(resolve(repositoryRoot, 'packages', 'dsh-wechat', 'dist', 'index.js'))
  const stableProfile = await readFile(resolve(repositoryRoot, 'profiles', 'generated', 'stable.yml'), 'utf8')
  const desktopPatch = await readFile(resolve(repositoryRoot, 'desktop', 'build', 'zerowall.patch.yml'), 'utf8')
  const basePatch = await readFile(resolve(repositoryRoot, 'deepseek-harness', 'packages', 'bundle', 'base', 'cordis.patch.yml'), 'utf8')
  if (!stableProfile.includes("'dsh-wechat'")
    || !/wechat:[\s\S]*enabled:\s*true[\s\S]*autoConnect:\s*false[\s\S]*channel:\s*ilink/u.test(stableProfile)) {
    throw new Error('Stable profile must enable WeChat while keeping first-start autoConnect disabled.')
  }
  for (const removed of ['dsh-better-sidebar-icons', '@huanlin/dsh-plugin-better-sidebar-plugin-office']) {
    if (stableProfile.includes(removed) || desktopPatch.includes(removed)) {
      throw new Error(`Removed plugin must not be mounted: ${removed}`)
    }
  }
  if (!desktopPatch.includes("name: 'dsh-wechat'")) throw new Error('Packaged Electron patch must mount dsh-wechat.')
  if (/^\s+- id:\s*web-search-free\s*$/mu.test(desktopPatch)) {
    throw new Error('Free Search must be mounted by its profile bundle so its settings remain editable.')
  }
  if (/^\s*- id:\s*agent-default-model\s*$/mu.test(desktopPatch)) {
    throw new Error('Packaged Electron patch must not lock agent-default-model above the editable profile layer.')
  }
  if (!/^\s*- id:\s*agent-default-model\s*\r?\n(?:(?!^\s*- id:)[\s\S])*?^\s+config:\s*\r?\n^\s+provider:\s*deepseek-official\s*\r?\n^\s+model:\s*deepseek-v4-flash\s*$/mu.test(basePatch)) {
    throw new Error('Harness base bundle must provide deepseek-v4-flash as the editable default model.')
  }
  if (/opencode2dsh|opencode-zen-free-provider|@zerowallscience\/plugin-opencode/u.test(desktopPatch + stableProfile)) {
    throw new Error('Retired local OpenCode provider must not be mounted or selected.')
  }
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
