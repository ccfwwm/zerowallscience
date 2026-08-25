import { cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const dshRoot = resolve(root, 'dsh/source')
const closurePath = resolve(root, '.build/dsh/runtime-closure.json')
const outputRoot = resolve(root, '.build/runtime/node_modules')
const expectedOutputParent = resolve(root, '.build/runtime')
const desktopModules = resolve(root, 'desktop/node_modules')
const zerowallPackageRoots = [
  resolve(root, 'store'),
  ...await pluginRoots(resolve(root, 'plugins')),
]
const desktopRuntimeSeeds = [
  'dsh-better-sidebar',
  '@deepseek-ai/dsh-subagent-claude-code',
  '@deepseek-ai/dsh-subagent-codex',
  '@earendil-works/pi-ai',
  '@modelcontextprotocol/sdk',
  '@pdf-lib/fontkit',
  'jszip',
  'pdf-lib',
  'pptxgenjs',
]
const forbiddenDirectories = new Set([
  '.github', '.idea', '.vscode', '__tests__', 'benchmark', 'benchmarks', 'coverage',
  'docs', 'example', 'examples', 'spec', 'src', 'test', 'tests',
])
const forbiddenExtensions = new Set(['.cts', '.map', '.mts', '.pdb', '.ts', '.tsx'])

if (!outputRoot.startsWith(`${expectedOutputParent}${sep}`)) {
  throw new Error(`Refusing to replace runtime workspace output outside ${expectedOutputParent}.`)
}

const closure = JSON.parse(await readFile(closurePath, 'utf8'))
const dshNames = new Set(closure.packages ?? [])
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

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })

const queue = [...new Set([...dshNames, ...workspacePackages.keys(), ...desktopRuntimeSeeds])].map(name => ({ name, optional: false }))
const copiedTargets = new Map()
const topLevelPackages = new Map()
let incompatible = 0

while (queue.length > 0) {
  const request = queue.shift()
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
  const identity = `${resolvedPackage.manifest.name}@${resolvedPackage.manifest.version ?? '0.0.0'}`
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
  if (topLevelIdentity === undefined) topLevelPackages.set(request.name, identity)
  for (const name of Object.keys(resolvedPackage.manifest.dependencies ?? {}).sort()) {
    queue.push({ name, parentRoot: resolvedPackage.sourceRoot, targetParentRoot: targetRoot, optional: false })
  }
  for (const name of Object.keys(resolvedPackage.manifest.optionalDependencies ?? {}).sort()) {
    queue.push({ name, parentRoot: resolvedPackage.sourceRoot, targetParentRoot: targetRoot, optional: true })
  }
}

console.log(`Prepared ${copiedTargets.size} production runtime package locations (${incompatible} incompatible packages skipped).`)

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

  if (manifest.name === 'node-pty') {
    await copyEntry(sourceRoot, targetRoot, 'lib')
    await copyEntry(sourceRoot, targetRoot, 'prebuilds/win32-x64')
    await copyEntry(sourceRoot, targetRoot, 'LICENSE')
    return
  }

  if (manifest.name === 'dsh-better-sidebar') {
    // The package publishes source/docs/install helpers alongside its browser
    // chunks. Only the compiled runtime belongs in the production ASAR.
    await copyEntry(sourceRoot, targetRoot, 'lib')
    return
  }

  if (workspace) {
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
      throw new Error(`${manifest.name} must declare package files before it can enter the desktop runtime.`)
    }
    const roots = new Set(manifest.files.filter(entry => typeof entry === 'string' && !entry.startsWith('!')).map(publishRoot))
    for (const entry of roots) await copyEntry(sourceRoot, targetRoot, entry)
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
  const segments = path.toLowerCase().split('/')
  // Packages such as OpenTelemetry publish compiled CommonJS under
  // `build/src`. Only the package-root source tree is disposable; filtering
  // every nested `src` directory removes a package's actual runtime entry.
  if (segments.some((segment, index) => segment === 'node_modules'
    || (forbiddenDirectories.has(segment) && !(segment === 'src' && index > 0 && segments[index - 1] === 'build')))) return false
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

async function pluginRoots(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => resolve(directory, entry.name))
}
