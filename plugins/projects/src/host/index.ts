import type { Context } from '@deepseek-ai/cordis'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { access, link, mkdir, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import {
  createSessionArchive,
  parseProjectBundle,
  parseSessionArchiveHeader,
  ResearchStore,
} from '@zerowallscience/research-store'
import type {
  CreateMcpServerInput,
  McpServerRecord,
  ProjectPreferencesRecord,
  SessionArchiveV1,
  UpdateMcpServerInput,
  UpdateProjectInput,
} from '@zerowallscience/research-store/types'
import type { JsonObject } from '@zerowallscience/research-store/types'
import type {
  CreateProjectRequest,
  ImportProjectRequest,
  PlatformHealth,
  ProjectBundleV1,
  ProjectDto,
} from '../shared/types.js'
import type {} from 'zod'

const RESEARCH_STORE = Symbol('zerowall.research-store')

export type {
  CreateProjectRequest,
  ImportProjectRequest,
  PlatformHealth,
  ProjectBundleV1,
  ProjectDto,
} from '../shared/types.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    zerowallProjects: ZeroWallProjectsService
  }
}

export class ZeroWallProjectsService extends TypertRemoteService {
  private readonly [RESEARCH_STORE]: ResearchStore
  private readonly databasePath: string

  constructor(ctx: Context) {
    super(ctx, 'zerowallProjects')
    const databasePath = process.env.ZEROWALL_RESEARCH_DB?.trim()
    if (!databasePath) throw new Error('ZEROWALL_RESEARCH_DB is required.')
    this.databasePath = databasePath
    this[RESEARCH_STORE] = new ResearchStore(databasePath)
    ctx.effect(() => () => this[RESEARCH_STORE].close(), 'zerowall-projects: close research store')
  }

  @Remote('health')
  health(): PlatformHealth {
    return { status: 'ok', schemaVersion: this[RESEARCH_STORE].schemaVersion(), databasePath: this.databasePath }
  }

  @Remote('list')
  list(): ProjectDto[] {
    return this[RESEARCH_STORE].listProjects()
  }

  @Remote('create')
  create(input: CreateProjectRequest): ProjectDto {
    return this[RESEARCH_STORE].createProject(input)
  }

  @Remote('get')
  get(id: string): ProjectDto {
    const project = this[RESEARCH_STORE].getProject(id)
    if (project === undefined) throw new Error(`Project was not found: ${id}`)
    return project
  }

  @Remote('open')
  open(id: string): ProjectDto {
    return this[RESEARCH_STORE].openProject(id)
  }

  @Remote('update')
  update(input: { id: string; changes: UpdateProjectInput }): ProjectDto {
    return this[RESEARCH_STORE].updateProject(input.id, input.changes)
  }

  @Remote('recent')
  recent(limit: number): ProjectDto[] {
    return this[RESEARCH_STORE].listRecentProjects(limit)
  }

  @Remote('getSettings')
  getSettings(projectId: string): ProjectPreferencesRecord {
    return this[RESEARCH_STORE].getProjectPreferences(projectId)
  }

  @Remote('updateSettings')
  updateSettings(input: { projectId: string; settings: JsonObject }): ProjectPreferencesRecord {
    return this[RESEARCH_STORE].updateProjectSettings(input.projectId, input.settings)
  }

  @Remote('exportBundle')
  async exportBundle(id: string): Promise<ProjectBundleV1> {
    const bundle = this[RESEARCH_STORE].exportProjectBundle(id)
    const archives = await collectProjectSessionArchives(this.sessionPersistence(), bundle.project.rootPath)
    return this[RESEARCH_STORE].exportProjectBundle(id, archives)
  }

  @Remote('importBundle')
  async importBundle(input: ImportProjectRequest): Promise<ProjectDto> {
    const bundle = parseProjectBundle(input.bundle)
    const sessions = this.ctx.get('sessions')
    const restored = bundle.sessionArchives.length === 0
      ? []
      : await restoreSessionArchives(
        this.sessionPersistence(),
        bundle.sessionArchives,
        (id) => sessions?.get(SessionId(id)) !== undefined,
      )
    try {
      return this[RESEARCH_STORE].importProjectBundle(bundle).project
    } catch (error) {
      await Promise.all(restored.map((entry) => rm(entry.path, { force: true })))
      throw error
    }
  }

  listMcpServers(): McpServerRecord[] {
    return this[RESEARCH_STORE].listMcpServers()
  }

  getMcpServer(id: string): McpServerRecord | undefined {
    return this[RESEARCH_STORE].getMcpServer(id)
  }

  createMcpServer(input: CreateMcpServerInput): McpServerRecord {
    return this[RESEARCH_STORE].createMcpServer(input)
  }

  updateMcpServer(id: string, input: UpdateMcpServerInput): McpServerRecord {
    return this[RESEARCH_STORE].updateMcpServer(id, input)
  }

  deleteMcpServer(id: string): void {
    this[RESEARCH_STORE].deleteMcpServer(id)
  }

  private sessionPersistence(): SessionPersistence {
    const persistence = this.ctx.get('sessionPersistence')
    if (persistence === undefined) throw new Error('DSH session persistence is not available.')
    return persistence
  }
}

interface RestoredSessionArchive {
  id: string
  path: string
}

export async function collectProjectSessionArchives(
  persistence: SessionPersistence,
  rootPath: string,
): Promise<SessionArchiveV1[]> {
  if (!persistence.supportsRawArtifacts) throw new Error('The configured DSH session backend cannot export raw sessions.')
  const headers = (await persistence.list())
    .filter((header) => header.cwd === rootPath)
    .sort((left, right) => left.createdAt - right.createdAt || String(left.id).localeCompare(String(right.id)))
  const archives: SessionArchiveV1[] = []
  for (const header of headers) {
    const raw = await persistence.readRaw(header.id)
    if (raw === undefined) throw new Error(`DSH session disappeared during export: ${String(header.id)}`)
    const archive = createSessionArchive(raw.content)
    if (archive.sessionId !== String(header.id)) throw new Error('DSH session export id does not match its persistence header.')
    archives.push(archive)
  }
  return archives
}

export async function restoreSessionArchives(
  persistence: SessionPersistence,
  archives: readonly SessionArchiveV1[],
  isLive: (id: string) => boolean = () => false,
): Promise<RestoredSessionArchive[]> {
  if (!persistence.supportsRawArtifacts) throw new Error('The configured DSH session backend cannot import raw sessions.')
  const prepared = archives.map((archive) => {
    const parsed = parseSessionArchiveHeader(archive.content)
    const header = toSessionHeader(parsed)
    const location = persistence.locate(header)
    if (location === undefined || location.kind !== 'jsonl' || !location.path.toLowerCase().endsWith('.jsonl')) {
      throw new Error('ZeroWall session import requires the plaintext JSONL DSH session backend.')
    }
    return { archive, header, path: location.path }
  })

  for (const entry of prepared) {
    if (isLive(entry.archive.sessionId)) throw new Error(`DSH session is currently live: ${entry.archive.sessionId}`)
    if (await persistence.readRaw(entry.header.id) !== undefined || await pathExists(entry.path)) {
      throw new Error(`DSH session already exists: ${entry.archive.sessionId}`)
    }
  }

  const restored: RestoredSessionArchive[] = []
  try {
    for (const entry of prepared) {
      await publishNewSession(entry.path, entry.archive.content)
      restored.push({ id: entry.archive.sessionId, path: entry.path })
    }
    return restored
  } catch (error) {
    await Promise.all(restored.map((entry) => rm(entry.path, { force: true })))
    throw error
  }
}

function toSessionHeader(header: ReturnType<typeof parseSessionArchiveHeader>): SessionHeader {
  return {
    version: header.version,
    id: SessionId(header.id),
    createdAt: header.createdAt,
    ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
    ...(header.parentSession === undefined ? {} : { parentSession: SessionId(header.parentSession) }),
    ...(header.seedLength === undefined ? {} : { seedLength: header.seedLength }),
    ...(header.origin === undefined ? {} : { origin: header.origin }),
    delegationDepth: header.delegationDepth,
    ...(header.agentPreset === undefined ? {} : { agentPreset: header.agentPreset }),
  }
}

async function publishNewSession(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
    await link(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export function apply(ctx: Context): void {
  ctx.plugin(ZeroWallProjectsService)
}

export default { apply }
