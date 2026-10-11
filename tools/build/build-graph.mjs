import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { copyFile, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contract, root, stageRoot } from './paths.mjs'
import { fingerprintInputs, isContained } from './build-graph-lib.mjs'
import { packageSource, resourceSource } from './layout.mjs'
import { deterministicArchive } from '../release/deterministic-archive.mjs'
import { storeAndLink } from './content-store.mjs'
import { dependencyLockFingerprint, sharedSourceInputs } from './component-inputs.mjs'
import { offlineFiles } from '../commands/offline-profile.mjs'
import { restorePublishedOutput } from '../plugins/published-output.mjs'

const requested = process.argv.slice(2)
const [command, ...args] = requested
const graphRoot = join(contract.cache, 'build-graph')
const receiptRoot = join(graphRoot, 'tasks')
const lockRoot = join(graphRoot, 'locks')

function pnpmArgs(argv) {
  const pnpmEntry = process.env.npm_execpath
  if (pnpmEntry) return [process.execPath, pnpmEntry, ...argv]
  // Node's Windows child-process resolver does not consider pnpm.ps1 or the
  // extensionless shim that PowerShell resolves. Use the executable cmd shim
  // when the graph is launched directly (for example by incremental checks).
  return [process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ...argv]
}

function run(argv, options = {}) {
  const command = argv[0]
  const shell = process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')
  const result = spawnSync(command, argv.slice(1), { cwd: root, stdio: 'inherit', windowsHide: true, shell, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Command failed (${result.status}): ${argv.join(' ')}`)
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function acquireLock(name) {
  const path = join(lockRoot, `${name.replace(/[^a-zA-Z0-9._-]/gu, '_')}.lock`)
  await mkdir(lockRoot, { recursive: true })
  try {
    await mkdir(path)
    await writeJson(join(path, 'owner.json'), { pid: process.pid, task: name, startedAt: new Date().toISOString() })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    let owner
    try { owner = JSON.parse(await readFile(join(path, 'owner.json'), 'utf8')) } catch {}
    if (owner?.pid && processAlive(owner.pid)) throw new Error(`Build lock ${name} is held by process ${owner.pid}; no shared output was changed.`)
    const age = Date.now() - (await stat(path)).mtimeMs
    if (age < 60_000) throw new Error(`Build lock ${name} has no readable owner and is too recent to recover safely.`)
    await rm(path, { recursive: true })
    return acquireLock(name)
  }
  return async () => rm(path, { recursive: true, force: true })
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}

async function receiptPath(id) {
  return join(receiptRoot, `${id.replace(/[^a-zA-Z0-9._-]/gu, '_')}.json`)
}

async function exists(path) { return stat(path).then(() => true, () => false) }

function scriptArgs(script) { return pnpmArgs(script) }

async function taskDefinition(id, taskArgs = []) {
  const [kind, name] = id.split(':')
  const dshCommit = await readFile(join(root, 'config/deepseek-harness/upstream.json'), 'utf8').then(JSON.parse).then(value => value.commit)
  const packageManifest = await readFile(join(root, 'package.json'), 'utf8').then(JSON.parse)
  const desktopManifest = await readFile(join(root, 'desktop/package.json'), 'utf8').then(JSON.parse)
  const dependencies = { node: process.version, pnpm: packageManifest.packageManager, platform: process.platform, architecture: process.arch, nodeAbi: process.versions.modules }
  if (kind === 'plugin-build' || kind === 'plugin-pack') {
    const pluginPath = join(root, 'plugins', name)
    const manifest = await readFile(join(pluginPath, 'package.json'), 'utf8').then(JSON.parse)
    const inputs = [`plugins/${name}`, 'tools/plugins/tsdown.ts', 'tools/plugins/generate-typert.mjs', 'tools/plugins/prepare-pack.mjs', 'tools/plugins/inline-css.mjs', 'tsconfig.plugin.host.json', 'tsconfig.plugin.client.json', ...await sharedSourceInputs(root, pluginPath)]
    if (name === 'files') inputs.push('tools/plugins/viewer-style.mjs', 'tools/plugins/viewer-adapter.mjs')
    const output = kind === 'plugin-build' ? join(pluginPath, 'lib') : join(contract.release, 'plugins', manifest.name.split('/').at(-1), manifest.version)
    const dependencyLockHash = await dependencyLockFingerprint(root, [`plugins/${name}`], ['tsdown', 'typescript', '@tsdown/css'])
    return { id, inputPaths: inputs, dshCommit, dependencyLockHash, dependencies: { ...dependencies, package: manifest.name, version: manifest.version }, outputs: [output, ...(kind === 'plugin-build' ? [join(pluginPath, 'lib/index.js')] : [])], lockName: `plugin-${name}`, run: async () => {
      run([process.execPath, join(root, 'tools/plugins/generate-typert.mjs'), '--plugin', manifest.name])
      run(scriptArgs(['--filter', manifest.name, 'run', 'bundle']))
      run([process.execPath, join(root, 'tools/plugins/inline-css.mjs'), '--plugin', name])
      if (kind === 'plugin-pack') {
        run([process.execPath, join(root, 'tools/plugins/pack.mjs'), '--plugin', name])
      }
    } }
  }
  if (kind === 'resource' && (name === 'skill' || name === 'mcp')) {
    const idName = taskArgs[1] ?? id.split(':').slice(2).join(':')
    if (!idName) throw new Error(`Usage: pnpm resource:build ${name} <id>`)
    let version
    let source
    let catalogSource
    if (name === 'skill') {
      source = await resourceSource('skills', idName)
      if (!await exists(join(source, 'SKILL.md'))) throw new Error(`Skill source not found: ${idName}`)
      const versions = JSON.parse(await readFile(join(root, 'config/catalogs/resource-versions.json'), 'utf8'))
      version = versions.skill?.[idName]
    } else {
      const catalog = JSON.parse(await readFile(join(root, 'config/catalogs/mcp-catalog.json'), 'utf8'))
      catalogSource = catalog.resources?.find(item => item.id === idName)
      if (!catalogSource?.path) throw new Error(`MCP resource source is not declared: ${idName}`)
      source = resolve(root, catalogSource.path)
      if (!isContained(root, source)) throw new Error(`MCP resource source escapes the repository: ${catalogSource.path}`)
      const info = await lstat(source).catch(() => undefined)
      if (!info?.isFile() || info.isSymbolicLink()) throw new Error(`MCP resource source is not a regular file: ${catalogSource.path}`)
      version = catalogSource.version
    }
    if (!version) throw new Error(`No independent resource version is declared for ${name}/${idName}`)
    const outputDirectory = join(stageRoot, 'resource-packages', name, idName, version)
    const output = join(outputDirectory, name === 'skill' ? `${idName}.tgz` : `${idName}.json`)
    const itemCatalog = join(outputDirectory, `${name}-catalog.json`)
    const payloadReference = join(stageRoot, 'refs', name, idName, version, 'payload.json')
    const catalogReference = join(stageRoot, 'refs', name, idName, version, 'catalog.json')
    const signingInputs = ['tools/release/build-resource-catalog-item.mjs', 'tools/release/resource-signing.mjs', 'tools/release/resource-catalog.mjs', 'config/deepseek-harness/upstream.json', 'config/catalogs/trusted-keys.json', 'package.json']
    const inputs = [relative(root, source), `config/catalogs/${name === 'skill' ? 'resource-versions.json' : 'mcp-catalog.json'}`, ...signingInputs, 'tools/build/content-store.mjs', ...(name === 'skill' ? ['tools/release/deterministic-archive.mjs'] : [])]
    return { id, inputPaths: inputs, dshCommit: '', dependencies: { ...dependencies, resourceVersion: version, resourceId: idName, signingKeyId: process.env.ZEROWALL_RESOURCE_KEY_ID ?? 'local-development' }, outputs: [output, `${output}.receipt.json`, itemCatalog, payloadReference, catalogReference], lockName: `resource-${name}-${idName}`, run: async () => {
      await mkdir(outputDirectory, { recursive: true })
      if (await exists(output) || await exists(itemCatalog)) throw new Error(`Refusing to overwrite staged resource output: ${outputDirectory}`)
      if (name === 'skill') await deterministicArchive(source, output)
      else await copyFile(source, output)
      run([process.execPath, join(root, 'tools/release/build-resource-catalog-item.mjs'), name, idName, version, output, itemCatalog])
      await storeAndLink(output, { referencePath: payloadReference })
      await storeAndLink(itemCatalog, { referencePath: catalogReference })
      const sha256 = createHash('sha256').update(await readFile(output)).digest('hex')
      await writeJson(`${output}.receipt.json`, { id: idName, kind: name, version, path: output, size: (await stat(output)).size, sha256, buildId: contract.buildId })
    } }
  }
  if (kind === 'resource' && name === 'python') {
    const taskParts = id.split(':')
    const layer = taskArgs[1] ?? taskParts[2]
    if (!['core', 'science', 'capability'].includes(layer)) throw new Error('Python layer must be core, science, or capability.')
    const capabilityId = layer === 'capability' ? taskArgs[2] ?? taskParts[3] : undefined
    if (layer === 'capability' && (!capabilityId || !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(capabilityId))) throw new Error('Python capability task requires an id: pnpm resource:build python capability <id>')
    const taskId = `resource:python:${layer}${capabilityId ? `:${capabilityId}` : ''}`
    const output = join(stageRoot, 'python-layers', layer, ...(capabilityId ? [capabilityId] : []), 'dependency-manifest.json')
    const receipt = `${output}.receipt.json`
    const reference = join(stageRoot, 'refs', 'python', layer, ...(capabilityId ? [capabilityId] : []), 'manifest.json')
    const itemCatalog = join(dirname(output), 'python-catalog.json')
    const catalogReference = join(stageRoot, 'refs', 'python', layer, ...(capabilityId ? [capabilityId] : []), 'catalog.json')
    const inputs = ['resources/extensions/python', 'config/python/capability-layers.json', 'tools/release/python-layer-split.mjs', 'tools/release/build-python-dependency-manifest.mjs', 'config/catalogs/trusted-keys.json', 'package.json', 'tools/build/content-store.mjs']
    inputs.push('tools/release/build-resource-catalog-item.mjs', 'tools/release/resource-signing.mjs', 'tools/release/resource-catalog.mjs', 'config/deepseek-harness/upstream.json')
    return { id: taskId, inputPaths: inputs, dshCommit: '', dependencies: { ...dependencies, layer, capabilityId, pythonRevision: process.env.ZEROWALL_PYTHON_DEPENDENCY_REVISION ?? '3.12.10-r16', manifestSigningKeyId: process.env.ZEROWALL_MCP_ENVIRONMENT_KEY_ID ?? 'stable-4', catalogSigningKeyId: process.env.ZEROWALL_RESOURCE_KEY_ID ?? 'local-development' }, outputs: [output, receipt, reference, itemCatalog, catalogReference], lockName: `resource-python-${layer}-${capabilityId ?? 'all'}`, run: async () => {
      run([process.execPath, join(root, 'tools/release/build-python-dependency-manifest.mjs'), '--layer', layer, ...(capabilityId ? [capabilityId] : []), '--output', output])
      await storeAndLink(output, { referencePath: reference })
      const manifest = JSON.parse(await readFile(output, 'utf8'))
      const resourceId = capabilityId ? `python-capability/${capabilityId}` : `python-${layer}`
      const resourceVersion = manifest.revision.replace(/[^A-Za-z0-9.-]/gu, '-')
      run([process.execPath, join(root, 'tools/release/build-resource-catalog-item.mjs'), 'python', resourceId, resourceVersion, output, itemCatalog])
      await storeAndLink(itemCatalog, { referencePath: catalogReference })
    } }
  }
  if (kind === 'package-build') {
    const sourceRoot = name === 'research-store' ? join(root, 'store') : await packageSource(name)
    const manifest = await readFile(join(sourceRoot, 'package.json'), 'utf8').then(JSON.parse)
    const task = name === 'dsh-better-sidebar' ? 'build' : manifest.scripts?.bundle ? 'bundle' : manifest.scripts?.build ? 'build' : undefined
    if (!task && manifest.zerowall?.composition) {
      const output = join(stageRoot, 'package-compositions', `${name}.json`)
      return {
        id,
        inputPaths: [relative(root, sourceRoot), 'config/layout/package-role-manifest.json'],
        dshCommit,
        dependencies: { ...dependencies, package: manifest.name, version: manifest.version },
        outputs: [output],
        lockName: `package-${name}`,
        run: async () => writeJson(output, {
          schema: 1,
          package: manifest.name,
          version: manifest.version,
          composition: manifest.zerowall.composition,
          source: relative(root, sourceRoot).replaceAll('\\', '/'),
          buildId: contract.buildId,
        }),
      }
    }
    if (!task && manifest.files?.length) return { id, inputPaths: [relative(root, sourceRoot)], dshCommit: '', dependencyLockHash: await dependencyLockFingerprint(root, [relative(root, sourceRoot).replaceAll('\\', '/')]), dependencies: { ...dependencies, package: manifest.name, version: manifest.version }, outputs: manifest.files.map(file => join(sourceRoot, file)), lockName: `package-${name}`, run: async () => {} }
    if (!task) throw new Error(`Package ${manifest.name} has no bundle/build script.`)
    return { id, inputPaths: [relative(root, sourceRoot), 'tools/plugins/tsdown.ts', ...await sharedSourceInputs(root, sourceRoot)], dshCommit, dependencyLockHash: await dependencyLockFingerprint(root, [relative(root, sourceRoot).replaceAll('\\', '/')], ['tsdown', 'typescript']), dependencies: { ...dependencies, package: manifest.name, version: manifest.version, task, script: manifest.scripts[task] }, outputs: [join(sourceRoot, 'lib')], lockName: `package-${name}`, run: async () => run(scriptArgs(['--filter', manifest.name, 'run', task, ...(manifest.name === '@everclear077/dsh-progressive-tools' ? ['--skipLibCheck'] : [])])) }
  }
  if (id === 'dsh') {
    const outputDirectories = []
    async function collect(directory) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || ['node_modules', '.git', 'lib', 'dist', 'src', 'tests', 'test', 'artifacts'].includes(entry.name)) continue
        await collect(join(directory, entry.name))
      }
      const manifest = await readFile(join(directory, 'package.json'), 'utf8').then(JSON.parse, () => undefined)
      if (manifest?.name && await exists(join(directory, 'lib'))) outputDirectories.push(join(directory, 'lib'))
    }
    await collect(join(root, 'deepseek-harness'))
    return { id, inputPaths: ['deepseek-harness', 'tools/dsh/build-zerowall.mjs', 'config/deepseek-harness/upstream.json'], dshCommit, dependencyLockHash: createHash('sha256').update(await readFile(join(root, 'deepseek-harness/pnpm-lock.yaml'))).digest('hex'), dependencies, outputs: [...outputDirectories, join(root, 'deepseek-harness/apps/cli/lib/bin.js'), join(root, 'deepseek-harness/apps/web/dist')], lockName: 'runtime', run: async () => run(scriptArgs(['dsh:build:zerowall', ...(command === 'development' ? ['--development'] : [])])) }
  }
  if (id === 'runtime') return { id, inputPaths: ['plugins', 'packages', 'profiles', 'tools/dsh', 'tools/plugins', 'config/deepseek-harness', 'config/layout'], dshCommit, dependencies, outputs: [join(stageRoot, 'dsh/runtime-closure.json')], lockName: 'runtime', run: async () => {
    run(scriptArgs(['profiles:generate']))
    run(scriptArgs(['dsh:runtime:closure']))
  } }
  if (id === 'desktop') return { id, inputPaths: ['desktop/src', 'desktop/build', 'desktop/package.json'], dshCommit, dependencyLockHash: await dependencyLockFingerprint(root, ['desktop']), dependencies: { ...dependencies, desktop: desktopManifest.version }, outputs: [join(root, 'desktop/out')], lockName: 'runtime', run: async () => run(scriptArgs(['--filter', '@zerowallscience/desktop', 'run', 'build'])) }
  throw new Error(`Unknown build task: ${id}`)
}

async function runTask(id, extra = []) {
  const definition = await taskDefinition(id, extra)
  const startedMs = Date.now()
  const input = await fingerprintInputs({ root, inputs: definition.inputPaths, dshCommit: definition.dshCommit, dependencyVersions: definition.dependencies, dependencyLockHash: definition.dependencyLockHash })
  const file = await receiptPath(id)
  const releaseLock = await acquireLock(definition.lockName)
  const startedAt = new Date().toISOString()
  try {
  const prior = await readFile(file, 'utf8').then(JSON.parse, () => undefined)
  const publishedSource = id.startsWith('plugin-build:') ? join(root, 'plugins', id.split(':')[1]) : id.startsWith('package-build:') ? id.endsWith(':research-store') ? join(root, 'store') : await packageSource(id.split(':')[1]) : undefined
  if (publishedSource && !process.argv.includes('--force') && (!prior || process.argv.includes('--bootstrap-published')) && await restorePublishedOutput(publishedSource)) {
    const receipt = { schema: 2, task: id, status: 'success', ...input, outputs: definition.outputs, outputIntegrity: await outputIntegrity(definition.outputs), finishedAt: new Date().toISOString(), durationMs: Date.now() - startedMs, reason: 'verified published source and compiled output bootstrap', buildId: contract.buildId }
    await writeJson(file, receipt)
    return { id, status: 'cached', fingerprint: input.fingerprint, builtAt: receipt.finishedAt }
  }
  const outputs = await outputIntegrity(definition.outputs).catch(() => undefined)
  if (!process.argv.includes('--force') && prior?.status === 'success' && prior.fingerprint === input.fingerprint && outputs && JSON.stringify(outputs) === JSON.stringify(prior.outputIntegrity)) {
    console.log(`CACHE HIT ${id} ${input.fingerprint.slice(0, 12)} ${Date.now() - startedMs}ms; verified output SHA-256`)
    return { id, status: 'cached', fingerprint: input.fingerprint, builtAt: prior.finishedAt }
  }
  const reason = process.argv.includes('--force') ? 'explicit full build' : !prior ? 'no verified receipt' : prior.fingerprint !== input.fingerprint ? 'input/dependency fingerprint changed' : !outputs ? 'output missing' : 'output hash changed'
  console.log(`REBUILD ${id}: ${reason}`)
    await definition.run()
    const missing = []
    for (const output of definition.outputs) if (!await exists(output)) missing.push(output)
    if (missing.length) throw new Error(`Task completed without expected output: ${missing.join(', ')}`)
    const receipt = { schema: 2, task: id, status: 'success', startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - startedMs, reason, ...input, outputs: definition.outputs, outputIntegrity: await outputIntegrity(definition.outputs), buildId: contract.buildId }
    await writeJson(file, receipt)
    console.log(`BUILT ${id} ${input.fingerprint.slice(0, 12)} ${receipt.durationMs}ms; ${reason}`)
    return { id, status: 'built', fingerprint: input.fingerprint, builtAt: receipt.finishedAt }
  } catch (error) {
    await writeJson(file, { schema: 1, task: id, status: 'failed', startedAt, finishedAt: new Date().toISOString(), ...input, outputs: definition.outputs, failure: String(error?.message ?? error), buildId: contract.buildId })
    throw error
  } finally { await releaseLock() }
}

async function outputIntegrity(outputs) {
  const records = []
  for (const path of outputs) {
    const info = await stat(path)
    if (info.isFile()) records.push({ path: relative(root, path).replaceAll('\\', '/'), size: info.size, sha256: createHash('sha256').update(await readFile(path)).digest('hex') })
    else if (info.isDirectory()) records.push({ path: relative(root, path).replaceAll('\\', '/'), files: await offlineFiles(path) })
    else throw new Error('Build output is not a regular payload')
  }
  return records
}

async function allComponents({ development = false } = {}) {
  const dsh = await runTask('dsh')
  const pin = JSON.parse(await readFile(join(root, 'config/deepseek-harness/upstream.json'), 'utf8'))
  const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
  if (!development) await writeJson(join(stageRoot, 'dsh/build-receipt.json'), { commit: pin.commit, version: pin.version, applicationVersion: version, builtAt: dsh.builtAt, compilationFingerprint: dsh.fingerprint })
  for (const name of ['integrity-runtime', 'dsh-wechat', 'dsh-genui', 'dsh-better-sidebar', 'dsh-file-review', 'dsh-ssh-ops', 'zotero-harvest', 'dsh-session-notification', 'dsh-progressive-tools']) await runTask('package-build:' + name)
  // Store is a workspace package with the same independent task contract.
  await runTask('package-build:research-store')
  for (const entry of await readdir(join(root, 'plugins'), { withFileTypes: true })) if (entry.isDirectory() && entry.name !== 'wechat' && await exists(join(root, 'plugins', entry.name, 'package.json'))) await runTask('plugin-build:' + entry.name)
}

if (command === 'development') {
  // Fingerprints catch committed edits and missing outputs as well as the
  // working diff. Only changed/damaged components actually compile.
  await allComponents({ development: true })
  await runTask('desktop')
} else if (command === 'components' || command === 'build:changed') {
  // Check every content fingerprint, including committed changes and damaged
  // outputs. git diff HEAD is not a build dependency graph.
  await allComponents()
  if (command === 'build:changed') await runTask('desktop')
} else if (command === 'desktop') {
  await runTask('desktop')
} else if (command === 'plugin:build' || command === 'plugin:pack') {
  if (!args[0] || !await exists(join(root, 'plugins', args[0], 'package.json'))) throw new Error(`Unknown plugin: ${args[0] ?? '(missing)'}`)
  await runTask(`${command === 'plugin:build' ? 'plugin-build' : 'plugin-pack'}:${args[0]}`)
} else if (command === 'package:build') {
  if (!args[0] || !await exists(join(await packageSource(args[0]), 'package.json'))) throw new Error(`Unknown package: ${args[0] ?? '(missing)'}`)
  await runTask(`package-build:${args[0]}`)
} else if (command === 'resource:build') {
  if (!['skill', 'mcp', 'python'].includes(args[0])) throw new Error('Usage: pnpm resource:build skill|mcp|python <id-or-layer>')
  const task = args[0] === 'python' ? `resource:python:${args[1]}${args[1] === 'capability' && args[2] ? `:${args[2]}` : ''}` : `resource:${args[0]}:${args[1]}`
  await runTask(task, args)
} else {
  throw new Error('Usage: node tools/build/build-graph.mjs build:changed|plugin:build <id>|plugin:pack <id>|package:build <id>|resource:build <kind> <id>')
}
