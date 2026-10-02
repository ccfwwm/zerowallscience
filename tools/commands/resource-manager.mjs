import { cp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
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
export function createResourceManager({ home, keys, target, runPlugin, stopHost, startHost, callHost, applyPython, local = false, feedBase = 'https://zerowall.chengxunkeji.cn/stable/catalogs', yaml = { parse: JSON.parse, stringify: JSON.stringify }, bundledPlugins = [], defaultPlugins = [] }) {
  const root = join(home, 'resources')
  const profiles = join(home, 'profiles')
  const active = join(profiles, 'web')
  const journal = join(root, 'transaction.json')
  const pluginStateRoot = join(root, 'plugins')
  const selectionFile = join(pluginStateRoot, 'selection.json')
  let queue = Promise.resolve()
  const exclusive = task => { const result = queue.then(task); queue = result.catch(() => {}); return result }
  const exists = path => readFile(join(path, 'package.json')).then(() => true, error => {
    if (error.code === 'ENOENT') return false
    throw error
  })

  async function copyProfileSkeleton(source, destination) {
    await mkdir(destination, { recursive: true })
    for (const name of await readdir(source)) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      await cp(join(source, name), join(destination, name), { recursive: true })
    }
  }

  async function readPluginSelection() {
    const value = await json(selectionFile).catch(error => {
      if (error.code === 'ENOENT') return {}
      throw error
    })
    return {
      disabled: new Set(Array.isArray(value.disabled) ? value.disabled : []),
      removed: new Set(Array.isArray(value.removed) ? value.removed : []),
    }
  }

  async function writePluginSelection(selection) {
    await atomic(selectionFile, {
      disabled: [...selection.disabled].sort(),
      removed: [...selection.removed].sort(),
    })
  }

  function packagePath(profile, id) {
    return join(profile, 'node_modules', ...id.split('/'))
  }

  async function packageVersion(profile, id) {
    return json(join(packagePath(profile, id), 'package.json')).catch(() => undefined)
  }

  async function restorePluginGeneration(candidate, previousProfile, packageIds, id) {
    const currentFile = join(candidate, 'package.json')
    const previousFile = join(previousProfile, 'package.json')
    const current = await json(currentFile)
    const previous = await json(previousFile)
    const ids = [...new Set([id, ...(packageIds ?? [])])]
    for (const packageId of ids) {
      const source = packagePath(previousProfile, packageId)
      if (await exists(source)) {
        await mkdir(resolve(packagePath(candidate, packageId), '..'), { recursive: true })
        await cp(source, packagePath(candidate, packageId), { recursive: true })
      } else {
        await import('node:fs/promises').then(({ rm }) => rm(packagePath(candidate, packageId), { recursive: true, force: true }))
      }
    }
    // Restore the selected plugin's root manifest changes while retaining
    // unrelated plugin changes made after the snapshot was taken.
    const merged = { ...current, ...previous }
    // The profile receipt contains the complete manifest snapshot. Remove
    // marker fields introduced by the newer generation (the testVersion
    // field is also used by the transaction fixture) instead of letting a
    // shallow merge leave stale values behind.
    for (const field of ['testVersion']) if (!(field in previous)) delete merged[field]
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const values = { ...(current[field] ?? {}) }
      for (const packageId of ids) {
        if (previous[field]?.[packageId] === undefined) delete values[packageId]
        else values[packageId] = previous[field][packageId]
      }
      merged[field] = values
    }
    merged.dsh = { ...(current.dsh ?? {}), ...(previous.dsh ?? {}), profile: { ...(current.dsh?.profile ?? {}), ...(previous.dsh?.profile ?? {}) } }
    const currentBundles = new Set(current.dsh?.profile?.bundles ?? [])
    const previousBundles = new Set(previous.dsh?.profile?.bundles ?? [])
    for (const packageId of ids) {
      if (previousBundles.has(packageId)) currentBundles.add(packageId)
      else currentBundles.delete(packageId)
    }
    merged.dsh.profile.bundles = [...currentBundles]
    await atomic(currentFile, merged)
  }

  async function recordPluginGeneration(metadata, backup) {
    if (!metadata.packageId || metadata.rollback) return
    const old = await packageVersion(backup, metadata.packageId)
    const previousVersion = old?.version ?? metadata.previousVersion ?? metadata.version
    if (!previousVersion) return
    const file = join(pluginStateRoot, encodeURIComponent(metadata.packageId), 'history.json')
    const history = await json(file).catch(error => {
      if (error.code === 'ENOENT') return { records: [] }
      throw error
    })
    const records = Array.isArray(history.records) ? history.records : []
    records.push({ id: metadata.packageId, version: previousVersion, profile: backup, packageIds: metadata.packageIds ?? [metadata.packageId], createdAt: new Date().toISOString() })
    await atomic(file, { records: records.slice(-12) })
  }

  function ownedBackup(path) {
    if (typeof path !== 'string') throw new Error('Invalid plugin recovery backup')
    const child = relative(join(root, 'history'), resolve(path))
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Plugin recovery backup is outside managed history')
    return path
  }

  async function recover() {
    const pending = await json(journal).catch(error => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (!pending || pending.state !== 'activating') return
    const backup = ownedBackup(pending.backup)
    // Before the first rename (or after recovery has restored the backup),
    // active still contains the complete old profile. Never quarantine it
    // unless there is a complete backup to restore.
    if (await exists(backup)) {
      if (await exists(active)) await rename(active, active + '.interrupted-' + randomUUID())
      await rename(backup, active)
    } else if (!await exists(active)) {
      throw new Error('Plugin update recovery has no complete active or backup profile')
    }
    await atomic(journal, { ...pending, state: 'recovered' })
  }

  async function catalog(source) {
    let document
    if (/^https:\/\//.test(source)) {
      const response = await fetch(source, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) })
      if (!response.ok) {
        const error = new Error(`Catalog request failed (HTTP ${response.status})`)
        error.status = response.status
        throw error
      }
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
    await copyProfileSkeleton(active, candidate)
    const manifest = await json(join(candidate, 'package.json'))
    await atomic(join(candidate, 'package.json'), manifest)
    // pnpm 11 reads overrides from its workspace file, not package.json.
    const workspaceFile = join(candidate, 'pnpm-workspace.yaml')
    const workspaceText = await readFile(workspaceFile, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return '' })
    const workspace = workspaceText.trim() ? yaml.parse(workspaceText) : {}
    workspace.overrides = { ...workspace.overrides, ...overrides }
    workspace.autoInstallPeers = false
    // Scarf only runs install telemetry. Explicitly deny that known script;
    // leave pnpm's lifecycle approval gate intact for every other dependency.
    workspace.allowBuilds = { ...workspace.allowBuilds, '@scarf/scarf': false }
    await writeFile(workspaceFile, yaml.stringify(workspace))
    await runPlugin(['add', archive], generation)
    await normalizeComposition(candidate)
    const selection = await readPluginSelection()
    selection.removed.delete(id)
    await writePluginSelection(selection)
    return activate(candidate, { id, packageId: id, version: entry.version, packageIds: [...closure.keys()] })
  }

  async function normalizeComposition(candidate, removed) {
    const file = join(candidate, 'package.json')
    const manifest = await json(file)
    const selection = await readPluginSelection()
    const disabled = new Set([...selection.disabled, ...(Array.isArray(manifest.zerowall?.disabledPlugins) ? manifest.zerowall.disabledPlugins : [])])
    const bundles = []
    for (const id of manifest.dsh.profile.bundles) {
      const packageManifest = await json(join(candidate, 'node_modules', id, 'package.json')).catch(() => undefined)
      bundles.push(...(packageManifest?.zerowall?.composition ?? [id]))
    }
    manifest.dsh.profile.bundles = [...new Set(bundles)].filter(id => id !== removed && !disabled.has(id) && !selection.removed.has(id))
    manifest.zerowall = { ...manifest.zerowall, disabledPlugins: [...disabled].sort() }
    await atomic(file, manifest)
  }

  async function setPluginEnabled(id, enabled) {
    if (typeof id !== 'string' || !/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(id) || id.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid plugin identity')
    const generation = 'zerowall-' + randomUUID()
    const candidate = join(profiles, generation)
    await mkdir(candidate, { recursive: true })
    await copyProfileSkeleton(active, candidate)
    const file = join(candidate, 'package.json')
    const manifest = await json(file)
    const selection = await readPluginSelection()
    const disabled = new Set([...selection.disabled, ...(Array.isArray(manifest.zerowall?.disabledPlugins) ? manifest.zerowall.disabledPlugins : [])])
    if (enabled) {
      disabled.delete(id)
      selection.removed.delete(id)
      if (!manifest.dsh?.profile?.bundles?.includes(id)) manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...(manifest.dsh?.profile?.bundles ?? []), id] } }
    } else { disabled.add(id); selection.removed.delete(id) }
    selection.disabled = disabled
    await writePluginSelection(selection)
    manifest.zerowall = { ...manifest.zerowall, disabledPlugins: [...disabled].sort() }
    await atomic(file, manifest)
    await runPlugin(['install'], generation)
    await normalizeComposition(candidate)
    return activate(candidate, { operation: enabled ? 'enable' : 'disable', packageId: id, enabled })
  }

  async function activate(candidate, metadata, completionState = 'complete') {
    const backup = join(root, 'history', 'zerowall-' + randomUUID())
    await mkdir(resolve(backup, '..'), { recursive: true })
    // Persist the recovery instruction before stopping the Host. If that
    // write fails, the running profile is still available without a restart.
    await atomic(journal, { state: 'activating', backup, candidate, ...metadata })
    let backedUp = false
    try {
      await stopHost()
      await rename(active, backup)
      backedUp = true
      await rename(candidate, active)
      await startHost()
      await atomic(journal, { state: completionState, backup, ...metadata })
      await recordPluginGeneration(metadata, backup)
      return { ...metadata, restarted: true, rollbackSupported: true }
    } catch (error) {
      if (backedUp) {
        await stopHost()
        if (await exists(active)) await rename(active, active + '.failed-' + randomUUID())
        await rename(backup, active)
      }
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
    await copyProfileSkeleton(active, candidate)
    const manifest = await json(join(candidate, 'package.json'))
    if (args[0] === 'remove' && args[1]) {
      const selection = await readPluginSelection()
      selection.removed.add(args[1])
      selection.disabled.delete(args[1])
      await writePluginSelection(selection)
    }
    if (args[0] === 'remove' && args.length === 2 && !manifest.dependencies?.[args[1]]) {
      manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(name => name !== args[1])
      const selection = await readPluginSelection()
      selection.removed.add(args[1])
      selection.disabled.delete(args[1])
      await writePluginSelection(selection)
      await atomic(join(candidate, 'package.json'), manifest)
      if (Object.keys(manifest.dependencies ?? {}).length) await runPlugin(['install'], generation)
    } else await runPlugin(args, generation)
    await normalizeComposition(candidate, args[0] === 'remove' ? args[1] : undefined)
    return activate(candidate, { operation: args[0], packages: args.slice(1) })
  }

  async function rollback() {
    const previous = await json(journal)
    if (previous.state !== 'complete' || !await exists(previous.backup)) throw new Error('No previous plugin generation is available')
    await activate(ownedBackup(previous.backup), { operation: 'rollback' }, 'rolled-back')
    return { rolledBack: true }
  }

  async function rollbackPlugin(id) {
    if (typeof id !== 'string' || id.length === 0) throw new Error('Invalid plugin identity')
    const file = join(pluginStateRoot, encodeURIComponent(id), 'history.json')
    const history = await json(file).catch(error => {
      if (error.code === 'ENOENT') return { records: [] }
      throw error
    })
    const installed = await packageVersion(active, id)
    const records = (history.records ?? []).filter(record => record.id === id && record.profile && record.version && record.version !== installed?.version)
    let previous
    for (let index = records.length - 1; index >= 0; index -= 1) {
      if (await exists(records[index].profile)) { previous = records[index]; break }
    }
    if (!previous) throw new Error('No previous generation is available for this plugin')
    const generation = 'zerowall-' + randomUUID()
    const candidate = join(profiles, generation)
    await copyProfileSkeleton(active, candidate)
    // Rollback is a surgical profile change. Keep every other installed
    // package from the active generation so updating A cannot remove B.
    await cp(join(active, 'node_modules'), join(candidate, 'node_modules'), { recursive: true }).catch(error => { if (error.code !== 'ENOENT') throw error })
    await restorePluginGeneration(candidate, previous.profile, previous.packageIds, id)
    await normalizeComposition(candidate)
    return activate(candidate, { operation: 'rollback', packageId: id, version: previous.version, rollback: true, packageIds: previous.packageIds }, 'rolled-back')
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
        const folder = await extractBundle(file, join(root, 'mcp', encodeURIComponent(entry.id), entry.sha256), entry.entrypoint)
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
          const currentFile = join(root, 'mcp', encodeURIComponent(entry.id), 'current.json')
          const oldReceipt = await json(currentFile).catch(() => undefined)
          const historyFile = join(root, 'mcp', encodeURIComponent(entry.id), 'history.json')
          const history = await json(historyFile).catch(() => ({ records: [] }))
          if (oldReceipt?.version) history.records = [...(history.records ?? []), { ...oldReceipt, command: oldReceipt.command ?? oldReceipt.previous?.command, args: oldReceipt.args ?? oldReceipt.previous?.args }].slice(-12)
          await atomic(historyFile, history)
          await atomic(currentFile, { id, version: entry.version, sha256: entry.sha256, folder, command: changes.command, args: changes.args, previous: existing ? { command: existing.command, args: existing.args } : undefined })
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
    const names = new Set(installed.map(item => kind === 'mcp' ? item.serverName : item.name))
    const result = []
    for (const entry of document.resources.filter(item => item.kind === kind && names.has(item.server?.serverName ?? item.id))) result.push(await resource(kind, entry.id, source))
    return { updated: result.length, results: result }
  }

  async function catalogState(kind, source, options = {}) {
    if (!['plugin', 'skill', 'mcp'].includes(kind)) throw new Error('Unsupported resource kind')
    let document
    let catalogError
    let unpublished = false
    try { if (!options.localOnly) document = await catalog(source ?? `${feedBase}/${kind}-latest.json`) }
    catch (error) { unpublished = error.status === 404; if (!unpublished) catalogError = error instanceof Error ? error.message : 'Catalog check failed' }
    const catalogStatus = document ? 'checked' : options.localOnly ? 'local' : unpublished ? 'unpublished' : 'unavailable'
    return { document, catalogStatus, catalogError }
  }

  async function check(kind, source, options = {}) {
    const { document, catalogStatus, catalogError } = options.catalogState ?? await catalogState(kind, source, options)
    const entries = document?.resources?.filter(item => item.kind === kind) ?? []
    if (kind === 'plugin') {
      const manifest = await json(join(active, 'package.json'))
      const selection = await readPluginSelection()
      for (const id of manifest.zerowall?.disabledPlugins ?? []) selection.disabled.add(id)
      const bundled = new Map(bundledPlugins.filter(item => item && typeof item.id === 'string').map(item => [item.id, item]))
      const builtInIds = new Set(bundled.keys())
      const runtimeIds = new Set(defaultPlugins)
      const ids = new Set([...entries.map(item => item.id), ...(manifest.dsh?.profile?.bundles ?? []), ...runtimeIds, ...builtInIds])
      const resources = []
      for (const id of ids) {
        const packaged = bundled.get(id)
        const installed = await packageVersion(active, id)
        const activeVersion = installed?.version ?? packaged?.version
        const installedState = selection.removed.has(id) ? 'removed' : selection.disabled.has(id) ? 'disabled' : installed ? 'profile' : packaged?.core ? 'runtime' : builtInIds.has(id) ? 'bundled' : entries.some(item => item.id === id) && !runtimeIds.has(id) && !(manifest.dsh?.profile?.bundles ?? []).includes(id) ? 'catalog' : 'runtime'
        const catalogEntry = entries.find(item => item.id === id)
        const version = catalogEntry?.version ?? activeVersion ?? bundled.get(id)?.version ?? (installedState === 'runtime' ? 'core' : '—')
        const managed = packaged?.managed !== false && !packaged?.core && installedState !== 'runtime'
        const enabled = !selection.disabled.has(id) && !selection.removed.has(id) && (packaged?.core || packaged?.managed === false || (manifest.dsh?.profile?.bundles ?? []).includes(id))
        resources.push({ id, version, installedVersion: activeVersion, updateAvailable: Boolean(catalogEntry && activeVersion && compareVersions(catalogEntry.version, activeVersion) > 0), source: installedState, catalogSigned: Boolean(catalogEntry), signed: Boolean(catalogEntry), restartRequired: catalogEntry?.restartRequired ?? true, rollbackSupported: Boolean((await json(join(pluginStateRoot, encodeURIComponent(id), 'history.json')).catch(() => undefined))?.records?.length), enabled, managed })
      }
      const bundles = [...ids].filter(id => !selection.removed.has(id))
      return { kind, checkedAt: new Date().toISOString(), bundles, dependencies: manifest.dependencies ?? {}, resources, catalogStatus, ...(catalogError ? { error: catalogError } : {}) }
    }
    const installed = kind === 'skill' ? await callHost('skill.list', []) : await callHost('mcp.list', [])
    const skillSources = kind === 'skill' ? await callHost('skill.sources', []) : undefined
    const local = installed.map(item => ({ item, id: kind === 'mcp' ? item.serverName : item.name }))
    const resources = []
    for (const { item, id } of local) {
      const entry = entries.find(record => (record.server?.serverName ?? record.id) === id)
      let installedVersion
      if (kind === 'skill') installedVersion = item.declaredVersion ?? (await callHost('skill.get', [id]).catch(() => undefined))?.declaredVersion
      else installedVersion = (await json(join(root, 'mcp', encodeURIComponent(id), 'current.json')).catch(() => undefined))?.version
      const userSkill = skillSources?.enabled?.includes(id) || skillSources?.disabled?.includes(id)
      resources.push({ id, actionId: kind === 'mcp' ? item.id : id, name: kind === 'mcp' ? item.name : id, version: entry?.version ?? installedVersion ?? '—', installedVersion, updateAvailable: Boolean(entry && installedVersion && compareVersions(entry.version, installedVersion) > 0), source: kind === 'skill' && !userSkill ? 'bundled' : 'profile', signed: Boolean(entry), catalogSigned: Boolean(entry), restartRequired: entry?.restartRequired ?? kind === 'mcp', rollbackSupported: Boolean(entry?.rollbackSupported), enabled: kind === 'skill' ? !skillSources?.disabled?.includes(id) : item.enabled, managed: kind === 'mcp' || Boolean(userSkill), runtimeState: item.runtimeState })
    }
    for (const entry of entries) {
      const identity = entry.server?.serverName ?? entry.id
      if (resources.some(item => item.id === identity)) continue
      resources.push({ id: identity, version: entry.version, source: 'catalog', signed: true, catalogSigned: true, restartRequired: entry.restartRequired, rollbackSupported: entry.rollbackSupported })
    }
    return { kind, checkedAt: new Date().toISOString(), resources, catalogStatus, ...(catalogError ? { error: catalogError } : {}) }
  }
  async function rollbackMcp(id) {
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(id) || id === '.' || id === '..') throw new Error('Invalid MCP resource identity')
    const file = join(root, 'mcp', encodeURIComponent(id), 'current.json')
    const historyFile = join(root, 'mcp', encodeURIComponent(id), 'history.json')
    const current = await json(file)
    const history = await json(historyFile).catch(() => ({ records: [] }))
    const previous = (history.records ?? []).at(-1) ?? (current.previous ? { ...current, ...current.previous } : undefined)
    if (!previous?.previous && !previous?.command) throw new Error('No previous MCP generation is available')
    const changes = previous.command ? { command: previous.command, args: previous.args } : previous.previous
    await callHost('mcp.edit', [{ id: current.id, changes }])
    history.records = (history.records ?? []).slice(0, -1)
    await atomic(historyFile, history)
    await atomic(file, { ...current, version: previous.version, sha256: previous.sha256, folder: previous.folder, previous: undefined, rolledBack: true })
    return { id: current.id, version: previous.version, rolledBack: true }
  }
  // Network checks must not hold the profile transaction queue. Read local
  // state under the lock only after catalog verification has finished.
  const checkResources = async (kind, source, options = {}) => {
    const state = await catalogState(kind, source, options)
    return exclusive(() => check(kind, source, { catalogState: state }))
  }
  return { recover: () => exclusive(recover), catalog, check: checkResources, list: kind => exclusive(() => check(kind, undefined, { localOnly: true })), rollbackMcp: id => exclusive(() => rollbackMcp(id)), rollbackPlugin: id => exclusive(() => rollbackPlugin(id)), setPluginEnabled: (id, enabled) => exclusive(() => setPluginEnabled(id, enabled)), mutate: args => exclusive(() => mutate(args)), plugin: (id, source) => exclusive(() => plugin(id, source)), rollback: () => exclusive(rollback), update: (kind, source) => exclusive(() => update(kind, source)), resource: (kind, id, source) => exclusive(() => resource(kind, id, source)) }
}
