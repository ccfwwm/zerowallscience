import { stageRoot } from '../build/paths.mjs'
import { dedupeRuntime } from './dedupe-runtime.mjs'
import { adaptLibreOfficeKit } from './adapt-libreoffice-kit.mjs'
import { adaptDocumentPreview, adaptExcelChunk } from './adapt-document-preview.mjs'
import { createHash } from 'node:crypto'
import { access, cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { adaptBetterSidebarClient } from './adapt-better-sidebar.mjs'
import { adaptUniverOfficeManifest, adaptUniverSkill, UNIVER_SKILL_HASHES } from './adapt-univer-office.mjs'
import { adaptProgressiveToolsManifest, adaptProgressiveToolsPatch } from './adapt-progressive-tools.mjs'
import { adaptConversationClient } from './adapt-conversation.mjs'
import { adaptSessionDelete } from './adapt-session-delete.mjs'
import { adaptDirectoryPicker } from './adapt-directory-picker.mjs'
import { adaptDreamSkinClient } from './adapt-dream-skin.mjs'
import {
  adaptZoteroClient,
  adaptZoteroCommand,
  adaptZoteroDetail,
  adaptZoteroItemGraph,
  adaptZoteroRemote,
  adaptZoteroContract,
  adaptZoteroStatusCodec,
  adaptZoteroManifest,
} from './adapt-zotero.mjs'
import { packageSource } from '../build/layout.mjs'

const root = resolve(import.meta.dirname, '../..')
const dshRoot = resolve(root, 'deepseek-harness')
const closurePath = resolve(stageRoot, 'dsh/runtime-closure.json')
const offlineProfile = process.argv.includes('--offline-profile')
const outputRoot = resolve(stageRoot, offlineProfile ? 'offline-profile/modules' : 'runtime/node_modules')
const expectedOutputParent = resolve(stageRoot, offlineProfile ? 'offline-profile' : 'runtime')
const buildReceipt = JSON.parse(await readFile(resolve(stageRoot, 'dsh/build-receipt.json'), 'utf8'))
const expectedHarness = JSON.parse(await readFile(resolve(root, 'config/deepseek-harness/upstream.json'), 'utf8'))
const runtimeProfile = JSON.parse(await readFile(resolve(root, 'config/layout/runtime-profile.json'), 'utf8'))
const configuredDefaults = JSON.parse(await readFile(resolve(root, 'config/deepseek-harness/plugin-inventory.json'), 'utf8')).profiles.stable.plugins
if (buildReceipt.commit !== expectedHarness.commit || buildReceipt.version !== expectedHarness.version) {
  throw new Error('Harness build receipt differs from the pinned source. Run pnpm build before preparing the runtime.')
}
const desktopModules = resolve(root, 'desktop/node_modules')
// pnpm keeps transitive packages (for example Jimp's gifwrap decoder) under
// the workspace virtual store rather than linking every package into the
// desktop workspace. Resolve that tree as a final local source so runtime
// closure dependencies are not silently omitted from the packaged ASAR.
const workspaceModules = resolve(root, 'node_modules')
const zerowallPackageRoots = [
  resolve(await packageSource('integrity-runtime')),
  ...await Promise.all(runtimeProfile.corePackageDependencies.map(async name => resolve(await packageSource(name)))),
  ...await pluginRoots(resolve(root, 'plugins'), new Set(offlineProfile ? configuredDefaults : runtimeProfile.corePlugins)),
  ...(offlineProfile ? await Promise.all(['dsh-ssh-ops', 'dsh-progressive-tools', 'dsh-session-notification', 'dsh-better-sidebar', 'dsh-file-review', 'dsh-wechat', 'dsh-genui', 'zotero-harvest'].map(async name => resolve(await packageSource(name)))) : []),
  ...(offlineProfile ? [resolve(root, 'store')] : []),
]
const desktopRuntimeSeeds = [
  // The packaged Web Host resolves its SPA entry through this package's
  // manifest at runtime; it is not reachable from the DSH library dependency
  // graph because it is an application entry rather than a library import.
  '@deepseek-ai/dsh-web-frontend',
  ...runtimeProfile.coreRuntimeSeeds,
  ...runtimeProfile.corePackageDependencies,
  '@zerowallscience/integrity-runtime',
]

// Claude Code is not a ZeroWall runtime dependency. Anthropic model access is
// provided by the API integration, while the local Claude Code executable,
// hooks and Agent SDK are deliberately absent from the installer. Keep this
// guard in the copier as well as the closure generator: a newly added
// transitive dependency must fail the build instead of silently reopening the
// old runtime bundle.
const forbiddenClaudeRuntimePackages = new Set([
  '@deepseek-ai/dsh-subagent-claude-code',
  '@deepseek-ai/dsh-hooks-claude-code',
  '@anthropic-ai/claude-agent-sdk',
  '@anthropic-ai/claude-agent-sdk-darwin-arm64',
  '@anthropic-ai/claude-agent-sdk-darwin-x64',
  '@anthropic-ai/claude-agent-sdk-linux-arm64',
  '@anthropic-ai/claude-agent-sdk-linux-arm64-musl',
  '@anthropic-ai/claude-agent-sdk-linux-x64',
  '@anthropic-ai/claude-agent-sdk-linux-x64-musl',
  '@anthropic-ai/claude-agent-sdk-win32-arm64',
  '@anthropic-ai/claude-agent-sdk-win32-x64',
])
const bundledRuntimeDependencies = new Map()
// The universal preview compiler inlines the browser library and PDF JS.
// Its worker/fonts/WASM/maps are owned by lib/viewer-assets. The Host still
// keeps its separate pdfjs-dist 4.x parser and all Office dependencies.
bundledRuntimeDependencies.set('@zerowallscience/plugin-files', new Set(['@open-file-viewer/core', 'viewer-pdfjs']))
// Sidebar's compiler resolves icon sets to ESM and emits Mermaid as a
// self-contained lazy chunk. No Host entry imports these browser libraries.
bundledRuntimeDependencies.set('dsh-better-sidebar', new Set(['react-icons', 'mermaid']))
const forbiddenDirectories = new Set([
  '.github', '.idea', '.vscode', '.v8-cache', '.cache', '.turbo', '.parcel-cache', '__tests__', 'benchmark', 'benchmarks', 'coverage',
  'docs', 'example', 'examples', 'spec', 'test', 'tests',
])
const forbiddenExtensions = new Set(['.cts', '.map', '.mts', '.pdb', '.ts', '.tsx'])

if (!outputRoot.startsWith(`${expectedOutputParent}${sep}`)) {
  throw new Error(`Refusing to replace runtime workspace output outside ${expectedOutputParent}.`)
}

const closure = JSON.parse(await readFile(closurePath, 'utf8'))
const dshNames = new Set(closure.packages ?? [])
const coreModules = resolve(stageRoot, 'runtime/node_modules')
const coreReceipt = offlineProfile ? JSON.parse(await readFile(resolve(stageRoot, 'runtime/build-receipt.json'), 'utf8')) : undefined
const workspacePackages = new Map()

for (const manifestPath of await findPackageManifests(dshRoot)) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (dshNames.has(manifest.name) || desktopRuntimeSeeds.includes(manifest.name)) {
    workspacePackages.set(manifest.name, { manifest, manifestPath, sourceRoot: dirname(manifestPath) })
  }
}
for (const sourceRoot of zerowallPackageRoots) {
  const manifestPath = resolve(sourceRoot, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  workspacePackages.set(manifest.name, { manifest, manifestPath, sourceRoot })
}

const missing = [...dshNames].filter(name => !workspacePackages.has(name))
if (missing.length > 0) throw new Error(`Pinned DSH runtime packages are missing: ${missing.join(', ')}`)

// An interrupted refresh must never retain a receipt from the prior tree.
await rm(resolve(expectedOutputParent, 'build-receipt.json'), { force: true })
await removeTree(outputRoot)
await mkdir(outputRoot, { recursive: true })

const queue = [...new Set(offlineProfile ? [...configuredDefaults, '@zerowallscience/integrity-runtime', '@zerowallscience/research-store'] : [...dshNames, ...workspacePackages.keys(), ...desktopRuntimeSeeds])].map(name => ({ name, optional: false }))
const copiedTargets = new Map()
const packageRecords = []
const topLevelPackages = new Map()
let incompatible = 0

while (queue.length > 0) {
  const request = queue.shift()
  if (forbiddenClaudeRuntimePackages.has(request.name)) {
    throw new Error(`Claude Code runtime dependency is forbidden in the ZeroWall package: ${request.name}`)
  }
  let resolvedPackage
  try {
    resolvedPackage = await resolvePackage(request.name, request.parentRoot)
  } catch (error) {
    if (request.optional && error instanceof Error && error.message.startsWith('Could not resolve production runtime dependency')) {
      incompatible += 1
      continue
    }
    throw error
  }
  const sourceKey = await realpath(resolvedPackage.sourceRoot)
  const identity = `${resolvedPackage.manifest.name}@${resolvedPackage.manifest.version ?? '0.0.0'}:${sourceKey}`
  // Share the verified Core peer identity through the profile ESM resolver
  // and NODE_PATH rather than copying Cordis/DSH/React into a second runtime.
  if (offlineProfile) {
    const shared = await readFile(resolve(coreModules, request.name, 'package.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })
    if (shared?.version === resolvedPackage.manifest.version && coreReceipt.topLevelInstances?.[request.name] === sourceKey) continue
  }
  const topLevelIdentity = topLevelPackages.get(request.name)
  const targetRoot = topLevelIdentity === undefined || topLevelIdentity === identity
    ? resolve(outputRoot, ...request.name.split('/'))
    : resolve(request.targetParentRoot, 'node_modules', ...request.name.split('/'))
  const targetKey = targetRoot.toLowerCase()
  const previous = copiedTargets.get(targetKey)
  if (previous !== undefined) {
    if (previous !== identity) throw new Error(`Runtime target ${targetRoot} resolves to both ${previous} and ${identity}.`)
    continue
  }
  if (!matchesPlatform(resolvedPackage.manifest)) {
    incompatible += 1
    continue
  }

  await copyRuntimePackage(resolvedPackage, targetRoot)
  copiedTargets.set(targetKey, identity)
  packageRecords.push({ path: targetRoot, sourceKey, manifest: resolvedPackage.manifest })
  if (topLevelIdentity === undefined) topLevelPackages.set(request.name, identity)
  const bundledDependencies = bundledRuntimeDependencies.get(resolvedPackage.manifest.name) ?? new Set()
  if (bundledDependencies.size) {
    await verifyInlinedDependencies(resolvedPackage, bundledDependencies)
    for (const name of bundledDependencies) {
      const dependency = await resolvePackage(name, resolvedPackage.sourceRoot)
      for (const entry of await readdir(dependency.sourceRoot)) {
        if (/^(?:licen[sc]e|notice|copying)(?:\.|$)/iu.test(entry)) {
          // Installer notices are separate from independently published
          // plugin bytes, whose existing version and tarball stay immutable.
          await copyEntry(dependency.sourceRoot, join(outputRoot, '.licenses', resolvedPackage.manifest.name.replaceAll('/', '__'), name.replaceAll('/', '__')), entry)
        }
      }
    }
  }
  for (const name of Object.keys(resolvedPackage.manifest.dependencies ?? {}).sort()) {
    if (bundledDependencies.has(name)) continue
    queue.push({ name, parentRoot: resolvedPackage.sourceRoot, targetParentRoot: targetRoot, optional: false })
  }
  for (const name of Object.keys(resolvedPackage.manifest.optionalDependencies ?? {}).sort()) {
    queue.push({ name, parentRoot: resolvedPackage.sourceRoot, targetParentRoot: targetRoot, optional: true })
  }
}

const deduplication = await dedupeRuntime(outputRoot, packageRecords)
const desktopVersion = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version
for (const name of [...workspacePackages.keys()].filter(name => name.startsWith('@deepseek-ai/'))) {
  const directory = join(outputRoot, name)
  if (await stat(directory).catch(() => undefined)) await applyDesktopMetadata(directory)
}
await writeFile(resolve(expectedOutputParent, 'build-receipt.json'), JSON.stringify({ ...buildReceipt, deduplication, topLevelInstances: Object.fromEntries(packageRecords.filter(entry => entry.path === resolve(outputRoot, entry.manifest.name)).map(entry => [entry.manifest.name, entry.sourceKey])) }, null, 2))
console.log(`Resolution-preserving dedupe: ${deduplication.before} -> ${deduplication.after} package locations.`)
console.log(`Prepared ${copiedTargets.size} production runtime package locations (${incompatible} incompatible packages skipped).`)

async function applyDesktopMetadata(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await applyDesktopMetadata(path)
    else if (/\.(?:js|mjs|cjs|html)$/u.test(entry.name)) {
      const source = await readFile(path, 'utf8')
      if (source.includes('__ZEROWALL_DESKTOP_VERSION__')) await writeFile(path, source.replaceAll('__ZEROWALL_DESKTOP_VERSION__', desktopVersion))
    }
  }
}

async function verifyInlinedDependencies(package_, names) {
  if (package_.manifest.name === '@zerowallscience/plugin-files') {
    const assets = JSON.parse(await readFile(join(package_.sourceRoot, 'lib/viewer-assets/asset-manifest.json'), 'utf8'))
    if (!assets.files?.['build/pdf.worker.mjs'] || !Object.keys(assets.files).some(path => path.startsWith('cmaps/'))) throw new Error('Inlined viewer is missing physical worker or font assets')
  } else if (package_.manifest.name === 'dsh-better-sidebar') {
    const client = await readFile(join(package_.sourceRoot, 'lib/client.js'), 'utf8')
    const mermaid = await readFile(join(package_.sourceRoot, 'lib/client-mermaid.js'), 'utf8')
    if (!client.includes('GenIcon') || !mermaid.includes('flowchart') || !mermaid.includes('__dshChunks__')) throw new Error('Sidebar is missing inlined icons or its Mermaid engine chunk')
  } else throw new Error('No owned-asset proof for inlined dependencies: ' + package_.manifest.name)
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory() && entry.name !== 'viewer-assets') await inspect(path)
      else if (entry.isFile() && /\.[cm]?js$/u.test(entry.name)) {
        const code = await readFile(path, 'utf8')
        for (const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"]([^'"]+)['"]/gu)) {
          if ([...names].some(name => match[1] === name || match[1].startsWith(name + '/'))) throw new Error('Supposedly inlined dependency remains external: ' + match[1])
        }
      }
    }
  }
  await inspect(join(package_.sourceRoot, 'lib'))
  console.log(`Verified inlined dependencies and owned assets: ${package_.manifest.name}: ${[...names].join(', ')}`)
}

// Windows removes a large tree while the indexing service and Defender may
// still be walking it, so a recursive delete can fail with ENOTEMPTY or EPERM
// even though nothing holds a handle. Retry with a short backoff before giving
// up; a single transient failure here otherwise aborts the refresh after the
// receipt has already been deleted, which leaves the runtime stale and makes
// the next packaging run report a version mismatch.
async function removeTree(target) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt >= 5) throw error
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
    }
  }
}

async function resolvePackage(name, parentRoot) {
  const workspace = workspacePackages.get(name)
  if (workspace !== undefined) return { ...workspace, workspace: true }

  const candidates = []
  if (parentRoot !== undefined) {
    let cursor = parentRoot
    for (let depth = 0; depth < 12; depth += 1) {
      candidates.push(resolve(cursor, 'node_modules', ...name.split('/'), 'package.json'))
      const parent = dirname(cursor)
      if (parent === cursor) break
      cursor = parent
    }
  }
  candidates.push(resolve(desktopModules, ...name.split('/'), 'package.json'))
  candidates.push(resolve(workspaceModules, ...name.split('/'), 'package.json'))
  for (const candidate of candidates) {
    try {
      const manifestPath = await realpath(candidate)
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      return { manifest, manifestPath, sourceRoot: dirname(manifestPath), workspace: false }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  throw new Error(`Could not resolve production runtime dependency ${name}${parentRoot ? ` from ${parentRoot}` : ''}.`)
}

async function copyRuntimePackage(package_, targetRoot) {
  const { manifest, manifestPath, sourceRoot, workspace } = package_
  await mkdir(targetRoot, { recursive: true })
  await cp(manifestPath, resolve(targetRoot, 'package.json'))
  if (manifest.name === '@everclear077/dsh-progressive-tools') {
    await writeFile(resolve(targetRoot, 'package.json'), adaptProgressiveToolsManifest(await readFile(manifestPath, 'utf8')))
  }
  // DSH's manager reads declared artwork and locale from the package boundary.
  // These must survive each plugin's narrow runtime-copy branch below.
  if (manifest.dsh && typeof manifest.icon === 'string' && manifest.icon.startsWith('./')) {
    const source = resolve(sourceRoot, manifest.icon)
    const target = resolve(targetRoot, manifest.icon)
    assertInside(sourceRoot, source, manifest.name)
    await mkdir(dirname(target), { recursive: true })
    await cp(source, target)
  }
  if (manifest.dsh && manifest.exports?.['./locale/*.json']) await copyEntry(sourceRoot, targetRoot, 'locale')

  if (manifest.name === 'node-pty') {
    await copyEntry(sourceRoot, targetRoot, 'lib')
    await copyEntry(sourceRoot, targetRoot, 'prebuilds/win32-x64')
    await copyEntry(sourceRoot, targetRoot, 'LICENSE')
    return
  }

  if (manifest.name === '@deepseek-ai/libreoffice-kit') {
    for (const entry of ['lib', 'NOTICE', 'LICENSE']) await copyEntry(sourceRoot, targetRoot, entry)
    const path = resolve(targetRoot, 'lib/index.js')
    await writeFile(path, adaptLibreOfficeKit(await readFile(path, 'utf8'), manifest.version))
    return
  }

  if (manifest.name === 'dsh-univer-office') {
    await writeFile(resolve(targetRoot, 'package.json'), adaptUniverOfficeManifest(await readFile(resolve(targetRoot, 'package.json'), 'utf8')))
    // The Gateway and render workers must execute from physical files in Electron.
    for (const entry of ['lib', 'docs', 'skills', 'artifacts', 'LICENSE', 'cordis.patch.yml']) await copyEntry(sourceRoot, targetRoot, entry)
    const provenance = JSON.parse(await readFile(resolve(root, 'config/integrations/upstream-sources.json'), 'utf8')).univerOffice
    const skillReceipts = []
    for (const skill of Object.keys(UNIVER_SKILL_HASHES)) {
      const path = resolve(targetRoot, 'skills', skill, 'SKILL.md')
      const before = await readFile(path, 'utf8')
      const after = adaptUniverSkill(skill, before, manifest.version, provenance.commit)
      await writeFile(path, after)
      skillReceipts.push({ skill, version: manifest.version, commit: provenance.commit, sourceSha256: UNIVER_SKILL_HASHES[skill], adaptedSha256: createHash('sha256').update(after).digest('hex') })
    }
    await writeFile(resolve(targetRoot, 'skills/zerowall-adaptation.json'), JSON.stringify(skillReceipts, null, 2))
    const hostPath = resolve(targetRoot, 'lib/index.js')
    const host = await readFile(hostPath, 'utf8')
    const anchor = 'var PLUGIN_NODE_MODULES = fileURLToPath(new URL("../../node_modules/", import.meta.url));'
    if (!host.includes(anchor)) throw new Error('Univer 0.3.2 physical artifact adapter no longer matches.')
    await writeFile(hostPath, host.replace(anchor, anchor + String.raw`
GATEWAY_ENTRY = GATEWAY_ENTRY.replace(/app\.asar([\\/])/g, 'app.asar.unpacked$1');
VIEWER_ROOT = VIEWER_ROOT.replace(/app\.asar([\\/])/g, 'app.asar.unpacked$1');
UNIT_CONTENT_WORKER_ENTRY = UNIT_CONTENT_WORKER_ENTRY.replace(/app\.asar([\\/])/g, 'app.asar.unpacked$1');
RENDER_MACHINE_ROOT = RENDER_MACHINE_ROOT.replace(/app\.asar([\\/])/g, 'app.asar.unpacked$1');
`))
    return
  }

  if (manifest.name === 'dsh-zotero') {
    for (const entry of ['lib', 'LICENSE', 'cordis.patch.yml', 'docs/images/icon.png', 'locale']) await copyEntry(sourceRoot, targetRoot, entry)
    await writeFile(resolve(targetRoot, 'package.json'), adaptZoteroManifest(await readFile(resolve(targetRoot, 'package.json'), 'utf8')))
    const adapters = [
      ['lib/command.js', adaptZoteroCommand, false],
      ['lib/client.js', adaptZoteroClient, false],
      ['lib/item-graph.js', adaptZoteroItemGraph, true],
      ['lib/local/detail.js', adaptZoteroDetail, true],
      ['lib/remote.js', adaptZoteroRemote, false],
      ['lib/contract.js', adaptZoteroContract, true],
      ['lib/status-codec.js', adaptZoteroStatusCodec, true],
    ]
    for (const [entry, adapt, optional] of adapters) {
      const path = resolve(targetRoot, entry)
      try {
        await writeFile(path, adapt(await readFile(path, 'utf8')))
      } catch (error) {
        if (optional && error?.code === 'ENOENT') continue
        throw error
      }
    }
    return
  }

  if (manifest.name === 'dsh-better-sidebar') {
    // The package publishes source/docs/install helpers alongside its browser
    // chunks. Only the compiled runtime belongs in the production ASAR.
    await copyEntry(sourceRoot, targetRoot, 'lib')
    await copyEntry(sourceRoot, targetRoot, 'cordis.patch.yml')
    const clientPath = resolve(targetRoot, 'lib/client.js')
    const clientSource = await readFile(clientPath, 'utf8')
    await writeFile(clientPath, adaptBetterSidebarClient(clientSource))
    return
  }

  if (['dsh-file-review', 'dsh-wechat', 'dsh-free-search'].includes(manifest.name)) {
    // These upstream plugins publish compiled lib/dist plus their bundle patch.
    // Keep the package boundary and
    // exclude repository-only tests/docs through the common runtime filter.
    for (const entry of ['lib', 'dist', 'icons', 'resources', 'cordis.patch.yml']) {
      await copyEntry(sourceRoot, targetRoot, entry)
    }
    return
  }

  if (manifest.name === '@changfenhuang/dsh-genui') {
    // Keep the renderer core, lazy engine assets, skill, and bundle patch;
    // repository docs/tests/site files are not part of the desktop runtime.
    for (const entry of ['lib', 'SKILL.md', 'cordis.patch.yml']) {
      await copyEntry(sourceRoot, targetRoot, entry)
    }
    return
  }

  if (manifest.name === 'dsh-dream-skin') {
    await copyEntry(sourceRoot, targetRoot, 'lib')
    const clientPath = resolve(targetRoot, 'lib/client.js')
    await writeFile(clientPath, adaptDreamSkinClient(await readFile(clientPath, 'utf8')))
    try { await access(resolve(sourceRoot, 'cordis.patch.yml')); await copyEntry(sourceRoot, targetRoot, 'cordis.patch.yml') } catch { /* optional in newer Dream Skin releases */ }
    return
  }

  if (workspace) {
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
      throw new Error(`${manifest.name} must declare package files before it can enter the desktop runtime.`)
    }
    const roots = new Set(manifest.files.filter(entry => typeof entry === 'string' && !entry.startsWith('!')).map(publishRoot))
    for (const entry of roots) await copyEntry(sourceRoot, targetRoot, entry)
    if (manifest.name === '@everclear077/dsh-progressive-tools') {
      const patchPath = resolve(targetRoot, 'cordis.patch.yml')
      await writeFile(patchPath, adaptProgressiveToolsPatch(await readFile(patchPath, 'utf8')))
    }
    if (manifest.name === '@deepseek-ai/dsh-client-ui-sidebar-documentpreview') {
      const clientPath = resolve(targetRoot, 'lib/client.js')
      await writeFile(clientPath, adaptDocumentPreview(await readFile(clientPath, 'utf8'), manifest.version))
      const excelPath = resolve(targetRoot, 'lib/client.excel.js')
      await writeFile(excelPath, adaptExcelChunk(await readFile(excelPath, 'utf8'), manifest.version))
    }
    if (manifest.name === '@deepseek-ai/dsh-client-ui-conversation') {
      const clientPath = resolve(targetRoot, 'lib/client.js')
      await writeFile(clientPath, adaptConversationClient(await readFile(clientPath, 'utf8')))
    }
    if (manifest.name === '@deepseek-ai/dsh-client-ui-workspace') {
      const clientPath = resolve(targetRoot, 'lib/client.js')
      await writeFile(clientPath, adaptSessionDelete(await readFile(clientPath, 'utf8')))
    }
    if (manifest.name === '@deepseek-ai/dsh-host-directory-picker-native') {
      for (const entry of ['lib/worker.cjs', 'lib/types/win32-dialog-bindings.js']) {
        const path = resolve(targetRoot, entry)
        await writeFile(path, adaptDirectoryPicker(await readFile(path, 'utf8'), manifest.version))
      }
    }
    return
  }

  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    if (entry.name === 'package.json' || entry.name === 'node_modules') continue
    await copyEntry(sourceRoot, targetRoot, entry.name)
  }
  if (manifest.name === 'koffi') await relocateKoffiRuntime(sourceRoot, targetRoot)
}

async function relocateKoffiRuntime(sourceRoot, targetRoot) {
  const source = resolve(sourceRoot, 'src', 'koffi')
  const target = resolve(targetRoot, 'lib', 'koffi')
  const runtime = resolve(target, 'runtime')
  await mkdir(runtime, { recursive: true })
  const indexCjs = (await readFile(resolve(source, 'index.cjs'), 'utf8')).replaceAll('./src/', './runtime/')
  const indexJs = (await readFile(resolve(source, 'index.js'), 'utf8')).replaceAll('./src/', './runtime/')
  await Promise.all([
    writeFile(resolve(target, 'index.cjs'), indexCjs),
    writeFile(resolve(target, 'index.js'), indexJs),
    cp(resolve(source, 'indirect.cjs'), resolve(target, 'indirect.cjs')),
    cp(resolve(source, 'indirect.js'), resolve(target, 'indirect.js')),
    cp(resolve(source, 'src', 'static.cjs'), resolve(runtime, 'static.cjs')),
    cp(resolve(source, 'src', 'static.js'), resolve(runtime, 'static.js')),
  ])
  await Promise.all([
    writeFile(resolve(targetRoot, 'index.js'), 'export { default } from "./lib/koffi/index.js";\nexport * from "./lib/koffi/index.js";\n'),
    writeFile(resolve(targetRoot, 'index.cjs'), 'module.exports = require("./lib/koffi/index.cjs");\n'),
    writeFile(resolve(targetRoot, 'indirect.js'), 'export { default } from "./lib/koffi/indirect.js";\nexport * from "./lib/koffi/indirect.js";\n'),
    writeFile(resolve(targetRoot, 'indirect.cjs'), 'module.exports = require("./lib/koffi/indirect.cjs");\n'),
  ])
}

async function copyEntry(sourceRoot, targetRoot, entry) {
  const source = resolve(sourceRoot, entry)
  const target = resolve(targetRoot, entry)
  assertInside(sourceRoot, source, entry)
  try {
    await stat(source)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  await mkdir(dirname(target), { recursive: true })
  await cp(source, target, { recursive: true, dereference: true, filter: candidate => includeRuntimeFile(sourceRoot, candidate) })
}

function includeRuntimeFile(sourceRoot, candidate) {
  const path = relative(sourceRoot, candidate).replaceAll('\\', '/')
  if (path === '') return true
  // This exact declared metadata asset is runtime content, even though its
  // upstream location sits under the otherwise excluded documentation tree.
  if (path === 'docs/images/icon.png' && basename(sourceRoot) === 'dsh-zotero') return true
  const segments = path.toLowerCase().split('/')
  // Repository marker files are excluded by electron-builder. Exclude them
  // before signing the immutable offline file set as well.
  if (segments.some(segment => ['.gitkeep', '.gitignore', '.gitattributes', '.npmignore'].includes(segment))) return false
  // npm packages frequently publish executable JavaScript under `src`, even
  // when `main` itself lives at the package root. Keep every src directory;
  // guessing whether it is development-only creates incomplete runtimes.
  if (segments.some(segment => segment === 'node_modules' || (forbiddenDirectories.has(segment) && !(segment === 'docs' && sourceRoot.replaceAll('\\', '/').endsWith('/dsh-univer-office'))))) return false
  const lower = path.toLowerCase()
  if (lower.endsWith('.d.ts') || lower.endsWith('.tsbuildinfo') || forbiddenExtensions.has(extname(lower))) return false
  if (/\.(?:spec|test)\.[cm]?js$/.test(lower)) return false
  if (segments.includes('__pycache__') || lower.endsWith('.pyc')) return false
  if (segments.includes('prebuilds') && !lower.includes('win32-x64')) return false
  if (/\.(node|dll|exe)$/.test(lower) && /(darwin|linux|android|arm64|ia32|x86)/.test(lower) && !/(win32|windows).*(x64|amd64)/.test(lower)) return false
  return true
}

function matchesPlatform(manifest) {
  return matchesConstraint(manifest.os, 'win32') && matchesConstraint(manifest.cpu, 'x64')
}

function matchesConstraint(constraint, value) {
  if (!Array.isArray(constraint) || constraint.length === 0) return true
  if (constraint.includes(`!${value}`)) return false
  const positive = constraint.filter(entry => !entry.startsWith('!'))
  return positive.length === 0 || positive.includes(value)
}

function publishRoot(pattern) {
  const normalized = pattern.replaceAll('\\', '/')
  const [rootPath] = normalized.split('/')
  if (rootPath.length === 0 || /[?*[]/.test(rootPath)) throw new Error(`Unsupported root-level package pattern: ${pattern}`)
  return rootPath
}

function assertInside(parent, child, packageName) {
  const path = relative(parent, child)
  if (path === '' || path.startsWith(`..${sep}`) || path === '..') throw new Error(`Invalid publish path for ${packageName}: ${child}`)
}

async function findPackageManifests(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'lib' || entry.name === 'dist') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await findPackageManifests(path))
    else if (entry.name === 'package.json') result.push(path)
  }
  return result
}

async function pluginRoots(directory, allowedNames) {
  const roots = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    // This retired local plugin is excluded by pnpm-workspace.yaml; old
    // checkouts may still retain ignored build outputs beside its manifest.
    if (entry.name === 'wechat') continue
    const root = resolve(directory, entry.name)
    try {
      await access(resolve(root, 'package.json'))
      if (allowedNames === undefined || allowedNames.has(JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).name)) roots.push(root)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return roots
}
