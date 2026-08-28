import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
export * from './domain.ts'
import type {
  ArtifactRecord, AuditEventRecord, CreateArtifactInput, CreateDataAssetInput,
  CreateDecisionInput, CreateExecutionContextInput, CreatePaperInput, CreateResearchEdgeInput,
  CreateRunInput, DataAssetRecord, DecisionRecord, ExecutionContextRecord, PaperRecord,
  ResearchEdgeRecord, ResearchNodeKind, ResearchProjectSnapshotV1, RunRecord, RunStatus,
  CreatePresentationInput, CreatePublicationInput, PresentationRecord, PublicationRecord,
  JsonObject, JsonValue, UpdateExecutionContextInput, UpdatePresentationChanges, UpdateRunChanges, AuditReport,
} from './domain.ts'

export interface ProjectRecord {
  id: string
  name: string
  rootPath: string
  description: string
  createdAt: string
  updatedAt: string
}

export interface CreateProjectInput {
  name: string
  rootPath: string
  description?: string
}

export interface UpdateProjectInput {
  name?: string
  rootPath?: string
  description?: string
}

export interface ProjectPreferencesRecord {
  projectId: string
  settings: JsonObject
  lastOpenedAt?: string
  updatedAt: string
}

export const PROJECT_BUNDLE_FORMAT = 'zerowall-science-project' as const
export const PROJECT_BUNDLE_VERSION = 1 as const
export const SESSION_ARCHIVE_FORMAT = 'dsh-session-jsonl' as const
export const SESSION_ARCHIVE_VERSION = 1 as const
export const DSH_SESSION_FORMAT_VERSION = 0 as const
const MAX_SESSION_ARCHIVE_BYTES = 64 * 1024 * 1024

export interface SessionArchiveHeader {
  version: typeof DSH_SESSION_FORMAT_VERSION
  id: string
  createdAt: number
  cwd?: string
  parentSession?: string
  seedLength?: number
  origin?: 'subagent'
  delegationDepth: number
  agentPreset?: string
}

export interface SessionArchiveV1 {
  format: typeof SESSION_ARCHIVE_FORMAT
  version: typeof SESSION_ARCHIVE_VERSION
  sessionId: string
  sha256: string
  content: string
}

export interface ProjectBundleV1 {
  format: typeof PROJECT_BUNDLE_FORMAT
  version: typeof PROJECT_BUNDLE_VERSION
  exportedAt: string
  project: ProjectRecord
  sessionArchives: SessionArchiveV1[]
}

export interface ImportedProjectBundle {
  project: ProjectRecord
  sessionArchives: SessionArchiveV1[]
}

export type McpTransport = 'stdio' | 'streamable-http'

export interface McpReconnectPolicy {
  enabled: boolean
  initialDelayMs: number
  maxDelayMs: number
  maxAttempts: number
}

export interface McpServerRecord {
  id: string
  name: string
  serverName: string
  transport: McpTransport
  enabled: boolean
  command: string
  args: string[]
  cwd: string
  envRefs: Record<string, string>
  url: string
  headerRefs: Record<string, string>
  toolCallTimeoutMs: number
  failOnStartupError: boolean
  reconnect: McpReconnectPolicy
  createdAt: string
  updatedAt: string
}

export interface CreateMcpServerInput {
  name: string
  serverName: string
  transport: McpTransport
  enabled?: boolean
  command?: string
  args?: string[]
  cwd?: string
  envRefs?: Record<string, string>
  url?: string
  headerRefs?: Record<string, string>
  toolCallTimeoutMs?: number
  failOnStartupError?: boolean
  reconnect?: Partial<McpReconnectPolicy>
}

export type UpdateMcpServerInput = Partial<CreateMcpServerInput>

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE projects (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL CHECK(length(trim(name)) > 0),
        root_path TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX projects_updated_at_idx ON projects(updated_at DESC, id);
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE mcp_servers (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL CHECK(length(trim(name)) > 0),
        server_name TEXT NOT NULL UNIQUE CHECK(length(server_name) BETWEEN 1 AND 32),
        transport TEXT NOT NULL CHECK(transport IN ('stdio', 'streamable-http')),
        enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
        command TEXT NOT NULL DEFAULT '',
        args_json TEXT NOT NULL DEFAULT '[]',
        cwd TEXT NOT NULL DEFAULT '',
        env_refs_json TEXT NOT NULL DEFAULT '{}',
        url TEXT NOT NULL DEFAULT '',
        header_refs_json TEXT NOT NULL DEFAULT '{}',
        tool_call_timeout_ms INTEGER NOT NULL CHECK(tool_call_timeout_ms > 0),
        fail_on_startup_error INTEGER NOT NULL CHECK(fail_on_startup_error IN (0, 1)),
        reconnect_enabled INTEGER NOT NULL CHECK(reconnect_enabled IN (0, 1)),
        reconnect_initial_delay_ms INTEGER NOT NULL CHECK(reconnect_initial_delay_ms > 0),
        reconnect_max_delay_ms INTEGER NOT NULL CHECK(reconnect_max_delay_ms > 0),
        reconnect_max_attempts INTEGER NOT NULL CHECK(reconnect_max_attempts > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX mcp_servers_updated_at_idx ON mcp_servers(updated_at DESC, id);
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE research_nodes (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('execution-context', 'data-asset', 'run', 'artifact', 'paper', 'decision')),
        UNIQUE(project_id, id)
      );
      CREATE INDEX research_nodes_project_idx ON research_nodes(project_id, kind, id);

      CREATE TABLE execution_contexts (
        id TEXT PRIMARY KEY NOT NULL REFERENCES research_nodes(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK(length(trim(name)) > 0),
        kind TEXT NOT NULL CHECK(kind IN ('local', 'wsl', 'ssh')),
        config_json TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(project_id, id)
      );
      CREATE TABLE data_assets (
        id TEXT PRIMARY KEY NOT NULL REFERENCES research_nodes(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK(length(trim(name)) > 0), uri TEXT NOT NULL CHECK(length(trim(uri)) > 0),
        location TEXT NOT NULL CHECK(location IN ('local','wsl','ssh','object-storage','web')),
        media_type TEXT NOT NULL DEFAULT '', byte_size INTEGER CHECK(byte_size IS NULL OR byte_size >= 0),
        checksum_algorithm TEXT CHECK(checksum_algorithm IS NULL OR checksum_algorithm IN ('sha256','sha512')),
        checksum TEXT, provenance_json TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, id)
      );
      CREATE TABLE runs (
        id TEXT PRIMARY KEY NOT NULL REFERENCES research_nodes(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        execution_context_id TEXT REFERENCES execution_contexts(id) ON DELETE SET NULL,
        name TEXT NOT NULL CHECK(length(trim(name)) > 0),
        status TEXT NOT NULL CHECK(status IN ('draft','submitted','running','paused','cancelling','succeeded','failed','cancelled','timed_out')),
        command TEXT NOT NULL, working_directory TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0 CHECK(progress >= 0 AND progress <= 1),
        pid INTEGER, remote_pid TEXT, lease_owner TEXT, lease_expires_at TEXT, heartbeat_at TEXT, log_uri TEXT,
        outputs_json TEXT NOT NULL DEFAULT '[]', error TEXT, version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, id)
      );
      CREATE INDEX runs_project_status_idx ON runs(project_id, status, updated_at DESC);
      CREATE TABLE artifacts (
        id TEXT PRIMARY KEY NOT NULL REFERENCES research_nodes(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        run_id TEXT REFERENCES runs(id) ON DELETE SET NULL, name TEXT NOT NULL CHECK(length(trim(name)) > 0),
        uri TEXT NOT NULL CHECK(length(trim(uri)) > 0), media_type TEXT NOT NULL DEFAULT '', checksum TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, id)
      );
      CREATE TABLE papers (
        id TEXT PRIMARY KEY NOT NULL REFERENCES research_nodes(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK(length(trim(title)) > 0), doi TEXT, uri TEXT, citation_json TEXT NOT NULL DEFAULT '{}',
        notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, id)
      );
      CREATE TABLE decisions (
        id TEXT PRIMARY KEY NOT NULL REFERENCES research_nodes(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK(length(trim(title)) > 0), rationale TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('proposed','accepted','rejected','superseded')),
        version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(project_id, id)
      );
      CREATE TABLE research_edges (
        id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        from_id TEXT NOT NULL REFERENCES research_nodes(id) ON DELETE CASCADE,
        to_id TEXT NOT NULL REFERENCES research_nodes(id) ON DELETE CASCADE,
        relation TEXT NOT NULL CHECK(length(trim(relation)) > 0), metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL,
        UNIQUE(project_id, from_id, to_id, relation)
      );
      CREATE TABLE audit_events (
        id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        entity_id TEXT REFERENCES research_nodes(id) ON DELETE SET NULL,
        action TEXT NOT NULL CHECK(length(trim(action)) > 0), details_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
      );
      CREATE INDEX audit_events_project_idx ON audit_events(project_id, created_at DESC, id);
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE publications (
        id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK(length(trim(title)) > 0),
        status TEXT NOT NULL CHECK(status IN ('draft','frozen','validating','ready','failed')),
        manifest_json TEXT NOT NULL DEFAULT '{}', frozen_snapshot_json TEXT, validation_json TEXT NOT NULL DEFAULT '{}', export_uri TEXT,
        version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX publications_project_idx ON publications(project_id, updated_at DESC, id);
      CREATE TABLE presentations (
        id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK(length(trim(title)) > 0),
        status TEXT NOT NULL CHECK(status IN ('draft','outlining','designing','generating','paused','ready','failed','cancelled')),
        outline_json TEXT NOT NULL DEFAULT '[]', style_json TEXT NOT NULL DEFAULT '{}', assets_json TEXT NOT NULL DEFAULT '[]',
        slides_json TEXT NOT NULL DEFAULT '[]', export_uris_json TEXT NOT NULL DEFAULT '{}', error TEXT,
        version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX presentations_project_idx ON presentations(project_id, updated_at DESC, id);
    `,
  },
  {
    version: 5,
    sql: `
      CREATE TABLE project_preferences (
        project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        settings_json TEXT NOT NULL DEFAULT '{}',
        last_opened_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX project_preferences_recent_idx ON project_preferences(last_opened_at DESC, project_id);
      ALTER TABLE runs ADD COLUMN inputs_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE runs ADD COLUMN timeout_at TEXT;
      ALTER TABLE publications ADD COLUMN reproduction_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL;
      ALTER TABLE publications ADD COLUMN reproduced_at TEXT;
    `,
  },
  {
    version: 6,
    sql: `
      ALTER TABLE presentations ADD COLUMN artifacts_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE presentations ADD COLUMN quality_json TEXT;
    `,
  },
  {
    version: 7,
    sql: `
      ALTER TABLE presentations ADD COLUMN generation_json TEXT;
      ALTER TABLE presentations ADD COLUMN revisions_json TEXT NOT NULL DEFAULT '[]';
    `,
  },
] as const

export class ResearchStore {
  private readonly database: DatabaseSync
  private transactionDepth = 0

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.database = new DatabaseSync(path)
    this.database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    this.migrate()
  }

  close(): void {
    this.database.close()
  }

  schemaVersion(): number {
    const row = this.database.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as { version: number }
    return row.version
  }

  createProject(input: CreateProjectInput): ProjectRecord {
    const name = input.name.trim()
    if (name.length === 0) throw new Error('Project name is required.')
    const rootPath = input.rootPath.trim()
    if (rootPath.length === 0) throw new Error('Project root path is required.')
    const now = new Date().toISOString()
    const record: ProjectRecord = {
      id: randomUUID(),
      name,
      rootPath,
      description: input.description?.trim() ?? '',
      createdAt: now,
      updatedAt: now,
    }
    this.database.prepare(`
      INSERT INTO projects (id, name, root_path, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(record.id, record.name, record.rootPath, record.description, record.createdAt, record.updatedAt)
    return record
  }

  listProjects(): ProjectRecord[] {
    const rows = this.database.prepare(`
      SELECT id, name, root_path, description, created_at, updated_at
      FROM projects ORDER BY updated_at DESC, id
    `).all() as Array<Record<string, string>>
    return rows.map(projectFromRow)
  }

  getProject(id: string): ProjectRecord | undefined {
    const row = this.database.prepare('SELECT id, name, root_path, description, created_at, updated_at FROM projects WHERE id = ?').get(id) as Record<string, string> | undefined
    return row === undefined ? undefined : projectFromRow(row)
  }

  updateProject(id: string, input: UpdateProjectInput): ProjectRecord {
    const current = this.requireProject(id)
    const updated: ProjectRecord = {
      ...current,
      name: input.name === undefined ? current.name : nonEmptyString(input.name, 'Project name'),
      rootPath: input.rootPath === undefined ? current.rootPath : nonEmptyString(input.rootPath, 'Project root path'),
      description: input.description === undefined ? current.description : input.description.trim(),
      updatedAt: new Date().toISOString(),
    }
    this.database.prepare('UPDATE projects SET name = ?, root_path = ?, description = ?, updated_at = ? WHERE id = ?')
      .run(updated.name, updated.rootPath, updated.description, updated.updatedAt, updated.id)
    return updated
  }

  openProject(id: string): ProjectRecord {
    const project = this.requireProject(id)
    const latest = this.database.prepare('SELECT MAX(last_opened_at) AS value FROM project_preferences').get() as { value: string | null }
    const now = new Date(Math.max(Date.now(), latest.value === null ? 0 : Date.parse(latest.value) + 1)).toISOString()
    this.database.prepare(`
      INSERT INTO project_preferences (project_id, settings_json, last_opened_at, updated_at)
      VALUES (?, '{}', ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET last_opened_at = excluded.last_opened_at, updated_at = excluded.updated_at
    `).run(project.id, now, now)
    return project
  }

  listRecentProjects(limit = 10): ProjectRecord[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Recent project limit must be between 1 and 100.')
    return (this.database.prepare(`
      SELECT p.id, p.name, p.root_path, p.description, p.created_at, p.updated_at
      FROM project_preferences pref JOIN projects p ON p.id = pref.project_id
      WHERE pref.last_opened_at IS NOT NULL
      ORDER BY pref.last_opened_at DESC, p.id LIMIT ?
    `).all(limit) as Array<Record<string, string>>).map(projectFromRow)
  }

  getProjectPreferences(projectId: string): ProjectPreferencesRecord {
    this.requireProject(projectId)
    const row = this.database.prepare('SELECT * FROM project_preferences WHERE project_id = ?').get(projectId) as Record<string, unknown> | undefined
    if (row === undefined) return { projectId, settings: {}, updatedAt: '' }
    return projectPreferencesFromRow(row)
  }

  updateProjectSettings(projectId: string, settings: JsonObject): ProjectPreferencesRecord {
    this.requireProject(projectId)
    const normalized = jsonObject(settings, 'Project settings')
    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO project_preferences (project_id, settings_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at
    `).run(projectId, JSON.stringify(normalized), now)
    return this.getProjectPreferences(projectId)
  }

  createExecutionContext(input: CreateExecutionContextInput): ExecutionContextRecord {
    const name = nonEmptyString(input.name, 'Execution context name')
    const config = jsonObject(input.config ?? {}, 'Execution context config')
    validateExecutionContextConfig(input.kind, config)
    const record = this.newVersioned(input.projectId, name, { kind: input.kind, config })
    return this.withTransaction(() => {
      this.insertNode(record.id, record.projectId, 'execution-context')
      this.database.prepare('INSERT INTO execution_contexts (id, project_id, name, kind, config_json, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(record.id, record.projectId, record.name, record.kind, JSON.stringify(record.config), record.version, record.createdAt, record.updatedAt)
      this.audit(record.projectId, record.id, 'execution-context.created', { kind: record.kind })
      return record
    })
  }

  listExecutionContexts(projectId: string): ExecutionContextRecord[] {
    this.requireProject(projectId)
    return (this.database.prepare('SELECT * FROM execution_contexts WHERE project_id = ? ORDER BY updated_at DESC, id').all(projectId) as Array<Record<string, unknown>>)
      .map(row => ({ ...versionedRow(row), kind: String(row.kind) as ExecutionContextRecord['kind'], config: jsonObject(jsonValue(row.config_json, 'Execution context config'), 'Execution context config') }))
  }

  getExecutionContext(id: string): ExecutionContextRecord | undefined {
    const row = this.database.prepare('SELECT * FROM execution_contexts WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row === undefined ? undefined : executionContextFromRow(row)
  }

  updateExecutionContext(id: string, changes: UpdateExecutionContextInput): ExecutionContextRecord {
    const current = this.getExecutionContext(id)
    if (current === undefined) throw new Error(`Execution context was not found: ${id}`)
    const updated: ExecutionContextRecord = {
      ...current,
      name: changes.name === undefined ? current.name : nonEmptyString(changes.name, 'Execution context name'),
      kind: changes.kind ?? current.kind,
      config: changes.config === undefined ? current.config : jsonObject(changes.config, 'Execution context config'),
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    }
    validateExecutionContextConfig(updated.kind, updated.config)
    this.withTransaction(() => {
      this.database.prepare('UPDATE execution_contexts SET name = ?, kind = ?, config_json = ?, version = ?, updated_at = ? WHERE id = ?')
        .run(updated.name, updated.kind, JSON.stringify(updated.config), updated.version, updated.updatedAt, updated.id)
      this.audit(updated.projectId, updated.id, 'execution-context.updated', { kind: updated.kind, version: updated.version })
    })
    return updated
  }

  deleteExecutionContext(id: string): void {
    const current = this.getExecutionContext(id)
    if (current === undefined) throw new Error(`Execution context was not found: ${id}`)
    this.withTransaction(() => {
      this.database.prepare('DELETE FROM research_nodes WHERE id = ?').run(id)
      this.audit(current.projectId, undefined, 'execution-context.deleted', { id })
    })
  }

  createDataAsset(input: CreateDataAssetInput): DataAssetRecord {
    const name = nonEmptyString(input.name, 'Data asset name')
    const uri = nonEmptyString(input.uri, 'Data asset URI')
    const checksum = optionalString(input.checksum)
    const algorithm = input.checksumAlgorithm
    if ((checksum === undefined) !== (algorithm === undefined)) throw new Error('Data asset checksum and algorithm must be provided together.')
    if (checksum !== undefined && !/^[a-fA-F0-9]+$/.test(checksum)) throw new Error('Data asset checksum must be hexadecimal.')
    const record = this.newVersioned(input.projectId, name, {
      uri, location: input.location, mediaType: input.mediaType.trim(),
      ...(input.byteSize === undefined ? {} : { byteSize: nonNegativeInteger(input.byteSize, 'Data asset byteSize') }),
      ...(algorithm === undefined ? {} : { checksumAlgorithm: algorithm }),
      ...(checksum === undefined ? {} : { checksum }),
      provenance: jsonObject(input.provenance ?? {}, 'Data asset provenance'),
    })
    return this.withTransaction(() => {
      this.insertNode(record.id, record.projectId, 'data-asset')
      this.database.prepare(`INSERT INTO data_assets
        (id, project_id, name, uri, location, media_type, byte_size, checksum_algorithm, checksum, provenance_json, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(record.id, record.projectId, record.name, record.uri, record.location, record.mediaType, record.byteSize ?? null,
          record.checksumAlgorithm ?? null, record.checksum ?? null, JSON.stringify(record.provenance), record.version, record.createdAt, record.updatedAt)
      this.audit(record.projectId, record.id, 'data-asset.created', { uri: record.uri })
      return record
    })
  }

  listDataAssets(projectId: string): DataAssetRecord[] {
    this.requireProject(projectId)
    return (this.database.prepare('SELECT * FROM data_assets WHERE project_id = ? ORDER BY updated_at DESC, id').all(projectId) as Array<Record<string, unknown>>)
      .map(dataAssetFromRow)
  }

  createRun(input: CreateRunInput): RunRecord {
    const status = input.status ?? 'draft'
    const progress = input.progress ?? 0
    validateRunStatus(status)
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw new Error('Run progress must be between 0 and 1.')
    if (input.executionContextId !== undefined) this.requireProjectEntity(input.projectId, input.executionContextId, 'execution-context')
    const record = this.newVersioned(input.projectId, nonEmptyString(input.name, 'Run name'), {
      ...(input.executionContextId === undefined ? {} : { executionContextId: input.executionContextId }),
      status, command: input.command, workingDirectory: input.workingDirectory, progress,
      ...(input.pid === undefined ? {} : { pid: positiveInteger(input.pid, 'Run pid') }),
      ...(input.remotePid === undefined ? {} : { remotePid: nonEmptyString(input.remotePid, 'Run remotePid') }),
      ...(input.leaseOwner === undefined ? {} : { leaseOwner: nonEmptyString(input.leaseOwner, 'Run leaseOwner') }),
      ...(input.leaseExpiresAt === undefined ? {} : { leaseExpiresAt: isoDateString(input.leaseExpiresAt, 'Run leaseExpiresAt') }),
      ...(input.heartbeatAt === undefined ? {} : { heartbeatAt: isoDateString(input.heartbeatAt, 'Run heartbeatAt') }),
      ...(input.timeoutAt === undefined ? {} : { timeoutAt: isoDateString(input.timeoutAt, 'Run timeoutAt') }),
      ...(input.logUri === undefined ? {} : { logUri: nonEmptyString(input.logUri, 'Run logUri') }),
      inputs: runIoDeclarations(input.inputs ?? [], 'Run inputs'),
      outputs: runOutputs(input.outputs ?? []),
      ...(input.error === undefined ? {} : { error: input.error }),
    })
    return this.withTransaction(() => {
      this.insertNode(record.id, record.projectId, 'run')
      this.insertRun(record)
      this.audit(record.projectId, record.id, 'run.created', { status: record.status })
      return record
    })
  }

  updateRun(id: string, changes: UpdateRunChanges): RunRecord {
    const current = this.getRun(id)
    if (current === undefined) throw new Error(`Run was not found: ${id}`)
    const status = changes.status ?? current.status
    validateRunTransition(current.status, status)
    const progress = changes.progress ?? current.progress
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw new Error('Run progress must be between 0 and 1.')
    const updated: RunRecord = {
      ...current, ...changes, status, progress,
      inputs: changes.inputs === undefined ? current.inputs : runIoDeclarations(changes.inputs, 'Run inputs'),
      outputs: changes.outputs === undefined ? current.outputs : runOutputs(changes.outputs),
      version: current.version + 1, updatedAt: new Date().toISOString(),
    }
    this.withTransaction(() => {
      this.database.prepare(`UPDATE runs SET status=?, progress=?, pid=?, remote_pid=?, lease_owner=?, lease_expires_at=?, heartbeat_at=?, timeout_at=?, log_uri=?, inputs_json=?, outputs_json=?, error=?, version=?, updated_at=? WHERE id=?`)
        .run(updated.status, updated.progress, updated.pid ?? null, updated.remotePid ?? null, updated.leaseOwner ?? null,
          updated.leaseExpiresAt ?? null, updated.heartbeatAt ?? null, updated.timeoutAt ?? null, updated.logUri ?? null,
          JSON.stringify(updated.inputs), JSON.stringify(updated.outputs),
          updated.error ?? null, updated.version, updated.updatedAt, updated.id)
      this.audit(updated.projectId, updated.id, 'run.updated', { from: current.status, to: updated.status, version: updated.version })
    })
    return updated
  }

  renewRunLease(id: string, input: { leaseOwner: string; heartbeatAt: string; leaseExpiresAt: string; remotePid?: string }): RunRecord {
    const current = this.getRun(id)
    if (current === undefined) throw new Error(`Run was not found: ${id}`)
    const leaseOwner = nonEmptyString(input.leaseOwner, 'Run leaseOwner')
    const heartbeatAt = isoDateString(input.heartbeatAt, 'Run heartbeatAt')
    const leaseExpiresAt = isoDateString(input.leaseExpiresAt, 'Run leaseExpiresAt')
    const updated: RunRecord = {
      ...current,
      leaseOwner,
      heartbeatAt,
      leaseExpiresAt,
      ...(input.remotePid === undefined ? {} : { remotePid: nonEmptyString(input.remotePid, 'Run remotePid') }),
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    }
    this.database.prepare('UPDATE runs SET lease_owner = ?, heartbeat_at = ?, lease_expires_at = ?, remote_pid = ?, version = ?, updated_at = ? WHERE id = ?')
      .run(leaseOwner, heartbeatAt, leaseExpiresAt, updated.remotePid ?? null, updated.version, updated.updatedAt, updated.id)
    return updated
  }

  getRun(id: string): RunRecord | undefined {
    const row = this.database.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row === undefined ? undefined : runFromRow(row)
  }

  listRuns(projectId: string): RunRecord[] {
    this.requireProject(projectId)
    return (this.database.prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY updated_at DESC, id').all(projectId) as Array<Record<string, unknown>>).map(runFromRow)
  }

  createArtifact(input: CreateArtifactInput): ArtifactRecord {
    if (input.runId !== undefined) this.requireProjectEntity(input.projectId, input.runId, 'run')
    const record = this.newVersioned(input.projectId, nonEmptyString(input.name, 'Artifact name'), {
      ...(input.runId === undefined ? {} : { runId: input.runId }), uri: nonEmptyString(input.uri, 'Artifact URI'),
      mediaType: input.mediaType.trim(), ...(input.checksum === undefined ? {} : { checksum: nonEmptyString(input.checksum, 'Artifact checksum') }),
      metadata: jsonObject(input.metadata ?? {}, 'Artifact metadata'),
    })
    return this.withTransaction(() => {
      this.insertNode(record.id, record.projectId, 'artifact')
      this.database.prepare('INSERT INTO artifacts (id, project_id, run_id, name, uri, media_type, checksum, metadata_json, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(record.id, record.projectId, record.runId ?? null, record.name, record.uri, record.mediaType, record.checksum ?? null, JSON.stringify(record.metadata), record.version, record.createdAt, record.updatedAt)
      this.audit(record.projectId, record.id, 'artifact.created', { uri: record.uri })
      return record
    })
  }

  listArtifacts(projectId: string): ArtifactRecord[] {
    this.requireProject(projectId)
    return (this.database.prepare('SELECT * FROM artifacts WHERE project_id = ? ORDER BY updated_at DESC, id').all(projectId) as Array<Record<string, unknown>>).map(artifactFromRow)
  }

  createPaper(input: CreatePaperInput): PaperRecord {
    const record = this.newVersioned(input.projectId, nonEmptyString(input.title, 'Paper title'), {
      title: nonEmptyString(input.title, 'Paper title'), ...(input.doi === undefined ? {} : { doi: nonEmptyString(input.doi, 'Paper DOI') }),
      ...(input.uri === undefined ? {} : { uri: nonEmptyString(input.uri, 'Paper URI') }), citation: jsonObject(input.citation ?? {}, 'Paper citation'), notes: input.notes ?? '',
    })
    return this.withTransaction(() => {
      this.insertNode(record.id, record.projectId, 'paper')
      this.database.prepare('INSERT INTO papers (id, project_id, title, doi, uri, citation_json, notes, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(record.id, record.projectId, record.title, record.doi ?? null, record.uri ?? null, JSON.stringify(record.citation), record.notes, record.version, record.createdAt, record.updatedAt)
      this.audit(record.projectId, record.id, 'paper.created', {})
      return omitName(record)
    })
  }

  listPapers(projectId: string): PaperRecord[] {
    this.requireProject(projectId)
    return (this.database.prepare('SELECT * FROM papers WHERE project_id = ? ORDER BY updated_at DESC, id').all(projectId) as Array<Record<string, unknown>>).map(paperFromRow)
  }

  createDecision(input: CreateDecisionInput): DecisionRecord {
    const record = this.newVersioned(input.projectId, nonEmptyString(input.title, 'Decision title'), {
      title: nonEmptyString(input.title, 'Decision title'), rationale: input.rationale,
      status: input.status,
    })
    return this.withTransaction(() => {
      this.insertNode(record.id, record.projectId, 'decision')
      this.database.prepare('INSERT INTO decisions (id, project_id, title, rationale, status, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(record.id, record.projectId, record.title, record.rationale, record.status, record.version, record.createdAt, record.updatedAt)
      this.audit(record.projectId, record.id, 'decision.created', { status: record.status })
      return omitName(record)
    })
  }

  listDecisions(projectId: string): DecisionRecord[] {
    this.requireProject(projectId)
    return (this.database.prepare('SELECT * FROM decisions WHERE project_id = ? ORDER BY updated_at DESC, id').all(projectId) as Array<Record<string, unknown>>).map(decisionFromRow)
  }

  createResearchEdge(input: CreateResearchEdgeInput): ResearchEdgeRecord {
    this.requireProjectEntity(input.projectId, input.fromId)
    this.requireProjectEntity(input.projectId, input.toId)
    const record: ResearchEdgeRecord = { id: randomUUID(), projectId: input.projectId, fromId: input.fromId, toId: input.toId, relation: nonEmptyString(input.relation, 'Research relation'), metadata: jsonObject(input.metadata ?? {}, 'Research edge metadata'), createdAt: new Date().toISOString() }
    return this.withTransaction(() => {
      this.database.prepare('INSERT INTO research_edges (id, project_id, from_id, to_id, relation, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(record.id, record.projectId, record.fromId, record.toId, record.relation, JSON.stringify(record.metadata), record.createdAt)
      this.audit(record.projectId, undefined, 'research-edge.created', { fromId: record.fromId, toId: record.toId, relation: record.relation })
      return record
    })
  }

  listResearchEdges(projectId: string): ResearchEdgeRecord[] {
    this.requireProject(projectId)
    return (this.database.prepare('SELECT * FROM research_edges WHERE project_id = ? ORDER BY created_at, id').all(projectId) as Array<Record<string, unknown>>).map(edgeFromRow)
  }

  listAuditEvents(projectId: string): AuditEventRecord[] {
    this.requireProject(projectId)
    return (this.database.prepare('SELECT * FROM audit_events WHERE project_id = ? ORDER BY created_at, id').all(projectId) as Array<Record<string, unknown>>).map(auditFromRow)
  }

  /** Record a bounded, redacted runtime event from the DSH session bus. */
  recordAuditEvent(projectId: string, action: string, details: JsonObject, entityId?: string): AuditEventRecord {
    const project = this.requireProject(projectId)
    const safeAction = nonEmptyString(action, 'Audit action').slice(0, 120)
    const safeDetails = redactAuditDetails(details)
    const record: AuditEventRecord = {
      id: randomUUID(), projectId: project.id, action: safeAction,
      details: safeDetails, createdAt: new Date().toISOString(),
      ...(entityId === undefined ? {} : { entityId }),
    }
    this.database.prepare('INSERT INTO audit_events (id, project_id, entity_id, action, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(record.id, record.projectId, record.entityId ?? null, record.action, JSON.stringify(record.details), record.createdAt)
    return record
  }

  getAuditReport(projectId: string): AuditReport {
    const project = this.requireProject(projectId)
    const events = this.listAuditEvents(project.id)
    let previous = '0'.repeat(64)
    const audited = events.map(event => {
      const payload = JSON.stringify({ previous, id: event.id, projectId: event.projectId, entityId: event.entityId ?? null, action: event.action, details: event.details, createdAt: event.createdAt })
      const eventHash = createHash('sha256').update(payload).digest('hex')
      previous = eventHash
      return { ...event, eventHash }
    })
    const warnings: string[] = []
    if (events.length === 0) warnings.push('No audit events have been recorded for this project.')
    if (this.listRuns(project.id).some(run => run.status === 'succeeded' && run.outputs.length === 0)) warnings.push('A succeeded Run has no declared outputs.')
    if (this.listArtifacts(project.id).some(artifact => artifact.checksum === undefined || artifact.checksum === '')) warnings.push('At least one Artifact has no checksum.')
    return { projectId: project.id, generatedAt: new Date().toISOString(), eventCount: events.length, chainHash: previous, chainValid: true, events: audited, warnings }
  }

  exportAuditReport(projectId: string, format: 'json' | 'markdown'): string {
    const report = this.getAuditReport(projectId)
    if (format === 'json') return `${JSON.stringify(report, null, 2)}\n`
    const lines = [`# ZeroWall Science Audit Report`, '', `- Project: ${report.projectId}`, `- Generated: ${report.generatedAt}`, `- Events: ${report.eventCount}`, `- Chain: ${report.chainValid ? 'valid' : 'invalid'} (${report.chainHash})`, '', '## Warnings', ... (report.warnings.length === 0 ? ['- None'] : report.warnings.map(item => `- ${item}`)), '', '## Events']
    for (const event of report.events) lines.push(`- ${event.createdAt} \`${event.action}\` ${event.entityId === undefined ? '' : `(${event.entityId})`} — ${event.eventHash}`)
    return `${lines.join('\n')}\n`
  }

  createPublication(input: CreatePublicationInput): PublicationRecord {
    const now = new Date().toISOString()
    const record: PublicationRecord = { id: randomUUID(), projectId: this.requireProject(input.projectId).id, title: nonEmptyString(input.title, 'Publication title'), status: 'draft', manifest: jsonObject(input.manifest ?? {}, 'Publication manifest'), validation: {}, version: 1, createdAt: now, updatedAt: now }
    this.database.prepare('INSERT INTO publications (id, project_id, title, status, manifest_json, validation_json, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(record.id, record.projectId, record.title, record.status, JSON.stringify(record.manifest), '{}', record.version, record.createdAt, record.updatedAt)
    return record
  }

  listPublications(projectId: string): PublicationRecord[] {
    this.requireProject(projectId)
    return (this.database.prepare('SELECT * FROM publications WHERE project_id = ? ORDER BY updated_at DESC, id').all(projectId) as Array<Record<string, unknown>>).map(publicationFromRow)
  }

  getPublication(id: string): PublicationRecord | undefined {
    const row = this.database.prepare('SELECT * FROM publications WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row === undefined ? undefined : publicationFromRow(row)
  }

  startPublicationReproduction(id: string, runId: string): PublicationRecord {
    const current = this.requiredPublication(id)
    this.requireProjectEntity(current.projectId, runId, 'run')
    if (!['frozen', 'ready', 'failed'].includes(current.status)) throw new Error(`Publication cannot reproduce from ${current.status}.`)
    return this.updatePublication(current, { status: 'validating', reproductionRunId: runId, reproducedAt: null, validation: { reproduction: 'running' } })
  }

  finishPublicationReproduction(id: string, ok: boolean, details: JsonObject): PublicationRecord {
    const current = this.requiredPublication(id)
    if (current.reproductionRunId === undefined) throw new Error('Publication does not have a reproduction run.')
    return this.updatePublication(current, {
      status: ok ? 'ready' : 'failed',
      reproducedAt: new Date().toISOString(),
      validation: jsonObject(details, 'Publication reproduction details'),
    })
  }

  freezePublication(id: string): PublicationRecord {
    const current = this.requiredPublication(id)
    if (current.status !== 'draft' && current.status !== 'failed') throw new Error(`Publication cannot be frozen from ${current.status}.`)
    const snapshot = this.exportResearchSnapshot(current.projectId)
    return this.updatePublication(current, { status: 'frozen', frozenSnapshot: snapshot, validation: {} })
  }

  validatePublication(id: string): PublicationRecord {
    const current = this.requiredPublication(id)
    if (current.status !== 'frozen' && current.status !== 'failed') throw new Error(`Publication cannot be validated from ${current.status}.`)
    const snapshot = current.frozenSnapshot
    const checks = {
      hasFrozenSnapshot: snapshot !== undefined,
      hasArtifacts: Array.isArray(snapshot?.artifacts) && snapshot.artifacts.length > 0,
      hasRuns: Array.isArray(snapshot?.runs) && snapshot.runs.length > 0,
      terminalRuns: Array.isArray(snapshot?.runs) && snapshot.runs.every((run: unknown) => run !== null && typeof run === 'object' && !Array.isArray(run) && ['succeeded', 'failed', 'cancelled', 'timed_out'].includes(String((run as Record<string, unknown>).status))),
    }
    const ok = Object.values(checks).every(Boolean)
    return this.updatePublication(current, { status: ok ? 'ready' : 'failed', validation: { ok, checks, validatedAt: new Date().toISOString() } })
  }

  exportPublication(id: string, uri: string): PublicationRecord {
    const current = this.requiredPublication(id)
    if (current.status !== 'ready') throw new Error('Only a ready publication can be exported.')
    return this.updatePublication(current, { exportUri: nonEmptyString(uri, 'Publication export URI') })
  }

  createPresentation(input: CreatePresentationInput): PresentationRecord {
    const now = new Date().toISOString()
    const record: PresentationRecord = {
      id: randomUUID(), projectId: this.requireProject(input.projectId).id, title: nonEmptyString(input.title, 'Presentation title'), status: 'draft',
      outline: presentationOutline(input.outline ?? []), style: jsonObject(input.style ?? {}, 'Presentation style'),
      assets: presentationAssets(input.assets ?? []), slides: [], exportUris: {}, artifacts: [], version: 1, createdAt: now, updatedAt: now,
    }
    this.insertPresentation(record)
    return record
  }

  listPresentations(projectId: string): PresentationRecord[] {
    this.requireProject(projectId)
    return (this.database.prepare('SELECT * FROM presentations WHERE project_id = ? ORDER BY updated_at DESC, id').all(projectId) as Array<Record<string, unknown>>).map(presentationFromRow)
  }

  deletePresentation(id: string): void {
    this.requiredPresentation(id)
    this.database.prepare('DELETE FROM presentations WHERE id = ?').run(id)
  }

  getPresentation(id: string): PresentationRecord | undefined {
    const row = this.database.prepare('SELECT * FROM presentations WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row === undefined ? undefined : presentationFromRow(row)
  }

  updatePresentation(id: string, changes: UpdatePresentationChanges): PresentationRecord {
    const current = this.requiredPresentation(id)
    const status = changes.status ?? current.status
    validatePresentationTransition(current.status, status)
    const { quality: requestedQuality, ...restChanges } = changes
    const base: PresentationRecord = {
      ...current, ...restChanges, status,
      ...(changes.title === undefined ? {} : { title: nonEmptyString(changes.title, 'Presentation title') }),
      outline: changes.outline === undefined ? current.outline : presentationOutline(changes.outline),
      style: changes.style === undefined ? current.style : jsonObject(changes.style, 'Presentation style'),
      assets: changes.assets === undefined ? current.assets : presentationAssets(changes.assets),
      slides: changes.slides === undefined ? current.slides : presentationSlides(changes.slides),
      exportUris: changes.exportUris === undefined ? current.exportUris : stringRecord(changes.exportUris, 'Presentation export URIs'),
      artifacts: changes.artifacts === undefined ? current.artifacts : presentationArtifacts(changes.artifacts),
      version: current.version + 1, updatedAt: new Date().toISOString(),
    }
    const updated: PresentationRecord = requestedQuality === null
      ? (({ quality: _quality, ...withoutQuality }) => withoutQuality)(base)
      : {
          ...base,
          ...(requestedQuality === undefined
            ? (current.quality === undefined ? {} : { quality: current.quality })
            : { quality: presentationQuality(requestedQuality) }),
        }
    this.database.prepare(`UPDATE presentations SET title=?, status=?, outline_json=?, style_json=?, assets_json=?, slides_json=?, export_uris_json=?, artifacts_json=?, quality_json=?, generation_json=?, revisions_json=?, error=?, version=?, updated_at=? WHERE id=?`)
      .run(updated.title, updated.status, JSON.stringify(updated.outline), JSON.stringify(updated.style), JSON.stringify(updated.assets), JSON.stringify(updated.slides), JSON.stringify(updated.exportUris), JSON.stringify(updated.artifacts), updated.quality === undefined ? null : JSON.stringify(updated.quality), updated.generation === undefined ? null : JSON.stringify(updated.generation), JSON.stringify(updated.revisions ?? []), updated.error ?? null, updated.version, updated.updatedAt, updated.id)
    return updated
  }

  pausePresentation(id: string): PresentationRecord {
    const current = this.requiredPresentation(id)
    if (!['outlining', 'designing', 'generating'].includes(current.status)) throw new Error(`Presentation cannot be paused from ${current.status}.`)
    return this.updatePresentation(id, { status: 'paused' })
  }

  resumePresentation(id: string): PresentationRecord {
    const current = this.requiredPresentation(id)
    if (current.status !== 'paused') throw new Error('Only a paused presentation can resume.')
    const next = current.slides.length > 0 ? 'generating' : current.outline.length > 0 ? 'designing' : 'outlining'
    return this.updatePresentation(id, { status: next })
  }

  exportPresentation(id: string, format: 'pptx' | 'pdf', uri: string): PresentationRecord {
    const current = this.requiredPresentation(id)
    if (current.status !== 'ready') throw new Error('Only a ready presentation can be exported.')
    return this.updatePresentation(id, { exportUris: { ...current.exportUris, [format]: nonEmptyString(uri, 'Presentation export URI') } })
  }

  exportResearchSnapshot(projectId: string): ResearchProjectSnapshotV1 {
    const project = this.requireProject(projectId)
    return {
      format: 'zerowall-science-research-project', version: 1, exportedAt: new Date().toISOString(), project,
      executionContexts: this.listExecutionContexts(projectId), dataAssets: this.listDataAssets(projectId),
      runs: this.listRuns(projectId), artifacts: this.listArtifacts(projectId), papers: this.listPapers(projectId),
      decisions: this.listDecisions(projectId), edges: this.listResearchEdges(projectId), auditEvents: this.listAuditEvents(projectId),
    }
  }

  importResearchSnapshot(input: ResearchProjectSnapshotV1): ProjectRecord {
    validateResearchSnapshot(input)
    return this.withTransaction(() => {
      const project = this.createProject({ name: input.project.name, rootPath: input.project.rootPath, description: input.project.description })
      const ids = new Map<string, string>()
      for (const item of input.executionContexts) ids.set(item.id, this.createExecutionContext({ projectId: project.id, name: item.name, kind: item.kind, config: item.config }).id)
      for (const item of input.dataAssets) ids.set(item.id, this.createDataAsset({ ...item, projectId: project.id }).id)
      for (const item of input.runs) {
        const executionContextId = mapped(ids, item.executionContextId)
        ids.set(item.id, this.createRun({ ...item, projectId: project.id, ...(executionContextId === undefined ? {} : { executionContextId }) }).id)
      }
      for (const item of input.artifacts) {
        const runId = mapped(ids, item.runId)
        ids.set(item.id, this.createArtifact({ ...item, projectId: project.id, ...(runId === undefined ? {} : { runId }) }).id)
      }
      for (const item of input.papers) ids.set(item.id, this.createPaper({ ...item, projectId: project.id }).id)
      for (const item of input.decisions) ids.set(item.id, this.createDecision({ ...item, projectId: project.id }).id)
      for (const edge of input.edges) this.createResearchEdge({ projectId: project.id, fromId: mappedRequired(ids, edge.fromId), toId: mappedRequired(ids, edge.toId), relation: edge.relation, metadata: edge.metadata })
      this.audit(project.id, undefined, 'project.imported', { sourceProjectId: input.project.id })
      return project
    })
  }

  exportProjectBundle(id: string, sessionArchives: SessionArchiveV1[] = []): ProjectBundleV1 {
    const row = this.database.prepare(`
      SELECT id, name, root_path, description, created_at, updated_at
      FROM projects WHERE id = ?
    `).get(id) as Record<string, string> | undefined
    if (row === undefined) throw new Error(`Project was not found: ${id}`)
    const bundle: ProjectBundleV1 = {
      format: PROJECT_BUNDLE_FORMAT,
      version: PROJECT_BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      project: projectFromRow(row),
      sessionArchives,
    }
    return parseProjectBundle(bundle)
  }

  importProjectBundle(input: unknown): ImportedProjectBundle {
    const bundle = parseProjectBundle(input)
    const project = this.createProject({
      name: bundle.project.name,
      rootPath: bundle.project.rootPath,
      description: bundle.project.description,
    })
    return { project, sessionArchives: bundle.sessionArchives }
  }

  listMcpServers(): McpServerRecord[] {
    const rows = this.database.prepare('SELECT * FROM mcp_servers ORDER BY updated_at DESC, id').all() as Array<Record<string, unknown>>
    return rows.map(mcpServerFromRow)
  }

  getMcpServer(id: string): McpServerRecord | undefined {
    const row = this.database.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row === undefined ? undefined : mcpServerFromRow(row)
  }

  createMcpServer(input: CreateMcpServerInput): McpServerRecord {
    const normalized = normalizeMcpServer(input)
    const now = new Date().toISOString()
    const record: McpServerRecord = { id: randomUUID(), ...normalized, createdAt: now, updatedAt: now }
    this.database.prepare(`
      INSERT INTO mcp_servers (
        id, name, server_name, transport, enabled, command, args_json, cwd,
        env_refs_json, url, header_refs_json, tool_call_timeout_ms,
        fail_on_startup_error, reconnect_enabled, reconnect_initial_delay_ms,
        reconnect_max_delay_ms, reconnect_max_attempts, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.name, record.serverName, record.transport, record.enabled ? 1 : 0,
      record.command, JSON.stringify(record.args), record.cwd, JSON.stringify(record.envRefs),
      record.url, JSON.stringify(record.headerRefs), record.toolCallTimeoutMs,
      record.failOnStartupError ? 1 : 0, record.reconnect.enabled ? 1 : 0,
      record.reconnect.initialDelayMs, record.reconnect.maxDelayMs, record.reconnect.maxAttempts,
      record.createdAt, record.updatedAt,
    )
    return record
  }

  updateMcpServer(id: string, input: UpdateMcpServerInput): McpServerRecord {
    const current = this.getMcpServer(id)
    if (current === undefined) throw new Error(`MCP server was not found: ${id}`)
    const normalized = normalizeMcpServer({
      ...current,
      ...input,
      reconnect: { ...current.reconnect, ...input.reconnect },
    })
    const updatedAt = new Date().toISOString()
    this.database.prepare(`
      UPDATE mcp_servers SET
        name = ?, server_name = ?, transport = ?, enabled = ?, command = ?,
        args_json = ?, cwd = ?, env_refs_json = ?, url = ?, header_refs_json = ?,
        tool_call_timeout_ms = ?, fail_on_startup_error = ?, reconnect_enabled = ?,
        reconnect_initial_delay_ms = ?, reconnect_max_delay_ms = ?,
        reconnect_max_attempts = ?, updated_at = ?
      WHERE id = ?
    `).run(
      normalized.name, normalized.serverName, normalized.transport, normalized.enabled ? 1 : 0,
      normalized.command, JSON.stringify(normalized.args), normalized.cwd,
      JSON.stringify(normalized.envRefs), normalized.url, JSON.stringify(normalized.headerRefs),
      normalized.toolCallTimeoutMs, normalized.failOnStartupError ? 1 : 0,
      normalized.reconnect.enabled ? 1 : 0, normalized.reconnect.initialDelayMs,
      normalized.reconnect.maxDelayMs, normalized.reconnect.maxAttempts, updatedAt, id,
    )
    return { id, ...normalized, createdAt: current.createdAt, updatedAt }
  }

  deleteMcpServer(id: string): void {
    const result = this.database.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id)
    if (result.changes === 0) throw new Error(`MCP server was not found: ${id}`)
  }

  private withTransaction<T>(operation: () => T): T {
    if (this.transactionDepth > 0) return operation()
    this.database.exec('BEGIN IMMEDIATE')
    this.transactionDepth += 1
    try {
      const result = operation()
      this.database.exec('COMMIT')
      return result
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    } finally {
      this.transactionDepth -= 1
    }
  }

  private requireProject(id: string): ProjectRecord {
    const row = this.database.prepare('SELECT id, name, root_path, description, created_at, updated_at FROM projects WHERE id = ?').get(id) as Record<string, string> | undefined
    if (row === undefined) throw new Error(`Project was not found: ${id}`)
    return projectFromRow(row)
  }

  private requireProjectEntity(projectId: string, id: string, kind?: ResearchNodeKind): void {
    const row = this.database.prepare('SELECT kind FROM research_nodes WHERE project_id = ? AND id = ?').get(projectId, id) as { kind: ResearchNodeKind } | undefined
    if (row === undefined || (kind !== undefined && row.kind !== kind)) throw new Error(`Research entity does not belong to project: ${id}`)
  }

  private insertNode(id: string, projectId: string, kind: ResearchNodeKind): void {
    this.requireProject(projectId)
    this.database.prepare('INSERT INTO research_nodes (id, project_id, kind) VALUES (?, ?, ?)').run(id, projectId, kind)
  }

  private audit(projectId: string, entityId: string | undefined, action: string, details: JsonObject): void {
    this.database.prepare('INSERT INTO audit_events (id, project_id, entity_id, action, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), projectId, entityId ?? null, action, JSON.stringify(details), new Date().toISOString())
  }

  private newVersioned<T extends object>(projectId: string, name: string, values: T): T & {
    id: string; projectId: string; name: string; version: number; createdAt: string; updatedAt: string
  } {
    this.requireProject(projectId)
    const now = new Date().toISOString()
    return { id: randomUUID(), projectId, name, version: 1, createdAt: now, updatedAt: now, ...values }
  }

  private insertRun(record: RunRecord): void {
    this.database.prepare(`INSERT INTO runs
      (id, project_id, execution_context_id, name, status, command, working_directory, progress, pid, remote_pid,
       lease_owner, lease_expires_at, heartbeat_at, timeout_at, log_uri, inputs_json, outputs_json, error, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(record.id, record.projectId, record.executionContextId ?? null, record.name, record.status, record.command,
        record.workingDirectory, record.progress, record.pid ?? null, record.remotePid ?? null, record.leaseOwner ?? null,
        record.leaseExpiresAt ?? null, record.heartbeatAt ?? null, record.timeoutAt ?? null, record.logUri ?? null,
        JSON.stringify(record.inputs), JSON.stringify(record.outputs),
        record.error ?? null, record.version, record.createdAt, record.updatedAt)
  }

  private requiredPublication(id: string): PublicationRecord {
    const row = this.database.prepare('SELECT * FROM publications WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (row === undefined) throw new Error(`Publication was not found: ${id}`)
    return publicationFromRow(row)
  }

  private updatePublication(current: PublicationRecord, changes: Partial<Pick<PublicationRecord, 'status' | 'frozenSnapshot' | 'validation' | 'reproductionRunId' | 'exportUri'>> & { reproducedAt?: string | null }): PublicationRecord {
    const { reproducedAt, ...rest } = changes
    const updated: PublicationRecord = { ...current, ...rest, version: current.version + 1, updatedAt: new Date().toISOString() }
    if (reproducedAt === null) delete updated.reproducedAt
    else if (reproducedAt !== undefined) updated.reproducedAt = reproducedAt
    this.database.prepare('UPDATE publications SET status=?, frozen_snapshot_json=?, validation_json=?, reproduction_run_id=?, reproduced_at=?, export_uri=?, version=?, updated_at=? WHERE id=?')
      .run(updated.status, updated.frozenSnapshot === undefined ? null : JSON.stringify(updated.frozenSnapshot), JSON.stringify(updated.validation),
        updated.reproductionRunId ?? null, updated.reproducedAt ?? null, updated.exportUri ?? null, updated.version, updated.updatedAt, updated.id)
    return updated
  }

  private insertPresentation(record: PresentationRecord): void {
    this.database.prepare(`INSERT INTO presentations (id, project_id, title, status, outline_json, style_json, assets_json, slides_json, export_uris_json, artifacts_json, quality_json, generation_json, revisions_json, error, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(record.id, record.projectId, record.title, record.status, JSON.stringify(record.outline), JSON.stringify(record.style), JSON.stringify(record.assets), JSON.stringify(record.slides), JSON.stringify(record.exportUris), JSON.stringify(record.artifacts), record.quality === undefined ? null : JSON.stringify(record.quality), record.generation === undefined ? null : JSON.stringify(record.generation), JSON.stringify(record.revisions ?? []), record.error ?? null, record.version, record.createdAt, record.updatedAt)
  }

  private requiredPresentation(id: string): PresentationRecord {
    const row = this.database.prepare('SELECT * FROM presentations WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (row === undefined) throw new Error(`Presentation was not found: ${id}`)
    return presentationFromRow(row)
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        applied_at TEXT NOT NULL
      );
    `)
    const applied = new Set(
      (this.database.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map((row) => row.version),
    )
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue
      this.database.exec('BEGIN IMMEDIATE')
      try {
        this.database.exec(migration.sql)
        this.database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
          .run(migration.version, new Date().toISOString())
        this.database.exec('COMMIT')
      } catch (error) {
        this.database.exec('ROLLBACK')
        throw error
      }
    }
  }
}

export function parseProjectBundle(input: unknown): ProjectBundleV1 {
  const bundle = record(input, 'Project bundle')
  if (bundle.format !== PROJECT_BUNDLE_FORMAT) throw new Error('Unsupported project bundle format.')
  if (bundle.version !== PROJECT_BUNDLE_VERSION) throw new Error(`Unsupported project bundle version: ${String(bundle.version)}`)
  exactKeys(bundle, ['format', 'version', 'exportedAt', 'project', 'sessionArchives'], 'Project bundle')
  const project = record(bundle.project, 'Project bundle project')
  exactKeys(project, ['id', 'name', 'rootPath', 'description', 'createdAt', 'updatedAt'], 'Project bundle project')
  const parsed: ProjectBundleV1 = {
    format: PROJECT_BUNDLE_FORMAT,
    version: PROJECT_BUNDLE_VERSION,
    exportedAt: isoDateString(bundle.exportedAt, 'Project bundle exportedAt'),
    project: {
      id: nonEmptyString(project.id, 'Project bundle project id'),
      name: nonEmptyString(project.name, 'Project bundle project name'),
      rootPath: nonEmptyString(project.rootPath, 'Project bundle project rootPath'),
      description: stringValue(project.description, 'Project bundle project description'),
      createdAt: isoDateString(project.createdAt, 'Project bundle project createdAt'),
      updatedAt: isoDateString(project.updatedAt, 'Project bundle project updatedAt'),
    },
    sessionArchives: sessionArchiveArray(bundle.sessionArchives),
  }
  const sessionIds = new Set(parsed.sessionArchives.map((archive) => archive.sessionId))
  if (sessionIds.size !== parsed.sessionArchives.length) throw new Error('Project bundle sessionArchives contain duplicate session ids.')
  for (const archive of parsed.sessionArchives) {
    const header = parseSessionArchiveHeader(archive.content)
    if (header.cwd !== parsed.project.rootPath) throw new Error('Project bundle session archive belongs to a different project root.')
    if (header.parentSession !== undefined && !sessionIds.has(header.parentSession)) {
      throw new Error('Project bundle session archive references a parent outside the bundle.')
    }
  }
  return parsed
}

export function createSessionArchive(content: string): SessionArchiveV1 {
  const header = parseSessionArchiveHeader(content)
  return {
    format: SESSION_ARCHIVE_FORMAT,
    version: SESSION_ARCHIVE_VERSION,
    sessionId: header.id,
    sha256: sessionArchiveDigest(content),
    content,
  }
}

export function parseSessionArchiveHeader(content: string): SessionArchiveHeader {
  if (typeof content !== 'string') throw new Error('Session archive content must be a string.')
  const byteLength = Buffer.byteLength(content, 'utf8')
  if (byteLength === 0 || byteLength > MAX_SESSION_ARCHIVE_BYTES) {
    throw new Error(`Session archive content must be between 1 and ${MAX_SESSION_ARCHIVE_BYTES} bytes.`)
  }
  if (content.includes('\0')) throw new Error('Session archive content must not contain NUL bytes.')
  const newline = content.indexOf('\n')
  if (newline <= 0 || !content.endsWith('\n')) throw new Error('Session archive content must be newline-terminated JSONL.')
  let parsed: unknown
  try { parsed = JSON.parse(content.slice(0, newline)) } catch { throw new Error('Session archive header must be valid JSON.') }
  const header = record(parsed, 'Session archive header')
  const allowed = ['type', 'version', 'id', 'createdAt', 'cwd', 'parentSession', 'seedLength', 'origin', 'delegationDepth', 'agentPreset']
  if (Object.keys(header).some((key) => !allowed.includes(key))) throw new Error('Session archive header contains unexpected fields.')
  if (header.type !== 'session') throw new Error('Session archive header type must be session.')
  if (header.version !== DSH_SESSION_FORMAT_VERSION) throw new Error(`Unsupported DSH session format version: ${String(header.version)}`)
  const result: SessionArchiveHeader = {
    version: DSH_SESSION_FORMAT_VERSION,
    id: nonEmptyString(header.id, 'Session archive id'),
    createdAt: nonNegativeInteger(header.createdAt, 'Session archive createdAt'),
    delegationDepth: nonNegativeInteger(header.delegationDepth, 'Session archive delegationDepth'),
  }
  if (header.cwd !== undefined) result.cwd = nonEmptyString(header.cwd, 'Session archive cwd')
  if (header.parentSession !== undefined) result.parentSession = nonEmptyString(header.parentSession, 'Session archive parentSession')
  if (header.seedLength !== undefined) result.seedLength = nonNegativeInteger(header.seedLength, 'Session archive seedLength')
  if (header.origin !== undefined) {
    if (header.origin !== 'subagent') throw new Error('Session archive origin is invalid.')
    result.origin = 'subagent'
  }
  if (header.agentPreset !== undefined) result.agentPreset = nonEmptyString(header.agentPreset, 'Session archive agentPreset')
  return result
}

function sessionArchiveArray(value: unknown): SessionArchiveV1[] {
  if (!Array.isArray(value)) throw new Error('Project bundle sessionArchives must be an array.')
  return value.map((item, index) => {
    const archive = record(item, `Project bundle sessionArchives[${index}]`)
    exactKeys(archive, ['format', 'version', 'sessionId', 'sha256', 'content'], `Project bundle sessionArchives[${index}]`)
    if (archive.format !== SESSION_ARCHIVE_FORMAT) throw new Error('Unsupported session archive format.')
    if (archive.version !== SESSION_ARCHIVE_VERSION) throw new Error(`Unsupported session archive version: ${String(archive.version)}`)
    const content = stringValue(archive.content, 'Session archive content')
    const header = parseSessionArchiveHeader(content)
    const sessionId = nonEmptyString(archive.sessionId, 'Session archive sessionId')
    if (sessionId !== header.id) throw new Error('Session archive id does not match its JSONL header.')
    const sha256 = nonEmptyString(archive.sha256, 'Session archive sha256')
    if (!/^[a-f0-9]{64}$/.test(sha256) || sha256 !== sessionArchiveDigest(content)) {
      throw new Error('Session archive sha256 does not match its content.')
    }
    return { format: SESSION_ARCHIVE_FORMAT, version: SESSION_ARCHIVE_VERSION, sessionId, sha256, content }
  })
}

function sessionArchiveDigest(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} contains unexpected or missing fields.`)
  }
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string.`)
  return value
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`)
  return value
}

function isoDateString(value: unknown, label: string): string {
  const parsed = nonEmptyString(value, label)
  const date = new Date(parsed)
  if (Number.isNaN(date.getTime()) || date.toISOString() !== parsed) throw new Error(`${label} must be an ISO timestamp.`)
  return parsed
}

function normalizeMcpServer(input: CreateMcpServerInput): Omit<McpServerRecord, 'id' | 'createdAt' | 'updatedAt'> {
  const name = nonEmptyString(input.name, 'MCP server name').trim()
  const serverName = nonEmptyString(input.serverName, 'MCP server namespace').trim()
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(serverName)) throw new Error('MCP server namespace must match [A-Za-z0-9_-]{1,32}.')
  if (input.transport !== 'stdio' && input.transport !== 'streamable-http') throw new Error('Unsupported MCP transport.')
  const command = input.command?.trim() ?? ''
  const url = input.url?.trim() ?? ''
  if (input.transport === 'stdio' && command === '') throw new Error('MCP stdio command is required.')
  if (input.transport === 'streamable-http') {
    let parsed: URL
    try { parsed = new URL(url) } catch { throw new Error('MCP HTTP URL is invalid.') }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('MCP HTTP URL must use http or https.')
    if (parsed.username !== '' || parsed.password !== '') throw new Error('MCP HTTP URL must not contain credentials.')
    if (parsed.search !== '' || parsed.hash !== '') throw new Error('MCP HTTP URL must not contain a query string or fragment.')
  }
  const toolCallTimeoutMs = positiveInteger(input.toolCallTimeoutMs ?? 60_000, 'MCP tool timeout')
  const reconnect = {
    enabled: input.reconnect?.enabled ?? true,
    initialDelayMs: positiveInteger(input.reconnect?.initialDelayMs ?? 500, 'MCP reconnect initial delay'),
    maxDelayMs: positiveInteger(input.reconnect?.maxDelayMs ?? 30_000, 'MCP reconnect maximum delay'),
    maxAttempts: positiveInteger(input.reconnect?.maxAttempts ?? 10, 'MCP reconnect attempts'),
  }
  if (reconnect.maxDelayMs < reconnect.initialDelayMs) throw new Error('MCP reconnect maximum delay must not be lower than the initial delay.')
  const stdio = input.transport === 'stdio'
  return {
    name,
    serverName,
    transport: input.transport,
    enabled: input.enabled ?? false,
    command: stdio ? command : '',
    args: stdio ? stringArray(input.args ?? [], 'MCP arguments') : [],
    cwd: stdio ? input.cwd?.trim() ?? '' : '',
    envRefs: stdio ? environmentReferences(input.envRefs ?? {}, 'MCP environment references', ENVIRONMENT_NAME) : {},
    url: stdio ? '' : url,
    headerRefs: stdio ? {} : environmentReferences(input.headerRefs ?? {}, 'MCP header references', HTTP_HEADER_NAME),
    toolCallTimeoutMs,
    failOnStartupError: input.failOnStartupError ?? false,
    reconnect,
  }
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer.`)
  return value
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    throw new Error(`${label} must be a non-negative integer.`)
  }
  return value
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error(`${label} must be a string array.`)
  return value
}

const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const HTTP_HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

function environmentReferences(
  value: unknown,
  label: string,
  targetPattern: RegExp,
): Record<string, string> {
  const refs = record(value, label)
  for (const [target, source] of Object.entries(refs)) {
    if (!targetPattern.test(target)) throw new Error(`${label} contains an invalid target name.`)
    if (typeof source !== 'string' || !ENVIRONMENT_NAME.test(source)) {
      throw new Error(`${label} values must be environment variable names.`)
    }
  }
  return refs as Record<string, string>
}

function jsonValue<T>(value: unknown, label: string): T {
  if (typeof value !== 'string') throw new Error(`${label} is not stored as JSON text.`)
  try { return JSON.parse(value) as T } catch { throw new Error(`${label} contains invalid JSON.`) }
}

function mcpServerFromRow(row: Record<string, unknown>): McpServerRecord {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    serverName: String(row.server_name ?? ''),
    transport: row.transport as McpTransport,
    enabled: row.enabled === 1,
    command: String(row.command ?? ''),
    args: jsonValue<string[]>(row.args_json, 'MCP arguments'),
    cwd: String(row.cwd ?? ''),
    envRefs: jsonValue<Record<string, string>>(row.env_refs_json, 'MCP environment references'),
    url: String(row.url ?? ''),
    headerRefs: jsonValue<Record<string, string>>(row.header_refs_json, 'MCP header references'),
    toolCallTimeoutMs: Number(row.tool_call_timeout_ms),
    failOnStartupError: row.fail_on_startup_error === 1,
    reconnect: {
      enabled: row.reconnect_enabled === 1,
      initialDelayMs: Number(row.reconnect_initial_delay_ms),
      maxDelayMs: Number(row.reconnect_max_delay_ms),
      maxAttempts: Number(row.reconnect_max_attempts),
    },
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

function projectFromRow(row: Record<string, string>): ProjectRecord {
  return {
    id: row.id ?? '',
    name: row.name ?? '',
    rootPath: row.root_path ?? '',
    description: row.description ?? '',
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
  }
}

function projectPreferencesFromRow(row: Record<string, unknown>): ProjectPreferencesRecord {
  return {
    projectId: String(row.project_id),
    settings: jsonObject(jsonValue(row.settings_json, 'Project settings'), 'Project settings'),
    ...(row.last_opened_at === null ? {} : { lastOpenedAt: String(row.last_opened_at) }),
    updatedAt: String(row.updated_at),
  }
}

function versionedRow(row: Record<string, unknown>): {
  id: string; projectId: string; name: string; version: number; createdAt: string; updatedAt: string
} {
  return {
    id: String(row.id), projectId: String(row.project_id), name: String(row.name), version: Number(row.version),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  }
}

function executionContextFromRow(row: Record<string, unknown>): ExecutionContextRecord {
  return {
    ...versionedRow(row),
    kind: String(row.kind) as ExecutionContextRecord['kind'],
    config: jsonObject(jsonValue(row.config_json, 'Execution context config'), 'Execution context config'),
  }
}

function dataAssetFromRow(row: Record<string, unknown>): DataAssetRecord {
  return {
    ...versionedRow(row), uri: String(row.uri), location: row.location as DataAssetRecord['location'], mediaType: String(row.media_type),
    ...(row.byte_size === null ? {} : { byteSize: Number(row.byte_size) }),
    ...(row.checksum_algorithm === null ? {} : { checksumAlgorithm: row.checksum_algorithm as 'sha256' | 'sha512' }),
    ...(row.checksum === null ? {} : { checksum: String(row.checksum) }),
    provenance: jsonObject(jsonValue(row.provenance_json, 'Data asset provenance'), 'Data asset provenance'),
  }
}

function runFromRow(row: Record<string, unknown>): RunRecord {
  return {
    ...versionedRow(row), ...(row.execution_context_id === null ? {} : { executionContextId: String(row.execution_context_id) }),
    status: row.status as RunStatus, command: String(row.command), workingDirectory: String(row.working_directory), progress: Number(row.progress),
    ...(row.pid === null ? {} : { pid: Number(row.pid) }), ...(row.remote_pid === null ? {} : { remotePid: String(row.remote_pid) }),
    ...(row.lease_owner === null ? {} : { leaseOwner: String(row.lease_owner) }),
    ...(row.lease_expires_at === null ? {} : { leaseExpiresAt: String(row.lease_expires_at) }),
    ...(row.heartbeat_at === null ? {} : { heartbeatAt: String(row.heartbeat_at) }),
    ...(row.timeout_at === null ? {} : { timeoutAt: String(row.timeout_at) }),
    ...(row.log_uri === null ? {} : { logUri: String(row.log_uri) }),
    inputs: runIoDeclarations(jsonValue(row.inputs_json, 'Run inputs'), 'Run inputs'), outputs: runOutputs(jsonValue(row.outputs_json, 'Run outputs')),
    ...(row.error === null ? {} : { error: String(row.error) }),
  }
}

function artifactFromRow(row: Record<string, unknown>): ArtifactRecord {
  return {
    ...versionedRow(row), ...(row.run_id === null ? {} : { runId: String(row.run_id) }), uri: String(row.uri),
    mediaType: String(row.media_type), ...(row.checksum === null ? {} : { checksum: String(row.checksum) }),
    metadata: jsonObject(jsonValue(row.metadata_json, 'Artifact metadata'), 'Artifact metadata'),
  }
}

function paperFromRow(row: Record<string, unknown>): PaperRecord {
  const base = versionedRow(row)
  return {
    id: base.id, projectId: base.projectId, title: String(row.title), ...(row.doi === null ? {} : { doi: String(row.doi) }),
    ...(row.uri === null ? {} : { uri: String(row.uri) }), citation: jsonObject(jsonValue(row.citation_json, 'Paper citation'), 'Paper citation'),
    notes: String(row.notes), version: base.version, createdAt: base.createdAt, updatedAt: base.updatedAt,
  }
}

function decisionFromRow(row: Record<string, unknown>): DecisionRecord {
  const base = versionedRow(row)
  return {
    id: base.id, projectId: base.projectId, title: String(row.title), rationale: String(row.rationale),
    status: row.status as DecisionRecord['status'], version: base.version, createdAt: base.createdAt, updatedAt: base.updatedAt,
  }
}

function edgeFromRow(row: Record<string, unknown>): ResearchEdgeRecord {
  return { id: String(row.id), projectId: String(row.project_id), fromId: String(row.from_id), toId: String(row.to_id), relation: String(row.relation), metadata: jsonObject(jsonValue(row.metadata_json, 'Research edge metadata'), 'Research edge metadata'), createdAt: String(row.created_at) }
}

function auditFromRow(row: Record<string, unknown>): AuditEventRecord {
  return { id: String(row.id), projectId: String(row.project_id), ...(row.entity_id === null ? {} : { entityId: String(row.entity_id) }), action: String(row.action), details: jsonObject(jsonValue(row.details_json, 'Audit details'), 'Audit details'), createdAt: String(row.created_at) }
}

function redactAuditDetails(value: JsonObject): JsonObject {
  const sensitive = /(?:token|secret|password|authorization|api[-_ ]?key|credential|private[-_ ]?key)/iu
  const walk = (input: JsonValue, depth: number): JsonValue => {
    if (depth > 3) return '[truncated]'
    if (Array.isArray(input)) return input.slice(0, 20).map(item => walk(item, depth + 1))
    if (input !== null && typeof input === 'object') {
      const output: JsonObject = {}
      for (const [key, child] of Object.entries(input)) {
        if (sensitive.test(key)) output[key] = '[redacted]'
        else output[key] = walk(child, depth + 1)
      }
      return output
    }
    return typeof input === 'string' && input.length > 1000 ? `${input.slice(0, 1000)}…[truncated]` : input
  }
  return walk(value, 0) as JsonObject
}

function publicationFromRow(row: Record<string, unknown>): PublicationRecord {
  return {
    id: String(row.id), projectId: String(row.project_id), title: String(row.title), status: row.status as PublicationRecord['status'],
    manifest: jsonObject(jsonValue(row.manifest_json, 'Publication manifest'), 'Publication manifest'),
    ...(row.frozen_snapshot_json === null ? {} : { frozenSnapshot: jsonValue<ResearchProjectSnapshotV1>(row.frozen_snapshot_json, 'Publication frozen snapshot') }),
    validation: jsonObject(jsonValue(row.validation_json, 'Publication validation'), 'Publication validation'),
    ...(row.reproduction_run_id === null ? {} : { reproductionRunId: String(row.reproduction_run_id) }),
    ...(row.reproduced_at === null ? {} : { reproducedAt: String(row.reproduced_at) }),
    ...(row.export_uri === null ? {} : { exportUri: String(row.export_uri) }), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  }
}

function presentationFromRow(row: Record<string, unknown>): PresentationRecord {
  return {
    id: String(row.id), projectId: String(row.project_id), title: String(row.title), status: row.status as PresentationRecord['status'],
    outline: presentationOutline(jsonValue(row.outline_json, 'Presentation outline')),
    style: jsonObject(jsonValue(row.style_json, 'Presentation style'), 'Presentation style'),
    assets: presentationAssets(jsonValue(row.assets_json, 'Presentation assets')),
    slides: presentationSlides(jsonValue(row.slides_json, 'Presentation slides')),
    exportUris: stringRecord(jsonValue(row.export_uris_json, 'Presentation export URIs'), 'Presentation export URIs'),
    artifacts: presentationArtifacts(row.artifacts_json === undefined || row.artifacts_json === null ? [] : jsonValue(row.artifacts_json, 'Presentation artifacts')),
    ...(row.quality_json === undefined || row.quality_json === null ? {} : { quality: presentationQuality(jsonValue(row.quality_json, 'Presentation quality')) }),
    ...(row.generation_json === undefined || row.generation_json === null ? {} : { generation: presentationGeneration(jsonValue(row.generation_json, 'Presentation generation')) }),
    revisions: presentationRevisions(row.revisions_json === undefined || row.revisions_json === null ? [] : jsonValue(row.revisions_json, 'Presentation revisions')),
    ...(row.error === null ? {} : { error: String(row.error) }), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  }
}

function jsonObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`)
  for (const [key, item] of Object.entries(value)) assertJsonValue(item, `${label}.${key}`)
  return value as JsonObject
}

function assertJsonValue(value: unknown, label: string): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (Array.isArray(value)) { value.forEach((item, index) => assertJsonValue(item, `${label}[${index}]`)); return }
  if (typeof value === 'object') { for (const [key, item] of Object.entries(value)) assertJsonValue(item, `${label}.${key}`); return }
  throw new Error(`${label} must contain only JSON values.`)
}

function optionalString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  return nonEmptyString(value, 'Value')
}

function validateExecutionContextConfig(kind: ExecutionContextRecord['kind'], config: JsonObject): void {
  const serialized = JSON.stringify(config).toLowerCase()
  if (/private[_-]?key(?:content|value|pem)|-----begin [a-z ]*private key-----/.test(serialized)) {
    throw new Error('Execution context must store only a private key path, never private key contents.')
  }
  if (kind === 'wsl' && typeof config.distro !== 'string') throw new Error('WSL execution context requires a distro.')
  if (kind === 'ssh' && (typeof config.host !== 'string' || !config.host.trim())) throw new Error('SSH execution context requires a host.')
}

function runOutputs(value: unknown): RunRecord['outputs'] {
  return runIoDeclarations(value, 'Run outputs')
}

function runIoDeclarations(value: unknown, label: string): RunRecord['outputs'] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`)
  return value.map((item) => {
    const output = record(item, 'Run output')
    const name = nonEmptyString(output.name, `${label} name`)
    const uri = nonEmptyString(output.uri, `${label} URI`)
    return { name, uri, ...(output.mediaType === undefined ? {} : { mediaType: nonEmptyString(output.mediaType, `${label} mediaType`) }) }
  })
}

function presentationOutline(value: unknown): PresentationRecord['outline'] {
  if (!Array.isArray(value)) throw new Error('Presentation outline must be an array.')
  return value.map(item => { const entry = record(item, 'Presentation outline item'); return { title: nonEmptyString(entry.title, 'Presentation outline title'), points: stringArray(entry.points, 'Presentation outline points'), ...(entry.referenceUris === undefined ? {} : { referenceUris: stringArray(entry.referenceUris, 'Presentation outline referenceUris') }) } })
}

function presentationAssets(value: unknown): PresentationRecord['assets'] {
  if (!Array.isArray(value)) throw new Error('Presentation assets must be an array.')
  return value.map(item => { const asset = record(item, 'Presentation asset'); return { uri: nonEmptyString(asset.uri, 'Presentation asset URI'), role: nonEmptyString(asset.role, 'Presentation asset role'), ...(asset.source === undefined ? {} : { source: nonEmptyString(asset.source, 'Presentation asset source') }) } })
}

function presentationSlides(value: unknown): PresentationRecord['slides'] {
  if (!Array.isArray(value)) throw new Error('Presentation slides must be an array.')
  return value.map(item => {
    const slide = record(item, 'Presentation slide')
    const visual = slide.visual === undefined ? undefined : presentationSlideVisual(slide.visual)
    return {
      id: nonEmptyString(slide.id, 'Presentation slide id'),
      title: nonEmptyString(slide.title, 'Presentation slide title'),
      body: stringValue(slide.body, 'Presentation slide body'),
      ...(slide.notes === undefined ? {} : { notes: stringValue(slide.notes, 'Presentation slide notes') }),
      assetUris: stringArray(slide.assetUris, 'Presentation slide assetUris'),
      ...(slide.visualUri === undefined ? {} : { visualUri: nonEmptyString(slide.visualUri, 'Presentation slide visualUri') }),
      ...(slide.visualPrompt === undefined ? {} : { visualPrompt: nonEmptyString(slide.visualPrompt, 'Presentation slide visualPrompt') }),
      ...(slide.referenceUris === undefined ? {} : { referenceUris: stringArray(slide.referenceUris, 'Presentation slide referenceUris') }),
      ...(visual === undefined ? {} : { visual }),
      visualStatus: presentationVisualStatus(slide.visualStatus, visual !== undefined || slide.visualUri !== undefined),
      ...(slide.visualError === undefined ? {} : { visualError: stringValue(slide.visualError, 'Presentation slide visualError') }),
      visualAttempt: presentationVisualAttempt(slide.visualAttempt),
      ...(slide.visualUpdatedAt === undefined ? {} : { visualUpdatedAt: nonEmptyString(slide.visualUpdatedAt, 'Presentation slide visualUpdatedAt') }),
    }
  })
}

function presentationVisualStatus(value: unknown, hasVisual: boolean): NonNullable<PresentationRecord['slides'][number]['visualStatus']> {
  if (value === undefined) return hasVisual ? 'ready' : 'pending'
  if (value !== 'pending' && value !== 'generating' && value !== 'ready' && value !== 'failed') {
    throw new Error('Unsupported presentation slide visualStatus.')
  }
  return value
}

function presentationVisualAttempt(value: unknown): number {
  if (value === undefined) return 0
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('Presentation slide visualAttempt must be a non-negative integer.')
  }
  return value
}

function presentationSlideVisual(value: unknown): NonNullable<PresentationRecord['slides'][number]['visual']> {
  const visual = record(value, 'Presentation slide visual')
  const model = record(visual.model, 'Presentation slide visual model')
  const source = visual.visualSource
  if (source !== 'generated' && source !== 'reference-edit') throw new Error('Unsupported presentation visual source.')
  if (visual.promptStrategy !== 'zerowall-full-slide-image') throw new Error('Unsupported presentation visual prompt strategy.')
  const attachment = visual.attachment === undefined ? undefined : record(visual.attachment, 'Presentation slide visual attachment')
  const attachmentMediaType = attachment === undefined ? undefined : nonEmptyString(attachment.mediaType, 'Presentation visual attachment mediaType')
  if (attachmentMediaType !== undefined && !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(attachmentMediaType)) {
    throw new Error('Unsupported presentation visual attachment media type.')
  }
  return {
    model: { providerId: nonEmptyString(model.providerId, 'Presentation visual providerId'), groupId: nonEmptyString(model.groupId, 'Presentation visual groupId'), modelId: nonEmptyString(model.modelId, 'Presentation visual modelId') },
    promptStrategy: 'zerowall-full-slide-image',
    visualSource: source,
    referenceUris: stringArray(visual.referenceUris, 'Presentation visual referenceUris'),
    generatedUri: nonEmptyString(visual.generatedUri, 'Presentation visual generatedUri'),
    checksum: nonEmptyString(visual.checksum, 'Presentation visual checksum'),
    ...(visual.requestedQuality === undefined ? {} : { requestedQuality: presentationImageQuality(visual.requestedQuality, 'requestedQuality') }),
    ...(visual.actualQuality === undefined ? {} : { actualQuality: presentationImageQuality(visual.actualQuality, 'actualQuality') }),
    ...(attachment === undefined ? {} : { attachment: { attachmentId: nonEmptyString(attachment.attachmentId, 'Presentation visual attachmentId'), mediaType: attachmentMediaType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif', bytes: Number(attachment.bytes), width: Number(attachment.width), height: Number(attachment.height), ...(attachment.name === undefined ? {} : { name: String(attachment.name) }) } }),
  }
}

function presentationImageQuality(value: unknown, label: string): 'auto' | 'low' | 'medium' | 'high' {
  if (value !== 'auto' && value !== 'low' && value !== 'medium' && value !== 'high') {
    throw new Error(`Unsupported presentation visual ${label}.`)
  }
  return value
}

function presentationArtifacts(value: unknown): PresentationRecord['artifacts'] {
  if (!Array.isArray(value)) throw new Error('Presentation artifacts must be an array.')
  const kinds = new Set(['outline', 'design-plan', 'html', 'pptx', 'pdf', 'preview', 'quality-report', 'visual-review'])
  return value.map((item) => {
    const artifact = record(item, 'Presentation artifact')
    const kind = nonEmptyString(artifact.kind, 'Presentation artifact kind')
    if (!kinds.has(kind)) throw new Error(`Unsupported presentation artifact kind: ${kind}`)
    return {
      kind: kind as PresentationRecord['artifacts'][number]['kind'],
      uri: nonEmptyString(artifact.uri, 'Presentation artifact URI'),
      mediaType: nonEmptyString(artifact.mediaType, 'Presentation artifact media type'),
      ...(artifact.checksum === undefined ? {} : { checksum: nonEmptyString(artifact.checksum, 'Presentation artifact checksum') }),
    }
  })
}

function presentationQuality(value: unknown): NonNullable<PresentationRecord['quality']> {
  const quality = record(value, 'Presentation quality')
  const state = (input: unknown, label: string): 'passed' | 'failed' | 'unverified' => {
    if (input !== 'passed' && input !== 'failed' && input !== 'unverified') throw new Error(`${label} must be passed, failed, or unverified.`)
    return input
  }
  return {
    structural: state(quality.structural, 'Presentation structural quality'),
    render: state(quality.render, 'Presentation render quality'),
    automaticVisual: state(quality.automaticVisual, 'Presentation automatic visual quality'),
    modelVisual: state(quality.modelVisual, 'Presentation model visual quality'),
    overall: state(quality.overall, 'Presentation overall quality'),
    warnings: stringArray(quality.warnings, 'Presentation quality warnings'),
  }
}

function presentationGeneration(value: unknown): NonNullable<PresentationRecord['generation']> {
  const item = record(value, 'Presentation generation')
  const stages = new Set(['outlining', 'designing', 'visual', 'html', 'pptx', 'rendering', 'quality', 'ready', 'failed', 'paused', 'cancelled'])
  const stage = item.stage
  if (typeof stage !== 'string' || !stages.has(stage)) throw new Error('Unsupported presentation generation stage.')
  return { id: nonEmptyString(item.id, 'Presentation generation id'), revision: Number(item.revision), stage: stage as NonNullable<PresentationRecord['generation']>['stage'], progress: Math.max(0, Math.min(1, Number(item.progress))), startedAt: nonEmptyString(item.startedAt, 'Presentation generation startedAt'), updatedAt: nonEmptyString(item.updatedAt, 'Presentation generation updatedAt'), ...(item.finishedAt === undefined ? {} : { finishedAt: String(item.finishedAt) }), ...(item.error === undefined ? {} : { error: String(item.error) }), ...(typeof item.resumeStage === 'string' && stages.has(item.resumeStage) ? { resumeStage: item.resumeStage as Exclude<NonNullable<PresentationRecord['generation']>['resumeStage'], undefined> } : {}) }
}

function presentationRevisions(value: unknown): NonNullable<PresentationRecord['revisions']> {
  if (!Array.isArray(value)) throw new Error('Presentation revisions must be an array.')
  return value.map(item => { const revision = record(item, 'Presentation revision'); return { id: nonEmptyString(revision.id, 'Presentation revision id'), revision: Number(revision.revision), createdAt: nonEmptyString(revision.createdAt, 'Presentation revision createdAt'), artifacts: presentationArtifacts(revision.artifacts ?? []), ...(revision.quality === undefined ? {} : { quality: presentationQuality(revision.quality) }) } })
}

function stringRecord(value: unknown, label: string): Record<string, string> {
  const output = jsonObject(value, label)
  if (Object.values(output).some(item => typeof item !== 'string')) throw new Error(`${label} values must be strings.`)
  return output as Record<string, string>
}

const PRESENTATION_TRANSITIONS: Record<PresentationRecord['status'], readonly PresentationRecord['status'][]> = {
  draft: ['draft', 'outlining', 'cancelled'], outlining: ['outlining', 'designing', 'paused', 'failed', 'cancelled'],
  designing: ['designing', 'generating', 'paused', 'failed', 'cancelled'], generating: ['generating', 'paused', 'ready', 'failed', 'cancelled'],
  paused: ['paused', 'outlining', 'designing', 'generating', 'cancelled'], ready: ['ready', 'outlining', 'generating'], failed: ['failed', 'outlining', 'designing', 'generating', 'cancelled'], cancelled: ['cancelled'],
}

function validatePresentationTransition(from: PresentationRecord['status'], to: PresentationRecord['status']): void {
  if (!PRESENTATION_TRANSITIONS[from].includes(to)) throw new Error(`Invalid presentation transition: ${from} -> ${to}`)
}

const RUN_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  draft: ['draft', 'submitted', 'cancelled'], submitted: ['submitted', 'running', 'cancelling', 'failed', 'cancelled', 'timed_out'],
  running: ['running', 'paused', 'cancelling', 'succeeded', 'failed', 'cancelled', 'timed_out'],
  paused: ['paused', 'running', 'cancelling', 'cancelled', 'timed_out'], cancelling: ['cancelling', 'cancelled', 'failed', 'timed_out'],
  succeeded: ['succeeded'], failed: ['failed'], cancelled: ['cancelled'], timed_out: ['timed_out'],
}

function validateRunStatus(status: RunStatus): void {
  if (!(status in RUN_TRANSITIONS)) throw new Error(`Invalid run status: ${String(status)}`)
}

function validateRunTransition(from: RunStatus, to: RunStatus): void {
  validateRunStatus(to)
  if (!RUN_TRANSITIONS[from].includes(to)) throw new Error(`Invalid run transition: ${from} -> ${to}`)
}

function omitName<T extends { name: string }>(value: T): Omit<T, 'name'> {
  const { name: _name, ...rest } = value
  return rest
}

function validateResearchSnapshot(input: ResearchProjectSnapshotV1): void {
  if (input?.format !== 'zerowall-science-research-project' || input.version !== 1) throw new Error('Unsupported research project snapshot.')
  const arrays = [input.executionContexts, input.dataAssets, input.runs, input.artifacts, input.papers, input.decisions, input.edges, input.auditEvents]
  if (arrays.some(value => !Array.isArray(value))) throw new Error('Research project snapshot is incomplete.')
  const ids = new Set<string>()
  for (const entity of arrays.slice(0, 6).flat() as Array<{ id: string; projectId: string }>) {
    if (entity.projectId !== input.project.id) throw new Error('Research snapshot contains a foreign project entity.')
    if (ids.has(entity.id)) throw new Error('Research snapshot contains duplicate entity ids.')
    ids.add(entity.id)
  }
  for (const edge of input.edges) if (!ids.has(edge.fromId) || !ids.has(edge.toId)) throw new Error('Research snapshot contains an orphan edge.')
}

function mapped(ids: Map<string, string>, id: string | undefined): string | undefined {
  return id === undefined ? undefined : mappedRequired(ids, id)
}

function mappedRequired(ids: Map<string, string>, id: string): string {
  const value = ids.get(id)
  if (value === undefined) throw new Error(`Research snapshot reference was not imported: ${id}`)
  return value
}
