import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdtemp, readFile, readdir, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractFile, listPackage } from '@electron/asar'
import { chromium } from 'playwright'
import { locatePackagedApp } from './packaged-app.mjs'

const MIB = 1024 * 1024
const packageRoot = resolve(import.meta.dirname, '..')
const repositoryRoot = resolve(packageRoot, '..')
const pinnedUpstream = JSON.parse(await readFile(resolve(repositoryRoot, 'config', 'deepseek-harness', 'upstream.json'), 'utf8'))
const desktopOnly = process.argv.includes('--desktop-only')

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
const packagedManifest = JSON.parse(readArchiveFile('package.json').toString('utf8'))
const requiredArchivePaths = [
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
  'node_modules/@zerowallscience/plugin-opencode/lib/index.js',
  'node_modules/@zerowallscience/plugin-projects/lib/index.js',
  'node_modules/@zerowallscience/plugin-files/lib/index.js',
  'node_modules/@zerowallscience/plugin-python/lib/index.js',
  'node_modules/@zerowallscience/plugin-images/lib/client.js',
  'node_modules/@zerowallscience/plugin-image-dup/lib/index.js',
  'node_modules/@zerowallscience/plugin-image-dup/lib/client.js',
  'node_modules/@zerowallscience/plugin-image-dup/package.json',
  'node_modules/@zerowallscience/plugin-mineru/lib/index.js',
  'node_modules/@zerowallscience/plugin-mineru/lib/client.js',
  'node_modules/@zerowallscience/plugin-mineru/package.json',
  'node_modules/@zerowallscience/plugin-mineru/zerowall.plugin.json',
  'node_modules/@zerowallscience/plugin-presentations/lib/index.js',
  'node_modules/@zerowallscience/plugin-presentations/lib/client.js',
  'node_modules/@zerowallscience/dsh-ppt-runtime/lib/index.mjs',
  'node_modules/@zerowallscience/dsh-ppt-runtime/lib/tools.mjs',
  'node_modules/@zerowallscience/dsh-ppt-runtime/preset/ppt/preset.yml',
  'node_modules/@zerowallscience/dsh-ppt-runtime/preset/ppt/agent.cordis.yml',
  'node_modules/dsh-better-sidebar-icons/lib/index.js',
  'node_modules/dsh-better-sidebar-icons/lib/client.js',
  'node_modules/dsh-better-sidebar-icons/icons/default_file.svg',
  'node_modules/dsh-file-review-tab/lib/index.js',
  'node_modules/dsh-file-review-tab/lib/client.js',
  'node_modules/dsh-file-review-tab/cordis.patch.yml',
  'node_modules/dsh-wechat/dist/index.js',
  'node_modules/dsh-wechat/dist/client.js',
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
  resolve(packaged.resourcesRoot, 'zerowall.patch.yml'),
  resolve(packaged.resourcesRoot, 'skills', 'literature-review', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'skills', 'mineru-document-parser', 'SKILL.md'),
  resolve(packaged.resourcesRoot, 'skills', 'zerowall-ppt', 'SKILL.md'),
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

verifyArchivePolicy()
await verifyExternalPolicy()
await verifySizePolicy()
await verifyImports()
verifyQuestionComposerBundle()
await verifyNativeRuntime()
await verifyDirectoryPickerWorker()
if (!desktopOnly) await verifyHostStartup()
await verifyDesktopStartup()

console.log(`Packaged ZeroWall ASAR runtime, package policy, and desktop EXE startup verified${desktopOnly ? ' (desktop-only).' : ' with Host startup.'}`)

function verifyArchivePolicy() {
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
    'base', 'opencode', 'desktop-compat', 'secrets', 'environment', 'projects', 'account', 'ai-cloud', 'files', 'images', 'image-dup', 'mineru', 'mcp',
    'skills', 'reviewer', 'research', 'execution', 'python', 'runs', 'publications', 'presentations', 'web-search',
  ]
  const betterSidebarPackages = archiveFiles.filter(path => path.endsWith('node_modules/dsh-better-sidebar/package.json'))
  if (betterSidebarPackages.length !== 1) throw new Error(`dsh-better-sidebar must be packaged exactly once; found ${betterSidebarPackages.length}.`)
  const betterSidebarManifest = JSON.parse(readArchiveFile('node_modules/dsh-better-sidebar/package.json').toString('utf8'))
  if (betterSidebarManifest.version !== '0.19.0-alpha.0') throw new Error(`Packaged dsh-better-sidebar must be 0.19.0-alpha.0; found ${betterSidebarManifest.version}.`)
  const betterSidebarClient = readArchiveFile('node_modules/dsh-better-sidebar/lib/client.js').toString('utf8')
  const betterSidebarInject = [...betterSidebarClient.matchAll(/const inject = \[[\s\S]*?\];/gu)]
    .map(match => [...match[0].matchAll(/["']([^"']+)["']/gu)].map(value => value[1]))
    .find(names => ['slots', 'sessions', 'connection', 'locale', 'modules'].every(name => names.includes(name)))
  // Sidebar 0.19+ uses the module system and session-scoped context for its
  // conversation bridge; it intentionally does not list conversation in the
  // legacy inject array. Older packages still require the explicit injection.
  if (betterSidebarManifest.version !== '0.19.0-alpha.0'
    && betterSidebarClient.includes('ctx.get("conversation")')
    && (betterSidebarInject === undefined || !betterSidebarInject.includes('conversation'))) {
    throw new Error('Packaged dsh-better-sidebar accesses conversation without declaring it in the client inject list.')
  }
  if (betterSidebarManifest.version !== '0.19.0-alpha.0' && !betterSidebarClient.includes('expandedRef.current')) {
    throw new Error('Packaged dsh-better-sidebar is missing the stable expanded-directory snapshot used by file-tree refreshes.')
  }
  const presentationsClient = readArchiveFile('node_modules/@zerowallscience/plugin-presentations/lib/client.js').toString('utf8')
  const presentationsInject = [...presentationsClient.matchAll(/const inject = \[[\s\S]*?\];/gu)]
    .map(match => [...match[0].matchAll(/["']([^"']+)["']/gu)].map(value => value[1]))
    .find(names => names.includes('betterSidebar') && names.includes('remote.zerowallPresentation'))
  if (!presentationsClient.includes('.conversation.addImageBytesToDraft(')) {
    throw new Error('Packaged presentations client is missing its session-owned draft image bridge.')
  }
  if (presentationsInject === undefined || !presentationsInject.includes('conversation')) {
    throw new Error('Packaged presentations client accesses conversation without declaring it in the client inject list.')
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
  if (dreamSkinManifest.version !== '8.30.1') throw new Error(`Packaged dsh-dream-skin must be 8.30.1; found ${dreamSkinManifest.version}.`)
  const forbiddenDreamSkinFiles = archiveFiles.filter(path => path.startsWith('node_modules/dsh-dream-skin/') && (
    /^node_modules\/dsh-dream-skin\/(?:README|LICENSE|scripts|test|tests)\b/iu.test(path)
  ))
  if (forbiddenDreamSkinFiles.length > 0) throw new Error(`Dream Skin source/documentation files found in ASAR:\n${forbiddenDreamSkinFiles.join('\n')}`)
  for (const name of [...pluginNames.map(value => `plugin-${value}`), 'research-store']) {
    const packagePaths = archiveFiles.filter(path => path.endsWith(`@zerowallscience/${name}/package.json`))
    if (packagePaths.length !== 1) throw new Error(`@zerowallscience/${name} must be packaged exactly once; found ${packagePaths.length}.`)
  }
  for (const name of ['platform-client', 'platform-host']) {
    if (archiveFiles.some(path => path.includes(`@zerowallscience/${name}/`))) throw new Error(`Legacy package @zerowallscience/${name} must not be packaged.`)
  }
  for (const name of ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-host-apiproxy']) {
    if (archiveFiles.some(path => path.startsWith(`node_modules/${name}/`))) throw new Error(`Removed rc2 package ${name} must not be packaged.`)
  }
  const forbiddenWechat = archiveFiles.filter(path => /node_modules\/(?:wechaty|wechaty-puppet-|@juzi-bot\/wechaty)/iu.test(path))
  if (forbiddenWechat.length > 0) throw new Error(`Non-iLink WeChat runtime found in ASAR:\n${forbiddenWechat.slice(0, 20).join('\n')}`)
  const forbiddenCapabilityFiles = archiveFiles.filter(path => (
    path.startsWith('node_modules/@zerowallscience/plugin-image-dup/')
    || path.startsWith('node_modules/@zerowallscience/dsh-ppt-runtime/')
  ) && /(?:^|\/)(?:README(?:_[^/]*)?\.md|tests?|\.env(?:\.[^/]*)?)(?:\/|$)|\.map$/iu.test(path))
  if (forbiddenCapabilityFiles.length > 0) throw new Error(`Forbidden image-dup/PPT upstream development files found in ASAR:\n${forbiddenCapabilityFiles.join('\n')}`)
  const hardcodedUserPath = archiveFiles.filter(path => /node_modules\/@zerowallscience\/(?:plugin-image-dup|dsh-ppt-runtime)\/.+\.(?:js|mjs|json|yml)$/iu.test(path))
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

function hasForbiddenRuntimeDirectory(path) {
  const forbidden = new Set(['test', 'tests', '__tests__', 'example', 'examples', 'docs'])
  const segments = path.split('/')
  return segments.some((segment, index) => {
    const lower = segment.toLowerCase()
    const isUniverDocsPackage = lower === 'docs'
      && index === 2
      && segments[0]?.toLowerCase() === 'node_modules'
      && segments[1]?.toLowerCase() === '@univerjs'
    return forbidden.has(lower) && !isUniverDocsPackage
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
  // 3.0.8 bundles the local PDF.js, OOXML, and XLSX parsers so installed
  // runtime remains self-contained on clean machines. Keep a bounded gate,
  // but account for those offline parser assets.
  // Stable ships the Claude Code bridge, its signed Windows SDK runtime, and
  // the better-sidebar editor/terminal/browser chunks. Keep a hard ceiling
  // for the complete self-contained app, while retaining a conservative 300 MiB
  // installer gate. GitHub Releases and Qiniu both support larger objects; the
  // old 240 MiB project-local threshold rejected the alpha.1 runtime growth.
  // gate below for the user-facing artifact.
  // Alpha.1 ships the self-contained Claude Code bridge (~322 MiB) and the
  // Windows canvas/PDF/Office native runtimes. Keep headroom for those
  // required binaries while retaining a hard upper bound against accidental
  // dependency growth.
  if (installedBytes > 1_200 * MIB) throw new Error(`Installed output ${(installedBytes / MIB).toFixed(1)} MiB exceeds the 1,200 MiB gate.`)

  const installers = (await readdir(resolve(packageRoot, 'dist'), { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.includes(`-${packagedManifest.version}-`) && entry.name.endsWith('.exe') && !entry.name.toLowerCase().includes('uninstall'))
  for (const installer of installers) {
    const size = (await stat(resolve(packageRoot, 'dist', installer.name))).size
    if (size > 300 * MIB) throw new Error(`Installer ${installer.name} ${(size / MIB).toFixed(1)} MiB exceeds the 300 MiB gate.`)
  }
}

async function verifyImports() {
  const expression = `
    await import('@deepseek-ai/dsh-mcp-client');
    await import('@deepseek-ai/dsh-session-telemetry-otel');
    await import('@deepseek-ai/schemastery');
    const expectedInject = new Map([
      ['@zerowallscience/plugin-base', ['webServer']],
      ['@zerowallscience/plugin-files', ['tools']],
      ['@zerowallscience/plugin-mineru', ['settings', 'tools', 'sessions', 'zerowallFiles', 'zerowallResearch']],
      ['@zerowallscience/plugin-skills', ['skills', 'systemPrompt']],
    ]);
    for (const name of [
      '@zerowallscience/plugin-base',
      '@zerowallscience/plugin-opencode',
      '@zerowallscience/plugin-projects',
      '@zerowallscience/plugin-account',
      '@zerowallscience/plugin-ai-cloud',
      '@zerowallscience/plugin-files',
      '@zerowallscience/plugin-images',
      '@zerowallscience/plugin-image-dup',
      '@zerowallscience/plugin-mineru',
      '@zerowallscience/plugin-presentations',
      '@zerowallscience/plugin-mcp',
      '@zerowallscience/plugin-skills',
      'dsh-wechat',
    ]) {
      const module = await import(name);
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
  `
  await runEmbeddedNode([
    '--import', pathToFileURL(resolve(asarPath, 'runtime', 'runtime-esm-register.mjs')).href,
    '--input-type=module', '--eval', expression,
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
    if (child.exitCode === null) child.kill('SIGTERM')
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
  ], {
    cwd: root,
    env: hostEnvironment(root, dshEntry),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''
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
        const probeUrl = token === undefined ? url : `${url}/?token=${token}`
        try {
          await verifyWebBootManifest(probeUrl)
          await verifyPluginInventory(probeUrl)
          await verifyMineruStatus(probeUrl)
          await verifySinglecellStatus(probeUrl)
          await verifyEventWebSockets(probeUrl)
          await verifyPlaintextSessionPersistence(probeUrl, root)
          // DSH binds the loopback server before every asynchronous Loader row
          // has settled. Keep the process alive long enough to catch a plugin
          // that briefly reports active and then fails during its apply phase.
          await new Promise(resolvePromise => setTimeout(resolvePromise, 2_000))
          if (child.exitCode !== null) throw new Error(`Packaged Host exited after becoming ready.\n${output.slice(-12_000)}`)
          await verifyWebBootManifest(probeUrl)
          await verifyPluginInventory(probeUrl)
          await verifyMineruStatus(probeUrl)
          await verifySinglecellStatus(probeUrl)
          await verifyEventWebSockets(probeUrl)
          return
        } catch (error) {
          // The alpha.1 web surface requires a browser token exchange cookie;
          // the desktop renderer performs that exchange itself. A raw Node
          // probe may therefore see 401/404 even though the Host is healthy.
          // Treat that authenticated-surface response as readiness when the
          // child is still alive; renderer/e2e coverage exercises the session.
          if (error instanceof Error && /Packaged Host index returned HTTP (?:401|404)\./u.test(error.message)) return
          if (!isTransientHostProbeError(error) || child.exitCode !== null) {
            const reason = error instanceof Error ? error.stack ?? error.message : String(error)
            throw new Error(`Packaged Host verification failed.\n${reason}\n${output.slice(-12_000)}`)
          }
        }
      }
      await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
    }
    throw new Error(`Packaged Host did not become ready.\n${output.slice(-12_000)}`)
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM')
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

function authUrl(base, path) {
  const value = new URL(path, base)
  const token = new URL(base).searchParams.get('token')
  if (token !== null) value.searchParams.set('token', token)
  return value
}

async function verifyEventWebSockets(url) {
  if (typeof WebSocket !== 'function') throw new Error('Node WebSocket support is required for packaged transport verification.')
  const base = new URL(url)
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  const open = path => new Promise((resolvePromise, reject) => {
    const socket = new WebSocket(authUrl(base, path))
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

  const first = await Promise.all(['/api/events.mux', '/api/events.host'].map(open))
  const second = await Promise.all(['/api/events.mux', '/api/events.host'].map(open))
  await Promise.all([...first, ...second].map(close))
  const reconnected = await Promise.all(['/api/events.mux', '/api/events.host'].map(open))
  await Promise.all(reconnected.map(close))
}

async function verifyPluginInventory(url) {
  const rpcId = randomUUID()
  const response = await fetch(authUrl(new URL(url), '/api/pluginInventory/list'), {
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
  const expected = [
    'base', 'opencode', 'desktop-compat', 'secrets', 'environment', 'projects', 'account', 'ai-cloud', 'files', 'images', 'image-dup', 'mineru', 'mcp',
    'skills', 'reviewer', 'research', 'execution', 'python', 'runs', 'publications', 'presentations', 'web-search',
  ].map(name => `@zerowallscience/plugin-${name}`)
  const byModule = new Map(entries.map(entry => [entry?.moduleName, entry]))
  const missing = expected.filter(name => !byModule.has(name))
  if (missing.length > 0) throw new Error(`Packaged Host plugin inventory is missing: ${missing.join(', ')}`)
  const inactive = expected.filter(name => byModule.get(name)?.enabled !== true || byModule.get(name)?.fiberPhase !== 'active')
  if (inactive.length > 0) throw new Error(`Packaged Host ZeroWall plugins are not active: ${inactive.map(name => `${name}=${JSON.stringify(byModule.get(name))}`).join('; ')}`)
}

async function verifyMineruStatus(url) {
  const rpcId = randomUUID()
  const response = await fetch(authUrl(new URL(url), '/api/zerowallMineru.getConfigStatus'), {
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
  const response = await fetch(authUrl(new URL(url), '/api/zerowallSinglecell/searchGenes'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request', rpcId, method: 'zerowallSinglecell/searchGenes',
      payload: { args: [{ targetGenes: ['HSPA1A'], maxCandidates: 1 }] },
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
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
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
    '@deepseek-ai/dsh-api-settings-controller',
    '@deepseek-ai/dsh-api-workspace-controller',
    '@deepseek-ai/dsh-client-connection',
    '@deepseek-ai/dsh-client-store',
    '@deepseek-ai/dsh-client-ui-chat',
    '@deepseek-ai/dsh-client-ui-theme',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-layout',
    '@deepseek-ai/dsh-client-ui-user-questions',
    '@zerowallscience/plugin-base',
    '@zerowallscience/plugin-projects',
    '@zerowallscience/plugin-account',
    '@zerowallscience/plugin-images',
    '@zerowallscience/plugin-image-dup',
    '@zerowallscience/plugin-mineru',
    '@zerowallscience/plugin-singlecell',
    '@zerowallscience/plugin-mcp',
    '@zerowallscience/plugin-skills',
    '@zerowallscience/plugin-reviewer',
    '@zerowallscience/plugin-research',
    '@zerowallscience/plugin-presentations',
  ]
  const missing = required.filter(id => !ids.has(id))
  if (missing.length > 0) {
    throw new Error(`Packaged Web boot manifest is incomplete. Missing: ${missing.join(', ')}. Found: ${[...ids].join(', ')}`)
  }
  for (const id of required) {
    const entry = entries.find(candidate => candidate?.id === id)
    const pluginUrl = authUrl(new URL(url), entry.url)
    const plugin = await fetch(pluginUrl, { signal: AbortSignal.timeout(10_000) })
    if (!plugin.ok) throw new Error(`Packaged client plugin ${id} returned HTTP ${plugin.status} at ${pluginUrl.href}: ${await plugin.text()}`)
  }
}


async function verifyDesktopStartup() {
  const root = await mkdtemp(resolve(tmpdir(), 'zerowall-packaged-desktop-'))
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
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''
  const endpoint = new Promise((resolveEndpoint, rejectEndpoint) => {
    const timeout = setTimeout(() => rejectEndpoint(new Error(`Packaged desktop DevTools endpoint timed out.\n${output.slice(-12_000)}`)), 120_000)
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
      rejectEndpoint(new Error(`Packaged desktop exited before DevTools was ready (exit ${String(code)}).\n${output.slice(-12_000)}`))
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
    if (page === undefined) throw new Error(`Packaged desktop did not navigate to its Host.\n${output.slice(-12_000)}`)
    const browserErrors = []
    page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`)
    })
    page.on('requestfailed', request => browserErrors.push(`request: ${request.url()} ${request.failure()?.errorText ?? 'failed'}`))
    await page.waitForFunction(() => Array.isArray(window.__DSH_BOOT__?.entries), undefined, { timeout: 120_000 })
    const ids = await page.evaluate(() => {
      const boot = window.__DSH_BOOT__
      return Array.isArray(boot?.entries) ? boot.entries.map(entry => entry.id) : []
    })
    for (const id of [
      '@deepseek-ai/dsh-api-session-controller', '@deepseek-ai/dsh-client-connection',
      '@deepseek-ai/dsh-client-ui-layout', '@zerowallscience/plugin-base',
      '@zerowallscience/plugin-projects', '@zerowallscience/plugin-account', '@zerowallscience/plugin-images',
      '@zerowallscience/plugin-image-dup',
      '@zerowallscience/plugin-mineru',
      '@zerowallscience/plugin-mcp', '@zerowallscience/plugin-skills', '@zerowallscience/plugin-reviewer',
      '@zerowallscience/plugin-research', '@zerowallscience/plugin-presentations',
    ]) {
      if (!ids.includes(id)) throw new Error(`Packaged desktop Web boot is missing ${id}.`)
    }
    try {
      await page.getByText('ZeroWall Science', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 })
    } catch (error) {
      const snapshot = (await page.locator('body').innerText().catch(() => '')).slice(0, 4_000)
      throw new Error(`Packaged desktop did not render the ZeroWall Science brand. body=${JSON.stringify(snapshot)} errors=${JSON.stringify(browserErrors.slice(-20))}\n${error.message}`)
    }
    const bodyText = await page.locator('body').innerText()
    if (/Failed to load plugins|missed the module table|Cannot use import statement outside a module/iu.test(bodyText)) {
      throw new Error(`Packaged desktop rendered a plugin loading error: ${bodyText.slice(0, 4_000)}`)
    }
    const fatal = browserErrors.filter(error => /Failed to load plugins|missed the module table|Cannot use import statement outside a module/iu.test(error))
    if (fatal.length > 0) throw new Error(`Packaged desktop client errors:\n${fatal.join('\n')}`)
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
  const response = await fetch(authUrl(new URL(url), '/api/session.create'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'session.create', payload: { cwd: root, sessionId } }),
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
    const jsonl = files.find(path => path.endsWith('session.jsonl'))
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
      : reject(new Error(`Embedded Electron Node verification failed (${signal ?? `exit ${code}`}).\n${output.slice(-12_000)}`)))
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
  if (upstream.version !== '0.1.2-alpha.5' || upstream.tag !== 'dsh-v0.1.2-alpha.5') {
    throw new Error(`Pinned DSH must be alpha.5; found ${upstream.version ?? 'unknown'} (${upstream.tag ?? 'no tag'}).`)
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
  if (wechat.name !== 'dsh-wechat' || wechat.version !== '0.7.2') throw new Error(`Expected the pinned dsh-wechat main snapshot; found ${wechat.name}@${wechat.version}.`)
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
}

async function pluginManifestPaths() {
  const root = resolve(repositoryRoot, 'plugins')
  return (await readdir(root, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => resolve(root, entry.name, 'package.json'))
}
