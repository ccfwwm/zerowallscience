/**
 * Safe, side-effect-free projections of the Host's Skills and MCP registries.
 *
 * Claude Code runs these resources in a separate process. Only effective,
 * model-invocable Skills are copied, and MCP entries are limited to ordinary
 * stdio launches and independently reachable HTTP servers. MCP references stay opaque here and are resolved by the Host
 * into temporary process variables, never persisted as plaintext.
 */
import { createHash } from 'node:crypto'
import { basename, extname, isAbsolute, resolve } from 'node:path'

export interface SkillSummaryProjectionInput {
  name: string
  description: string
  whenToUse?: string
  invocation: { modelInvocable: boolean }
}

export interface SkillDefinitionProjectionInput extends SkillSummaryProjectionInput {
  content: string
  resourceBase?: SkillResourceBaseProjectionInput
}

export type SkillResourceBaseProjectionInput =
  | { kind: 'directory'; path: string }
  | { kind: 'url'; url: string }
  | { kind: 'opaque'; description: string }

export interface SkillsProjectionApi {
  snapshot(options?: { cwd?: string; scope?: object }): Promise<{ skills: readonly SkillSummaryProjectionInput[]; complete: boolean }>
  get(name: string, options?: { cwd?: string; scope?: object }): Promise<SkillDefinitionProjectionInput | undefined>
}

export interface ProjectedClaudeSkill {
  name: string
  description: string
  content: string
  whenToUse?: string
  resourceBase?: SkillResourceBaseProjectionInput
}

export interface SkillProjectionResult {
  skills: ProjectedClaudeSkill[]
  skipped: Array<{ name: string; reason: 'not-model-invocable' | 'invalid-summary' | 'unavailable' | 'invalid-definition' }>
}

const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

/**
 * Load the current workspace catalog and full bodies, failing closed when
 * discovery is incomplete. The DSH registry has no separate `enabled` bit:
 * `ctx.skills.list()` is the effective catalog, and `invocation.modelInvocable`
 * is the explicit enablement gate for model consumers.
 */
export async function projectSkillsForClaude(
  registry: SkillsProjectionApi,
  cwd: string,
  scope?: object,
): Promise<SkillProjectionResult> {
  // Scoped service lookup alone does not select DSH's catalog overlays.
  // Both catalog and body reads must use the viewing agent's scope.
  const lookup = { cwd, ...(scope === undefined ? {} : { scope }) }
  let snapshot: Awaited<ReturnType<SkillsProjectionApi['snapshot']>>
  try {
    snapshot = await registry.snapshot(lookup)
  } catch {
    throw new Error('The current Skills catalog could not be read; Claude Code projection was not updated.')
  }
  if (!snapshot.complete) throw new Error('The current Skills catalog is incomplete; Claude Code projection was not updated.')

  const skills: ProjectedClaudeSkill[] = []
  const skipped: SkillProjectionResult['skipped'] = []
  for (const summary of snapshot.skills) {
    const name = typeof summary.name === 'string' ? summary.name : ''
    if (summary.invocation?.modelInvocable !== true) {
      skipped.push({ name, reason: 'not-model-invocable' })
      continue
    }
    if (!skillNamePattern.test(name) || typeof summary.description !== 'string' || summary.description.trim() === '') {
      skipped.push({ name, reason: 'invalid-summary' })
      continue
    }

    let definition: SkillDefinitionProjectionInput | undefined
    try {
      definition = await registry.get(name, lookup)
    } catch {
      // A provider may invalidate or fail between catalog and body lookup.
      // Exclude this skill rather than projecting stale or partial content.
      skipped.push({ name, reason: 'unavailable' })
      continue
    }
    if (!definition) {
      skipped.push({ name, reason: 'unavailable' })
      continue
    }
    if (definition.name !== name
      || definition.invocation?.modelInvocable !== true
      || typeof definition.description !== 'string'
      || definition.description.trim() === ''
      || typeof definition.content !== 'string'
      || definition.content.trim() === ''
      || definition.content.includes('\0')) {
      skipped.push({ name, reason: 'invalid-definition' })
      continue
    }

    skills.push({
      name,
      description: definition.description,
      content: definition.content,
      ...(typeof definition.whenToUse === 'string' && definition.whenToUse.trim() !== ''
        ? { whenToUse: definition.whenToUse }
        : {}),
      ...(definition.resourceBase ? { resourceBase: definition.resourceBase } : {}),
    })
  }
  return { skills, skipped }
}

export interface McpServerProjectionInput {
  name: string
  serverName: string
  transport: string
  enabled: boolean
  command: string
  args: readonly string[]
  cwd?: string
  url?: string
  envRefs: Readonly<Record<string, string>>
  headerRefs: Readonly<Record<string, string>>
}

export interface McpLauncherSpec {
  cwd: string
  command: string
  args: string[]
  useBundledNode: boolean
  resolveFromPath?: boolean
}

export type ProjectedClaudeMcpServer = {
  serverName: string
  type: 'stdio'
  command: string
  args: string[]
  envRefs: Record<string, string>
  launcher?: McpLauncherSpec
} | {
  serverName: string
  type: 'http'
  url: string
  headerRefs: Record<string, string>
}

export type McpSkipReason =
  | 'disabled'
  | 'unsupported-transport'
  | 'unsupported-working-directory'
  | 'unsupported-launch'
  | 'managed-server'
  | 'credential-reference'
  | 'invalid-credential-reference'
  | 'credential-unavailable'
  | 'invalid-launch'
  | 'duplicate-server-name'

export interface McpProjectionResult {
  servers: ProjectedClaudeMcpServer[]
  skipped: Array<{ serverName: string; reason: McpSkipReason }>
}

const mcpServerNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u
const referenceNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/u
const httpHeaderNamePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u

function normalizedMcpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value !== value.trim() || /[\u0000-\u0020\u007f?#]/u.test(value)) return undefined
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return undefined
    return url.href
  } catch { return undefined }
}

function normalizedWorkingDirectory(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.includes('\0') || !isAbsolute(value)) return undefined
  const absolute = resolve(value)
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}

function independentLaunch(record: McpServerProjectionInput, cwd: string, allowPath: boolean): McpLauncherSpec | undefined {
  const command = record.command
  const commandName = basename(command).toLowerCase()
  if (commandName === 'node' || commandName === 'node.exe') {
    return { cwd, command, args: [...record.args], useBundledNode: true }
  }
  // Every stdio service uses the relay to isolate credentials. Arbitrary command
  // strings may depend on a shell, so a different cwd requires an absolute native
  // executable; inherited/same-cwd commands may resolve from absolute PATH entries.
  if (/\.(?:cmd|bat|ps1|sh|cjs|mjs|js)$/iu.test(command)) return undefined
  if (!isAbsolute(command)) {
    if (!allowPath || /[\\/:]/u.test(command) || command !== command.trim()) return undefined
    return { cwd, command, args: [...record.args], useBundledNode: false, resolveFromPath: true }
  }
  if (process.platform === 'win32' && extname(command).toLowerCase() !== '.exe') return undefined
  return { cwd, command, args: [...record.args], useBundledNode: false }
}

/**
 * Project independently launchable stdio or reachable HTTP MCP records. This function
 * retains only reference names; the Host resolves values for one child process.
 */
export function projectMcpForClaude(records: readonly McpServerProjectionInput[], cwd: string): McpProjectionResult {
  const sessionCwd = normalizedWorkingDirectory(cwd)
  const counts = new Map<string, number>()
  for (const record of records) counts.set(record.serverName, (counts.get(record.serverName) ?? 0) + 1)

  const servers: ProjectedClaudeMcpServer[] = []
  const skipped: McpProjectionResult['skipped'] = []
  for (const record of records) {
    const serverName = typeof record.serverName === 'string' ? record.serverName : ''
    if (record.enabled !== true) {
      skipped.push({ serverName, reason: 'disabled' })
      continue
    }
    if (record.transport !== 'stdio' && record.transport !== 'streamable-http') {
      skipped.push({ serverName, reason: 'unsupported-transport' })
      continue
    }
    if (serverName.startsWith('zerowall_managed_') || typeof record.command === 'string' && record.command.startsWith('zerowall-managed:')) {
      skipped.push({ serverName, reason: 'managed-server' })
      continue
    }
    if (Object.keys((record.transport === 'stdio' ? record.headerRefs : record.envRefs) ?? {}).length > 0) {
      skipped.push({ serverName, reason: 'credential-reference' })
      continue
    }
    const refs = record.transport === 'stdio' ? record.envRefs ?? {} : record.headerRefs ?? {}
    const targets = Object.keys(refs)
    if (new Set(targets.map(target => target.toLowerCase())).size !== targets.length
      || Object.entries(refs).some(([target, ref]) =>
        typeof ref !== 'string' || !referenceNamePattern.test(ref)
        || (record.transport === 'streamable-http' ? !httpHeaderNamePattern.test(target)
          : !referenceNamePattern.test(target)
            || /^(?:ANTHROPIC_|CLAUDE_|DSH_|NPM_CONFIG_|PNPM_|XDG_)/iu.test(target)
            || ['PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'TEMP', 'TMP', 'TMPDIR'].includes(target.toUpperCase())))) {
      skipped.push({ serverName, reason: 'invalid-credential-reference' })
      continue
    }
    if ((counts.get(serverName) ?? 0) !== 1) {
      skipped.push({ serverName, reason: 'duplicate-server-name' })
      continue
    }
    if (!mcpServerNamePattern.test(serverName)) {
      skipped.push({ serverName, reason: 'invalid-launch' })
      continue
    }
    if (record.transport === 'streamable-http') {
      const url = normalizedMcpUrl(record.url)
      if (!url) {
        skipped.push({ serverName, reason: 'invalid-launch' })
        continue
      }
      servers.push({ serverName, type: 'http', url, headerRefs: { ...refs } })
      continue
    }
    if (typeof record.command !== 'string'
      || record.command.trim() === ''
      || record.command.includes('\0')
      || !Array.isArray(record.args)
      || record.args.some(argument => typeof argument !== 'string' || argument.includes('\0'))) {
      skipped.push({ serverName, reason: 'invalid-launch' })
      continue
    }
    if (process.platform === 'win32' && /\.(?:cmd|bat)$/iu.test(record.command)) {
      skipped.push({ serverName, reason: 'unsupported-launch' })
      continue
    }
    if (!sessionCwd || record.cwd !== undefined
      && (typeof record.cwd !== 'string' || record.cwd.trim() !== '' && !normalizedWorkingDirectory(record.cwd))) {
      skipped.push({ serverName, reason: 'unsupported-working-directory' })
      continue
    }

    const requestedCwd = typeof record.cwd === 'string' && record.cwd.trim() !== '' ? resolve(record.cwd) : cwd
    const differentCwd = record.cwd !== undefined && record.cwd.trim() !== ''
      && normalizedWorkingDirectory(record.cwd) !== sessionCwd
    const launcher = independentLaunch(record, requestedCwd, !differentCwd)
    if (!launcher) {
      skipped.push({ serverName, reason: 'unsupported-launch' })
      continue
    }

    servers.push({
      serverName,
      type: 'stdio',
      command: record.command,
      args: [...record.args],
      envRefs: { ...record.envRefs },
      launcher,
    })
  }
  return { servers, skipped }
}

export interface ClaudeMcpRuntimeProjection {
  servers: Array<
    { serverName: string; type: 'stdio'; command: string; args: string[]; env?: Record<string, string>; launcher?: McpLauncherSpec }
    | { serverName: string; type: 'http'; url: string; headers?: Record<string, string> }
  >
  environment: Record<string, string>
  skipped: McpProjectionResult['skipped']
}

/** Resolve MCP refs into parent-process variables and persist only placeholders. */
export async function prepareClaudeMcpRuntime(
  projection: McpProjectionResult,
  resolveReference: (name: string) => Promise<string | undefined>,
): Promise<ClaudeMcpRuntimeProjection> {
  const servers: ClaudeMcpRuntimeProjection['servers'] = []
  const environment: Record<string, string> = {}
  const skipped = [...projection.skipped]

  for (const server of projection.servers) {
    const placeholders: Record<string, string> = {}
    const serverEnvironment: Record<string, string> = {}
    const refs = server.type === 'stdio' ? server.envRefs : server.headerRefs
    let available = true
    for (const [target, reference] of Object.entries(refs)) {
      let value: string | undefined
      try { value = await resolveReference(reference) } catch { value = undefined }
      if (typeof value !== 'string' || !value.trim() || value.includes('\0') || server.type === 'http' && /[\r\n]/u.test(value)) {
        available = false
        break
      }
      const variable = `ZW_CLAUDE_MCP_${createHash('sha256').update(`${server.serverName}\0${target}`).digest('hex').slice(0, 20).toUpperCase()}`
      serverEnvironment[variable] = value
      placeholders[target] = `$\{${variable}\}`
    }
    if (!available) {
      skipped.push({ serverName: server.serverName, reason: 'credential-unavailable' })
      continue
    }
    Object.assign(environment, serverEnvironment)
    if (server.type === 'http') {
      servers.push({ serverName: server.serverName, type: 'http', url: server.url,
        ...(Object.keys(placeholders).length ? { headers: placeholders } : {}) })
    } else servers.push({
      serverName: server.serverName,
      type: 'stdio',
      command: server.command,
      args: server.args,
      ...(Object.keys(placeholders).length ? { env: placeholders } : {}),
      ...('launcher' in server && server.launcher ? { launcher: server.launcher } : {}),
    })
  }
  return { servers, environment, skipped }
}
