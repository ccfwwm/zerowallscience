import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSessionArchive, ResearchStore } from '../src/index.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function databasePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'zerowall-research-'))
  roots.push(root)
  return join(root, 'zerowall-research.sqlite')
}

describe('ResearchStore', () => {
  it('applies migrations idempotently and persists projects across restart', () => {
    const path = databasePath()
    const first = new ResearchStore(path)
    expect(first.schemaVersion()).toBe(7)
    const created = first.createProject({ name: 'Genome Study', rootPath: 'C:/science/genome' })
    first.close()

    const reopened = new ResearchStore(path)
    expect(reopened.schemaVersion()).toBe(7)
    expect(reopened.listProjects()).toEqual([created])
    reopened.close()
  })

  it('rejects empty project names and roots', () => {
    const store = new ResearchStore(databasePath())
    expect(() => store.createProject({ name: ' ', rootPath: 'C:/science' })).toThrow('name')
    expect(() => store.createProject({ name: 'Study', rootPath: ' ' })).toThrow('root')
    store.close()
  })

  it('persists project updates, settings, and recent-open ordering outside exported bundles', () => {
    const path = databasePath()
    const store = new ResearchStore(path)
    const first = store.createProject({ name: 'First', rootPath: 'C:/science/first' })
    const second = store.createProject({ name: 'Second', rootPath: 'C:/science/second' })
    const updated = store.updateProject(first.id, { name: 'First revised', description: 'Local settings test' })
    expect(updated).toMatchObject({ name: 'First revised', description: 'Local settings test' })
    expect(store.updateProjectSettings(first.id, { defaultContextId: 'local', autosave: true }).settings).toEqual({ defaultContextId: 'local', autosave: true })
    store.openProject(first.id)
    store.openProject(second.id)
    expect(store.listRecentProjects()).toEqual([second, updated])
    expect(store.exportProjectBundle(first.id).project).toEqual(updated)
    expect(store.exportProjectBundle(first.id)).not.toHaveProperty('settings')
    store.close()

    const reopened = new ResearchStore(path)
    expect(reopened.getProjectPreferences(first.id)).toMatchObject({ settings: { defaultContextId: 'local', autosave: true } })
    expect(reopened.listRecentProjects()).toHaveLength(2)
    reopened.close()
  })

  it('round-trips the versioned 3.x project bundle with a new identity', () => {
    const store = new ResearchStore(databasePath())
    const original = store.createProject({ name: 'Cell Atlas', rootPath: 'C:/science/cells', description: 'Pilot' })
    const bundle = store.exportProjectBundle(original.id)
    expect(bundle).toMatchObject({ format: 'zerowall-science-project', version: 1, project: original, sessionArchives: [] })

    const imported = store.importProjectBundle(bundle)
    expect(imported.project).toMatchObject({ name: original.name, rootPath: original.rootPath, description: original.description })
    expect(imported.project.id).not.toBe(original.id)
    expect(imported.sessionArchives).toEqual([])
    expect(store.listProjects()).toHaveLength(2)
    store.close()
  })

  it('round-trips strict DSH JSONL session archives with integrity metadata', () => {
    const store = new ResearchStore(databasePath())
    const project = store.createProject({ name: 'Session Study', rootPath: 'C:/science/sessions' })
    const parent = createSessionArchive(sessionLog('session-parent', project.rootPath))
    const child = createSessionArchive(sessionLog('session-child', project.rootPath, 'session-parent'))
    const bundle = store.exportProjectBundle(project.id, [child, parent])
    expect(bundle.sessionArchives).toEqual([child, parent])

    const imported = store.importProjectBundle(bundle)
    expect(imported.sessionArchives).toEqual([child, parent])
    expect(imported.project.id).not.toBe(project.id)

    expect(() => store.importProjectBundle({
      ...bundle,
      sessionArchives: [{ ...parent, sha256: '0'.repeat(64) }],
    })).toThrow('sha256')
    expect(() => store.importProjectBundle({
      ...bundle,
      sessionArchives: [{ ...parent, sessionId: 'different' }],
    })).toThrow('does not match')
    expect(() => store.importProjectBundle({
      ...bundle,
      sessionArchives: [createSessionArchive(sessionLog('foreign', 'C:/other'))],
    })).toThrow('different project root')
    expect(() => store.importProjectBundle({
      ...bundle,
      sessionArchives: [createSessionArchive(sessionLog('orphan', project.rootPath, 'missing-parent'))],
    })).toThrow('parent outside')
    store.close()
  })

  it('rejects legacy, malformed, and future project bundles', () => {
    const store = new ResearchStore(databasePath())
    expect(() => store.importProjectBundle({ version: 2 })).toThrow('format')
    expect(() => store.importProjectBundle({ format: 'zerowall-science-project', version: 2 })).toThrow('version')
    expect(() => store.importProjectBundle({
      format: 'zerowall-science-project', version: 1, exportedAt: 'now', project: {}, sessionArchives: [],
    })).toThrow('unexpected or missing fields')
    const project = store.createProject({ name: 'Strict', rootPath: 'C:/science/strict' })
    const bundle = store.exportProjectBundle(project.id)
    expect(() => store.importProjectBundle({ ...bundle, legacyDatabase: true })).toThrow('unexpected or missing fields')
    expect(() => store.importProjectBundle({ ...bundle, exportedAt: 'now' })).toThrow('ISO timestamp')
    expect(() => store.importProjectBundle({ ...bundle, project: { ...bundle.project, legacyId: 42 } })).toThrow('unexpected or missing fields')
    store.close()
  })

  it('persists MCP metadata without storing credential values', () => {
    const path = databasePath()
    const store = new ResearchStore(path)
    const created = store.createMcpServer({
      name: 'Literature tools',
      serverName: 'literature',
      transport: 'stdio',
      command: 'node',
      args: ['server.mjs'],
      envRefs: { API_TOKEN: 'ZEROWALL_TEST_MCP_TOKEN' },
      enabled: true,
    })
    expect(created.envRefs).toEqual({ API_TOKEN: 'ZEROWALL_TEST_MCP_TOKEN' })
    expect(JSON.stringify(created)).not.toContain('secret-value')
    const updated = store.updateMcpServer(created.id, { enabled: false, reconnect: { maxAttempts: 3 } })
    expect(updated.enabled).toBe(false)
    expect(updated.reconnect.maxAttempts).toBe(3)
    store.close()

    const reopened = new ResearchStore(path)
    expect(reopened.listMcpServers()).toEqual([updated])
    reopened.deleteMcpServer(created.id)
    expect(reopened.listMcpServers()).toEqual([])
    reopened.close()
  })

  it('rejects invalid MCP transports, namespaces, URLs, and literal secret references', () => {
    const store = new ResearchStore(databasePath())
    expect(() => store.createMcpServer({ name: 'Bad', serverName: 'bad space', transport: 'stdio', command: 'node' })).toThrow('namespace')
    expect(() => store.createMcpServer({ name: 'Bad', serverName: 'bad', transport: 'streamable-http', url: 'file:///secret' })).toThrow('http or https')
    expect(() => store.createMcpServer({ name: 'Bad', serverName: 'bad', transport: 'streamable-http', url: 'https://user:pass@example.test/mcp' })).toThrow('credentials')
    expect(() => store.createMcpServer({ name: 'Bad', serverName: 'bad', transport: 'streamable-http', url: 'https://example.test/mcp?token=secret' })).toThrow('query string')
    expect(() => store.createMcpServer({
      name: 'Bad', serverName: 'bad', transport: 'stdio', command: 'node', envRefs: { API_TOKEN: 'literal secret' },
    })).toThrow('environment variable names')
    expect(() => store.createMcpServer({
      name: 'Bad', serverName: 'bad', transport: 'streamable-http', url: 'https://example.test/mcp',
      headerRefs: { 'Authorization\r\nX-Injected': 'MCP_TOKEN' },
    })).toThrow('invalid target')
    store.close()
  })

  it('clears fields owned by the inactive MCP transport', () => {
    const store = new ResearchStore(databasePath())
    const http = store.createMcpServer({
      name: 'Remote', serverName: 'remote', transport: 'streamable-http', url: 'https://example.test/mcp',
      command: 'should-not-persist', args: ['secret'], cwd: 'C:/secret', envRefs: { TOKEN: 'MCP_TOKEN' },
    })
    expect(http).toMatchObject({ command: '', args: [], cwd: '', envRefs: {} })
    const stdio = store.createMcpServer({
      name: 'Local', serverName: 'local', transport: 'stdio', command: 'node',
      url: 'https://example.test/ignored', headerRefs: { Authorization: 'MCP_AUTH' },
    })
    expect(stdio).toMatchObject({ url: '', headerRefs: {} })
    store.close()
  })

  it('persists the complete research graph and remaps references on import', () => {
    const store = new ResearchStore(databasePath())
    const project = store.createProject({ name: 'Protein Design', rootPath: 'C:/science/protein' })
    const context = store.createExecutionContext({ projectId: project.id, name: 'GPU host', kind: 'ssh', config: { host: 'gpu.example.test', user: 'research', privateKeyPath: 'C:/keys/gpu' } })
    const asset = store.createDataAsset({ projectId: project.id, name: 'Sequences', uri: 's3://bucket/sequences.fasta', location: 'object-storage', mediaType: 'text/x-fasta', checksumAlgorithm: 'sha256', checksum: 'a'.repeat(64) })
    const timeoutAt = new Date(Date.now() + 60_000).toISOString()
    const run = store.createRun({
      projectId: project.id, executionContextId: context.id, name: 'Fold', command: 'python fold.py', workingDirectory: '/work', status: 'submitted',
      inputs: [{ name: 'sequences', uri: asset.uri, mediaType: asset.mediaType }], timeoutAt,
    })
    const running = store.updateRun(run.id, { status: 'running', pid: 42, progress: 0.5, heartbeatAt: new Date().toISOString() })
    const succeeded = store.updateRun(run.id, { status: 'succeeded', progress: 1, outputs: [{ name: 'structure', uri: 'ssh://gpu/work/result.pdb', mediaType: 'chemical/x-pdb' }] })
    expect(running.version).toBe(2)
    expect(succeeded.version).toBe(3)
    expect(() => store.updateRun(run.id, { status: 'running' })).toThrow('Invalid run transition')
    const artifact = store.createArtifact({ projectId: project.id, runId: run.id, name: 'Predicted structure', uri: 'ssh://gpu/work/result.pdb', mediaType: 'chemical/x-pdb' })
    const paper = store.createPaper({ projectId: project.id, title: 'Reference method', doi: '10.1000/example' })
    const decision = store.createDecision({ projectId: project.id, title: 'Use best confidence model', rationale: 'Highest validation score', status: 'accepted' })
    store.createResearchEdge({ projectId: project.id, fromId: asset.id, toId: run.id, relation: 'input-to' })
    store.createResearchEdge({ projectId: project.id, fromId: run.id, toId: artifact.id, relation: 'produced' })
    store.createResearchEdge({ projectId: project.id, fromId: paper.id, toId: decision.id, relation: 'supports' })

    const snapshot = store.exportResearchSnapshot(project.id)
    expect(snapshot).toMatchObject({ format: 'zerowall-science-research-project', version: 1 })
    expect(snapshot.executionContexts).toHaveLength(1)
    expect(snapshot.dataAssets).toHaveLength(1)
    expect(snapshot.runs[0]).toMatchObject({ status: 'succeeded', version: 3 })
    expect(snapshot.runs[0]).toMatchObject({ inputs: [{ name: 'sequences', uri: asset.uri }], timeoutAt })
    expect(snapshot.artifacts).toHaveLength(1)
    expect(snapshot.papers).toHaveLength(1)
    expect(snapshot.decisions).toHaveLength(1)
    expect(snapshot.edges).toHaveLength(3)
    expect(snapshot.auditEvents.length).toBeGreaterThanOrEqual(10)

    const imported = store.importResearchSnapshot(snapshot)
    const importedSnapshot = store.exportResearchSnapshot(imported.id)
    expect(imported.id).not.toBe(project.id)
    expect(importedSnapshot.executionContexts[0]?.id).not.toBe(context.id)
    expect(importedSnapshot.runs[0]?.executionContextId).toBe(importedSnapshot.executionContexts[0]?.id)
    expect(importedSnapshot.runs[0]?.inputs).toEqual([{ name: 'sequences', uri: asset.uri, mediaType: asset.mediaType }])
    expect(importedSnapshot.artifacts[0]?.runId).toBe(importedSnapshot.runs[0]?.id)
    expect(importedSnapshot.edges).toHaveLength(3)
    store.close()
  })

  it('enforces project isolation, foreign keys, and secret-free execution contexts', () => {
    const store = new ResearchStore(databasePath())
    const first = store.createProject({ name: 'First', rootPath: 'C:/science/first' })
    const second = store.createProject({ name: 'Second', rootPath: 'C:/science/second' })
    const asset = store.createDataAsset({ projectId: first.id, name: 'Input', uri: 'file:///input.csv', location: 'local', mediaType: 'text/csv' })
    const decision = store.createDecision({ projectId: second.id, title: 'Other', rationale: '', status: 'proposed' })
    expect(() => store.createResearchEdge({ projectId: first.id, fromId: asset.id, toId: decision.id, relation: 'invalid' })).toThrow('does not belong')
    expect(() => store.createExecutionContext({ projectId: first.id, name: 'Unsafe', kind: 'ssh', config: { host: 'x', privateKeyContent: '-----BEGIN PRIVATE KEY-----' } })).toThrow('private key')
    expect(() => store.createDataAsset({ projectId: first.id, name: 'Bad checksum', uri: 'file:///x', location: 'local', mediaType: '', checksum: 'abc' })).toThrow('together')
    const context = store.createExecutionContext({ projectId: first.id, name: 'GPU', kind: 'ssh', config: { host: 'gpu.test' } })
    expect(store.updateExecutionContext(context.id, { name: 'GPU revised', config: { host: 'gpu2.test', privateKeyPath: 'C:/keys/gpu' } })).toMatchObject({ name: 'GPU revised', version: 2 })
    const run = store.createRun({ projectId: first.id, executionContextId: context.id, name: 'Detached context', command: 'true', workingDirectory: '.', status: 'draft' })
    store.deleteExecutionContext(context.id)
    expect(store.getExecutionContext(context.id)).toBeUndefined()
    expect(store.getRun(run.id)?.executionContextId).toBeUndefined()
    store.close()
  })

  it('persists resumable publication and presentation workflows', () => {
    const path = databasePath(); const store = new ResearchStore(path)
    const project = store.createProject({ name: 'Publication', rootPath: 'C:/science/publication' })
    const run = store.createRun({ projectId: project.id, name: 'Experiment', command: 'run', workingDirectory: '.', status: 'succeeded', progress: 1 })
    store.createArtifact({ projectId: project.id, runId: run.id, name: 'Figure', uri: 'file:///figure.png', mediaType: 'image/png' })
    const publication = store.createPublication({ projectId: project.id, title: 'Reproducible result', manifest: { license: 'CC-BY-4.0' } })
    expect(store.freezePublication(publication.id).status).toBe('frozen')
    const reproduction = store.createRun({ projectId: project.id, name: 'Reproduce', command: 'run', workingDirectory: '.', status: 'running' })
    expect(store.startPublicationReproduction(publication.id, reproduction.id)).toMatchObject({ status: 'validating', reproductionRunId: reproduction.id })
    expect(store.finishPublicationReproduction(publication.id, false, { reproduction: 'failed' })).toMatchObject({ status: 'failed', reproducedAt: expect.any(String) })
    store.updateRun(reproduction.id, { status: 'succeeded', progress: 1 })
    expect(store.freezePublication(publication.id).status).toBe('frozen')
    const validated = store.validatePublication(publication.id)
    expect(validated).toMatchObject({ status: 'ready', validation: { ok: true } })
    expect(store.exportPublication(publication.id, 'file:///publication.zip').exportUri).toBe('file:///publication.zip')

    const presentation = store.createPresentation({ projectId: project.id, title: 'Results', outline: [{ title: 'Finding', points: ['Evidence'] }], style: { tone: 'academic' } })
    const designing = store.updatePresentation(presentation.id, { status: 'outlining' })
    store.updatePresentation(designing.id, { status: 'designing' })
    const generating = store.updatePresentation(designing.id, { status: 'generating' })
    expect(store.pausePresentation(generating.id).status).toBe('paused')
    expect(store.resumePresentation(generating.id).status).toBe('designing')
    store.updatePresentation(generating.id, { status: 'generating', slides: [{
      id: 'slide-1', title: 'Finding', body: 'Evidence', assetUris: ['file:///figure.png'],
      visualStatus: 'ready', visualAttempt: 2, visualUpdatedAt: '2026-08-28T00:00:00.000Z',
      visual: {
        model: { providerId: 'provider-1', groupId: 'group-1', modelId: 'gpt-image-2' },
        promptStrategy: 'zerowall-full-slide-image', visualSource: 'generated', referenceUris: [],
        generatedUri: 'file:///slide-1.png', checksum: 'sha256:slide-1',
        requestedQuality: 'medium', actualQuality: 'medium',
        attachment: { attachmentId: 'sha256:preview-1', mediaType: 'image/jpeg', bytes: 123, width: 1536, height: 1024, name: 'slide-1.png' },
      },
    }] })
    const ready = store.updatePresentation(generating.id, {
      status: 'ready',
      artifacts: [{ kind: 'preview', uri: 'file:///results-preview.png', mediaType: 'image/png', checksum: 'sha256:preview' }],
      quality: {
        structural: 'passed', render: 'passed', automaticVisual: 'unverified',
        modelVisual: 'unverified', overall: 'unverified', warnings: ['Model review is pending.'],
      },
    })
    expect(store.exportPresentation(ready.id, 'pptx', 'file:///results.pptx').exportUris.pptx).toBe('file:///results.pptx')
    store.close()

    const reopened = new ResearchStore(path)
    expect(reopened.listPublications(project.id)[0]).toMatchObject({ status: 'ready', exportUri: 'file:///publication.zip' })
    expect(reopened.listPresentations(project.id)[0]).toMatchObject({
      status: 'ready', slides: [{ id: 'slide-1', visualStatus: 'ready', visualAttempt: 2, visualUpdatedAt: '2026-08-28T00:00:00.000Z', visual: { requestedQuality: 'medium', actualQuality: 'medium', attachment: { mediaType: 'image/jpeg' } } }],
      artifacts: [{ kind: 'preview', checksum: 'sha256:preview' }],
      quality: { structural: 'passed', overall: 'unverified', warnings: ['Model review is pending.'] },
    })
    reopened.close()
  })

  it('rejects invalid persisted presentation visual state', () => {
    const store = new ResearchStore(databasePath())
    const project = store.createProject({ name: 'Slides', rootPath: 'C:/science/slides' })
    const presentation = store.createPresentation({ projectId: project.id, title: 'Invalid state' })
    const base = { id: 'slide-1', title: 'Slide', body: '', assetUris: [] }
    expect(() => store.updatePresentation(presentation.id, { slides: [{ ...base, visualStatus: 'unknown' }] as never })).toThrow('visualStatus')
    expect(() => store.updatePresentation(presentation.id, { slides: [{ ...base, visualAttempt: -1 }] as never })).toThrow('non-negative integer')
    store.close()
  })

  it('exports a deterministic audit report with evidence warnings', () => {
    const store = new ResearchStore(databasePath())
    const project = store.createProject({ name: 'Audit', rootPath: 'C:/science/audit' })
    const run = store.createRun({ projectId: project.id, name: 'Finished without output', command: 'run', workingDirectory: '.', status: 'succeeded' })
    store.createArtifact({ projectId: project.id, runId: run.id, name: 'Unhashed', uri: 'file:///result.dat', mediaType: 'application/octet-stream' })
    const report = store.getAuditReport(project.id)
    expect(report.chainValid).toBe(true)
    expect(report.eventCount).toBeGreaterThan(0)
    expect(report.events.every(event => /^[a-f0-9]{64}$/u.test(event.eventHash))).toBe(true)
    expect(report.warnings).toEqual(expect.arrayContaining(['A succeeded Run has no declared outputs.', 'At least one Artifact has no checksum.']))
    expect(store.exportAuditReport(project.id, 'markdown')).toContain('# ZeroWall Science Audit Report')
    store.close()
  })

  it('records runtime audit summaries without persisting secrets or unbounded payloads', () => {
    const store = new ResearchStore(databasePath())
    const project = store.createProject({ name: 'Runtime audit', rootPath: 'C:/science/runtime-audit' })
    const event = store.recordAuditEvent(project.id, 'session.tool-call', {
      tool: 'python', token: 'do-not-store', nested: { authorization: 'also-secret' },
      output: 'x'.repeat(2_000),
    })
    expect(event.details).toMatchObject({ token: '[redacted]', nested: { authorization: '[redacted]' } })
    expect(String(event.details.output)).toContain('[truncated]')
    expect(store.listAuditEvents(project.id)).toHaveLength(1)
    store.close()
  })
})

function sessionLog(id: string, cwd: string, parentSession?: string): string {
  return `${JSON.stringify({
    type: 'session', version: 0, id, createdAt: 42, cwd,
    ...(parentSession === undefined ? {} : { parentSession }),
    delegationDepth: parentSession === undefined ? 0 : 1,
  })}\n`
}
