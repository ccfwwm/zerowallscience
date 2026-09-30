import { cp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { assertCompatible, compareVersions, downloadResource, verifyCatalog, verifySignedDocument } from './resource-catalog.mjs'

async function json(path) { return JSON.parse(await readFile(path, 'utf8')) }
async function atomic(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true })
  const candidate = path + '.' + randomUUID() + '.tmp'
  await writeFile(candidate, JSON.stringify(value, null, 2), { mode: 0o600 })
  await rename(candidate, path)
}

/** Signed resource preparation and official DSH profile transactions. */
export function createResourceManager({ home, keys, target, runPlugin, stopHost, startHost, callHost, applyPython, local = false, feedBase = 'https://zerowall.chengxunkeji.cn/stable/catalogs', yaml = { parse: JSON.parse, stringify: JSON.stringify } }) {
  const root = join(home, 'resources')
  const profiles = join(home, 'profiles')
  const active = join(profiles, 'web')
  const journal = join(root, 'transaction.json')
  let queue = Promise.resolve()
  const exclusive = task => { const result = queue.then(task); queue = result.catch(() => {}); return result }
  const exists = path => readFile(join(path, 'package.json')).then(() => true, () => false)

  async function recover() {
    const pending = await json(journal).catch(() => undefined)
    if (!pending || pending.state !== 'activating') return
    if (await exists(active)) await rename(active, active + '.interrupted-' + randomUUID())
    if (await exists(pending.backup)) await rename(pending.backup, active)
    await atomic(journal, { ...pending, state: 'recovered' })
  }

  async function catalog(source) {
    let document
    if (/^https:\/\//.test(source)) {
      const response = await fetch(source, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw new Error('Catalog download failed')
      const chunks = []; let size = 0
      for await (const chunk of response.body) {
        size += chunk.length
        if (size > 4 * 1024 ** 2) throw new Error('Catalog exceeds size limit')
        chunks.push(chunk)
      }
      document = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } else document = await json(resolve(source))
    if (document.kind === 'pointer') {
      verifySignedDocument(document, keys)
      if (document.localOnly && !local) throw new Error('Development pointer cannot be activated by a release installation')
      const file = await downloadResource(document.catalog, join(root, 'catalogs'), { local })
      document = await json(file)
    }
    verifyCatalog(document, keys, { local })
    if (document.localOnly && !local) throw new Error('Development catalog cannot be activated by a release installation')
    return document
  }

  async function plugin(id, source) {
    const document = await catalog(source ?? `${feedBase}/plugin-latest.json`)
    const entry = document.resources.find(item => item.id === id)
    if (!entry || !['plugin', 'support'].includes(entry.kind)) throw new Error('Plugin is absent from the signed catalog')
    assertCompatible(entry, target)
    const installed = await json(join(active, 'node_modules', id, 'package.json')).catch(() => undefined)
    if (installed && compareVersions(entry.version, installed.version) < 0) throw new Error('Plugin downgrade requires an explicit rollback')
    // Own support packages and plugin dependencies are signed together. Cache
    // them before stopping the Host; pnpm still owns dependency resolution.
    const overrides = {}
    let archive
    const closure = new Map()
    function visit(item) {
      if (closure.has(item.id)) return
      closure.set(item.id, item)
      // Only download the selected component and its signed own dependencies.
      for (const name of Object.keys(item.dependencies ?? {})) {
        const dependency = document.resources.find(record => record.id === name)
        if (dependency) visit(dependency)
      }
    }
    visit(entry)
    for (const item of closure.values()) {
      assertCompatible(item, target)
      const file = await downloadResource(item, join(root, 'downloads'), { local })
      const tarball = file + '.tgz'
      await cp(file, tarball)
      overrides[item.id] = 'file:' + tarball.replaceAll('\\', '/')
      if (item.id === id) archive = tarball
    }
    const generation = 'zerowall-' + randomUUID()
    const candidate = join(profiles, generation)
    await mkdir(candidate, { recursive: true })
    for (const name of await readdir(active)) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      await cp(join(active, name), join(candidate, name), { recursive: true })
    }
    const manifest = await json(join(candidate, 'package.json'))
    await atomic(join(candidate, 'package.json'), manifest)
    // pnpm 11 reads overrides from its workspace file, not package.json.
    const workspaceFile = join(candidate, 'pnpm-workspace.yaml')
    const workspaceText = await readFile(workspaceFile, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return '' })
    const workspace = workspaceText.trim() ? yaml.parse(workspaceText) : {}
    workspace.overrides = { ...workspace.overrides, ...overrides }
    workspace.autoInstallPeers = false
    await writeFile(workspaceFile, yaml.stringify(workspace))
    await runPlugin(['add', archive], generation)
    await normalizeComposition(candidate)
    return activate(candidate, { id, version: entry.version })
  }

  async function normalizeComposition(candidate, removed) {
    const file = join(candidate, 'package.json')
    const manifest = await json(file)
    const bundles = []
    for (const id of manifest.dsh.profile.bundles) {
      const packageManifest = await json(join(candidate, 'node_modules', id, 'package.json')).catch(() => undefined)
      bundles.push(...(packageManifest?.zerowall?.composition ?? [id]))
    }
    manifest.dsh.profile.bundles = [...new Set(bundles)].filter(id => id !== removed)
    await atomic(file, manifest)
  }

  async function activate(candidate, metadata) {
    const generation = candidate.split(/[\\/]/).at(-1)
    const backup = join(root, 'history', generation)
    await mkdir(resolve(backup, '..'), { recursive: true })
    await stopHost()
    await atomic(journal, { state: 'activating', backup, candidate, ...metadata })
    try {
      await rename(active, backup)
      await rename(candidate, active)
      await startHost()
      await atomic(journal, { state: 'complete', backup, ...metadata })
      return { ...metadata, restarted: true, rollbackSupported: true }
    } catch (error) {
      await stopHost()
      if (await exists(active)) await rename(active, active + '.failed-' + randomUUID())
      if (await exists(backup)) await rename(backup, active)
      await startHost()
      await atomic(journal, { state: 'rolled-back', backup, ...metadata })
      throw error
    }
  }

  async function mutate(args) {
    if (!Array.isArray(args) || !args.every(item => typeof item === 'string') || !['add', 'remove', 'update', 'install'].includes(args[0])) throw new Error('Invalid plugin mutation')
    const generation = 'zerowall-' + randomUUID()
    const candidate = join(profiles, generation)
    await mkdir(candidate, { recursive: true })
    for (const name of await readdir(active)) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      await cp(join(active, name), join(candidate, name), { recursive: true })
    }
    const manifest = await json(join(candidate, 'package.json'))
    if (args[0] === 'remove' && args.length === 2 && !manifest.dependencies?.[args[1]]) {
      manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(name => name !== args[1])
      await atomic(join(candidate, 'package.json'), manifest)
      if (Object.keys(manifest.dependencies ?? {}).length) await runPlugin(['install'], generation)
    } else await runPlugin(args, generation)
    await normalizeComposition(candidate, args[0] === 'remove' ? args[1] : undefined)
    return activate(candidate, { operation: args[0], packages: args.slice(1) })
  }

  async function rollback() {
    const previous = await json(journal)
    if (previous.state !== 'complete' || !await exists(previous.backup)) throw new Error('No previous plugin generation is available')
    await stopHost()
    const nextBackup = active + '.rollback-' + randomUUID()
    try {
      await rename(active, nextBackup)
      await rename(previous.backup, active)
      await startHost()
      await atomic(journal, { ...previous, state: 'rolled-back' })
      return { rolledBack: true }
    } catch (error) {
      await stopHost()
      if (await exists(active)) await rename(active, active + '.failed-' + randomUUID())
      if (await exists(nextBackup)) await rename(nextBackup, active)
      await startHost()
      throw error
    }
  }

  async function resource(kind, id, source) {
    const document = await catalog(source ?? `${feedBase}/${kind}-latest.json`)
    const entry = document.resources.find(item => item.id === id && item.kind === kind)
    if (!entry) throw new Error('Resource is absent from the signed catalog')
    assertCompatible(entry, target)
    const file = await downloadResource(entry, join(root, 'downloads'), { local })
    if (kind === 'mcp') {
      if (entry.role === 'server-bundle') {
        if (entry.runtime !== 'node' || typeof entry.server?.serverName !== 'string') throw new Error('Unsupported MCP server bundle')
        const { extractBundle } = await import('./skill-archive.mjs')
        const folder = await extractBundle(file, join(root, 'mcp', entry.id, entry.sha256), entry.entrypoint)
        const existing = (await callHost('mcp.list', [])).find(item => item.serverName === entry.server.serverName)
        const changes = { command: process.execPath, args: [join(folder, entry.entrypoint)] }
        let activated
        try {
          activated = existing
            ? await callHost('mcp.edit', [{ id: existing.id, changes }])
            : await callHost('mcp.add', [{ ...entry.server, transport: 'stdio', ...changes }])
          const id = existing?.id ?? activated.id
          if (existing?.enabled ?? entry.server.enabled) {
            const deadline = Date.now() + 30_000
            let ready = false
            while (Date.now() < deadline) {
              const status = (await callHost('mcp.list', [])).find(item => item.id === id)
              if (status?.runtimeState === 'active') { ready = true; break }
              if (status && ['error', 'blocked', 'disabled'].includes(status.runtimeState)) throw new Error('Updated MCP server failed activation')
              await new Promise(accept => setTimeout(accept, 250))
            }
            if (!ready) throw new Error('Updated MCP server activation timed out')
          }
          await atomic(join(root, 'mcp', entry.id, 'current.json'), { id, version: entry.version, sha256: entry.sha256, folder, previous: existing ? { command: existing.command, args: existing.args } : undefined })
          return { id, version: entry.version, generation: entry.sha256, rollbackSupported: true }
        } catch (error) {
          if (existing) await callHost('mcp.edit', [{ id: existing.id, changes: { command: existing.command, args: existing.args } }])
          else if (activated?.id) await callHost('mcp.remove', [activated.id])
          throw error
        }
      }
      const template = await json(file)
      const existing = (await callHost('mcp.list', [])).find(item => item.serverName === template.serverName)
      return existing ? callHost('mcp.edit', [{ id: existing.id, changes: { ...template, enabled: existing.enabled } }]) : callHost('mcp.add', [template])
    }
    // Skills imports use an explicit folder; archive extraction is handled by
    // the archive validation worker, never by an arbitrary shell command.
    if (kind === 'skill') {
      const { extractSkill } = await import('./skill-archive.mjs')
      const folder = await extractSkill(file, join(root, 'skills', entry.sha256))
      return callHost('skill.update', [{ sourcePath: folder }])
    }
    if (kind === 'python' && entry.role === 'dependency-manifest' && applyPython) return applyPython(entry, file)
    throw new Error('This Python resource requires the dedicated runtime updater')
  }
  async function update(kind, source) {
    const document = await catalog(source ?? `${feedBase}/${kind}-latest.json`)
    if (kind === 'plugin') {
      const manifest = await json(join(active, 'package.json'))
      const result = []
      for (const entry of document.resources.filter(item => item.kind === 'plugin' && manifest.dsh?.profile?.bundles?.includes(item.id))) {
        const installed = await json(join(active, 'node_modules', entry.id, 'package.json')).catch(() => undefined)
        if (installed && compareVersions(entry.version, installed.version) <= 0) continue
        if (!installed && compareVersions(entry.version, '0.1.0') <= 0) continue
        result.push(await plugin(entry.id, source))
      }
      return { updated: result.length, results: result }
    }
    const installed = kind === 'skill' ? await callHost('skill.list', []) : kind === 'mcp' ? await callHost('mcp.list', []) : []
    const names = new Set(installed.map(item => item.name ?? item.serverName))
    const result = []
    for (const entry of document.resources.filter(item => item.kind === kind && names.has(item.id))) result.push(await resource(kind, entry.id, source))
    return { updated: result.length, results: result }
  }
  async function rollbackMcp(id) {
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(id) || id === '.' || id === '..') throw new Error('Invalid MCP resource identity')
    const file = join(root, 'mcp', id, 'current.json')
    const current = await json(file)
    if (!current.previous) throw new Error('No previous MCP generation is available')
    await callHost('mcp.edit', [{ id: current.id, changes: current.previous }])
    await atomic(file, { ...current, previous: undefined, rolledBack: true })
    return { id: current.id, rolledBack: true }
  }
  return { recover, catalog, rollbackMcp: id => exclusive(() => rollbackMcp(id)), mutate: args => exclusive(() => mutate(args)), plugin: (id, source) => exclusive(() => plugin(id, source)), rollback: () => exclusive(rollback), update: (kind, source) => exclusive(() => update(kind, source)), resource: (kind, id, source) => exclusive(() => resource(kind, id, source)) }
}
