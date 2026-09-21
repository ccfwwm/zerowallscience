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
    expect(first.schemaVersion()).toBe(16)
    const created = first.createProject({ name: 'Genome Study', rootPath: 'C:/science/genome' })
    first.close()

    const reopened = new ResearchStore(path)
    expect(reopened.schemaVersion()).toBe(16)
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
    expect(snapshot).toMatchObject({ format: 'zerowall-science-research-project', version: 3 })
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

  it('deduplicates literature papers and graph commits, and rolls back invalid commits', () => {
    const store = new ResearchStore(databasePath())
    const project = store.createProject({ name: 'Literature', rootPath: 'C:/science/literature' })
    const article = { pmid: '12345', doi: 'https://doi.org/10.1000/Example', title: 'A reproducible paper', abstract: 'Abstract' }
    expect(store.saveLiteraturePapers(project.id, [article])).toHaveLength(1)
    expect(store.saveLiteraturePapers(project.id, [article])).toHaveLength(1)
    expect(store.listPapers(project.id)).toHaveLength(1)
    const graph = {
      nodes: [
        { id: 'article:12345', type: 'article', label: article.title, detail: article },
        { id: 'concept:gene', type: 'concept', label: 'GENE' },
      ],
      edges: [{ source: 'article:12345', target: 'concept:gene', kind: 'mentions', detail: { evidencePmids: ['12345'] } }],
    } as const
    expect(store.commitLiteratureGraph(project.id, graph)).toEqual({ addedNodes: 2, addedEdges: 1 })
    expect(store.commitLiteratureGraph(project.id, graph)).toEqual({ addedNodes: 0, addedEdges: 0 })
    expect(store.getLiteratureGraph(project.id).nodes).toHaveLength(2)
    expect(store.getLiteratureGraph(project.id).edges).toHaveLength(1)
    expect(() => store.commitLiteratureGraph(project.id, {
      nodes: [{ id: 'concept:bad', type: 'concept', label: 'Bad' }],
      edges: [{ source: 'concept:bad', target: 'missing', kind: 'broken' }],
    })).toThrow()
    expect(store.getLiteratureGraph(project.id).nodes.some(node => node.id === 'concept:bad')).toBe(false)
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
    expect(store.updatePresentation(ready.id, { quality: null }).quality).toBeUndefined()
    expect(store.exportPresentation(ready.id, 'pptx', 'file:///results.pptx').exportUris.pptx).toBe('file:///results.pptx')
    store.close()

    const reopened = new ResearchStore(path)
    expect(reopened.listPublications(project.id)[0]).toMatchObject({ status: 'ready', exportUri: 'file:///publication.zip' })
    expect(reopened.listPresentations(project.id)[0]).toMatchObject({
      status: 'ready', slides: [{ id: 'slide-1', visualStatus: 'ready', visualAttempt: 2, visualUpdatedAt: '2026-08-28T00:00:00.000Z', visual: { requestedQuality: 'medium', actualQuality: 'medium', attachment: { mediaType: 'image/jpeg' } } }],
      artifacts: [{ kind: 'preview', checksum: 'sha256:preview' }],
    })
    expect(reopened.listPresentations(project.id)[0]?.quality).toBeUndefined()
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

  it('persists a study, validates its contract and freezes an immutable plan', () => {
    const store = new ResearchStore(databasePath())
    const project = store.createProject({ name: 'Study foundation', rootPath: 'C:/science/foundation' })
    const study = store.createResearchStudy({ projectId: project.id, title: '肥胖—脱发' })
    const contract = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'dataset-contract', payload: { applicability: 'usable', sourceStatus: 'supported', source: 'fixture', variables: ['bmi'] } })
    const question = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'question', payload: { phenotype: 'scalp-hair-loss', estimand: 'association' } })
    const plan = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'analysis-plan', payload: { method: 'survey-weighted-association', inputs: [contract.id], stoppingConditions: ['missing phenotype'], exploratory: false } })
    const current = store.getResearchStudy(study.id)!
    store.updateResearchStudy(study.id, { expectedVersion: current.version, currentQuestionId: question.id, currentPlanId: plan.id })
    const approved = store.approveResearchGate(study.id, 1, 'approved', current.version + 1, 'validated fixture contract')
    const freeze = store.freezeResearchStudy(study.id, approved.version)
    expect(freeze.snapshot.sha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(() => store.updateResearchDocument(plan.id, { expectedVersion: plan.version, payload: { method: 'changed' } })).toThrow('Frozen')
    expect(store.getResearchStudy(study.id)?.currentFreezeId).toBe(freeze.id)
    store.close()
  })

  it('registers evidence and deterministically audits claim references before gate two', () => {
    const store = new ResearchStore(databasePath())
    try {
      const project = store.createProject({ name: 'Evidence', rootPath: 'C:/science/evidence' })
      const study = store.createResearchStudy({ projectId: project.id, title: 'Evidence audit' })
      const contract = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'dataset-contract', payload: { applicability: 'usable', sourceStatus: 'supported', source: 'fixture' } })
      const question = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'question', payload: { estimand: 'association' } })
      const plan = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'analysis-plan', payload: { method: 'fixture', inputs: [contract.id], stoppingConditions: ['stop'], exploratory: false } })
      const linked = store.updateResearchStudy(study.id, { expectedVersion: store.getResearchStudy(study.id)!.version, currentQuestionId: question.id, currentPlanId: plan.id })
      const gate1 = store.approveResearchGate(study.id, 1, 'approved', linked.version, 'fixture plan')
      store.freezeResearchStudy(study.id, gate1.version)
      const evidence = store.registerResearchEvidence({ projectId: project.id, studyId: study.id, payload: { artifactId: 'artifact-1', evidenceType: 'computed', needsReview: false } })
      const claim = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'claim', payload: { text: 'bounded fixture claim', evidenceIds: [evidence.id] } })
      const audited = store.auditResearchClaim(claim.id, claim.version)
      expect(audited.payload).toMatchObject({ auditStatus: 'passed', needsReview: false, auditErrors: [] })
      const current = store.getResearchStudy(study.id)!
      expect(store.approveResearchGate(study.id, 2, 'approved', current.version, 'evidence audit passed').gate2).toBe('approved')
      const stale = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'claim', payload: { text: 'missing source', evidenceIds: ['missing'] } })
      expect(store.auditResearchClaim(stale.id, stale.version).payload).toMatchObject({ auditStatus: 'failed', needsReview: true })
    } finally { store.close() }
  })

  it('round-trips archived studies with remapped document and freeze references', () => {
    const source = new ResearchStore(databasePath())
    const project = source.createProject({ name: 'Snapshot source', rootPath: 'C:/science/snapshot-source' })
    const study = source.createResearchStudy({ projectId: project.id, title: 'Immutable import' })
    const asset = source.createDataAsset({ projectId: project.id, name: 'Fixture', uri: 'file:///fixture.csv', location: 'local', mediaType: 'text/csv' })
    const contract = source.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'dataset-contract', payload: { applicability: 'usable', sourceStatus: 'supported', source: 'fixture', assetId: asset.id } })
    const question = source.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'question', payload: { phenotype: 'fixture' } })
    const plan = source.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'analysis-plan', payload: { method: 'fixture', inputs: [contract.id], stoppingConditions: ['stop'], exploratory: false } })
    const current = source.getResearchStudy(study.id)!
    source.updateResearchStudy(study.id, { expectedVersion: current.version, currentQuestionId: question.id, currentPlanId: plan.id })
    const approved = source.approveResearchGate(study.id, 1, 'approved', current.version + 1, 'fixture')
    const freeze = source.freezeResearchStudy(study.id, approved.version)
    source.updateResearchStudy(study.id, { expectedVersion: source.getResearchStudy(study.id)!.version, status: 'archived' })
    const snapshot = source.exportResearchSnapshot(project.id)
    if (snapshot.version !== 3) throw new Error('Expected v3')
    snapshot.researchDocuments.sort((a, b) => a.kind === 'analysis-plan' ? -1 : b.kind === 'analysis-plan' ? 1 : 0)
    source.close()

    const importedStore = new ResearchStore(databasePath())
    const importedProject = importedStore.importResearchSnapshot(snapshot)
    const imported = importedStore.listResearchStudies(importedProject.id)
    expect(imported).toHaveLength(1)
    expect(imported[0].status).toBe('archived')
    expect(imported[0].currentQuestionId).not.toBe(question.id)
    expect(imported[0].currentPlanId).not.toBe(plan.id)
    const importedDocs = importedStore.listResearchDocuments(imported[0].id)
    const importedPlan = importedDocs.find(doc => doc.kind === 'analysis-plan')!
    const importedContract = importedDocs.find(doc => doc.kind === 'dataset-contract')!
    expect(importedPlan.payload.inputs).toEqual([importedContract.id])
    expect(importedContract.payload.assetId).toBe(importedStore.listDataAssets(importedProject.id)[0].id)
    expect(importedStore.validateAnalysisPlan(importedPlan.id).id).toBe(importedPlan.id)
    const freezes = importedStore.listStudyFreezes(imported[0].id)
    expect(imported[0].currentFreezeId).toBe(freezes[0].id)
    expect(freezes[0].snapshot.sha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(freezes[0].snapshot.importProvenance).toMatchObject({ sourceSnapshot: freeze.snapshot })
    expect(imported[0].version).toBe(snapshot.researchStudies[0].version)
    expect(imported[0].gate1).toBe('approved')
    expect(() => importedStore.updateResearchDocument(importedPlan.id, { expectedVersion: importedPlan.version, payload: importedPlan.payload })).toThrow(/archived/i)
    importedStore.close()
  })

  it('rejects foreign study pointers without importing a partial project', () => {
    const store = new ResearchStore(databasePath())
    try {
      const project = store.createProject({ name: 'Isolation', rootPath: 'C:/isolation' })
      const first = store.createResearchStudy({ projectId: project.id, title: 'First' })
      const second = store.createResearchStudy({ projectId: project.id, title: 'Second' })
      const foreign = store.createResearchDocument({ projectId: project.id, studyId: second.id, kind: 'question', payload: {} })
      const snapshot = store.exportResearchSnapshot(project.id)
      if (snapshot.version !== 3) throw new Error('Expected v3')
      snapshot.researchStudies.find(study => study.id === first.id)!.currentQuestionId = foreign.id
      expect(() => store.importResearchSnapshot(snapshot)).toThrow('invalid current document')
      expect(store.listProjects()).toHaveLength(1)
    } finally { store.close() }
  })

  it('round-trips a non-topological research task graph and blocks dependents after failure', () => {
    const source = new ResearchStore(databasePath())
    const project = source.createProject({ name: 'Task graph', rootPath: 'C:/science/task-graph' })
    const study = source.createResearchStudy({ projectId: project.id, title: 'Task graph study', budget: { maxTokens: 500 } })
    const first = source.createResearchTask({ projectId: project.id, studyId: study.id, name: 'Scout', kind: 'data-scout', budget: { tokens: 100 } })
    const second = source.createResearchTask({ projectId: project.id, studyId: study.id, name: 'Analyze', kind: 'runner', dependencies: [first.id], budget: { tokens: 200 } })
    const snapshot = source.exportResearchSnapshot(project.id)
    snapshot.researchTasks!.reverse()
    source.close()

    const importedStore = new ResearchStore(databasePath())
    const importedProject = importedStore.importResearchSnapshot(snapshot)
    const importedStudy = importedStore.listResearchStudies(importedProject.id)[0]!
    const tasks = importedStore.listResearchTasks(importedStudy.id)
    const importedFirst = tasks.find(task => task.name === first.name)!
    const importedSecond = tasks.find(task => task.name === second.name)!
    expect(importedSecond.dependencies).toEqual([importedFirst.id])
    const limited = importedStore.createResearchTask({ projectId: importedProject.id, studyId: importedStudy.id, name: 'Limited', kind: 'runner', budget: { tokens: 600 } })
    expect(() => importedStore.updateResearchTask(limited.id, { expectedVersion: limited.version, status: 'running' })).toThrow(/budget/i)
    importedStore.updateResearchTask(importedFirst.id, { expectedVersion: importedFirst.version, status: 'running' })
    importedStore.updateResearchTask(importedFirst.id, { expectedVersion: importedFirst.version + 1, status: 'failed', error: 'fixture failure' })
    const refreshed = importedStore.refreshResearchTaskReadiness(importedStudy.id)
    expect(refreshed.find(task => task.id === importedSecond.id)?.status).toBe('blocked')
    importedStore.close()
  })

  it('reserves concurrent task resources, accumulates attempts, and reconciles bound Runs', () => {
    const store = new ResearchStore(databasePath())
    try {
      const project = store.createProject({ name: 'Task budget', rootPath: 'C:/science/task-budget' })
      const study = store.createResearchStudy({ projectId: project.id, title: 'Budget', budget: { maxRemoteThreads: 1, maxTokens: 250 } })
      const task = store.createResearchTask({ projectId: project.id, studyId: study.id, name: 'Remote', kind: 'runner', budget: { remoteThreads: 1, tokens: 100 } })
      const run = store.createRun({ projectId: project.id, name: 'Remote run', command: 'job', workingDirectory: project.rootPath, status: 'running' })
      const running = store.updateResearchTask(task.id, { expectedVersion: task.version, status: 'running', runId: run.id })
      expect(store.getResearchTaskBudget(study.id)).toMatchObject({ usage: { remoteThreads: 1, tokens: 100 }, available: { remoteThreads: 0, tokens: 150 }, reservations: [{ taskId: task.id }] })
      store.updateRun(run.id, { status: 'failed', error: 'remote disconnected' })
      const failed = store.reconcileResearchTaskRun(task.id, running.version)
      expect(failed).toMatchObject({ status: 'failed', attempt: 1, error: 'remote disconnected' })
      const report = store.getResearchTaskBudget(study.id)
      expect(report.usage).toMatchObject({ remoteThreads: 0, tokens: 100 })
      expect(report.available).toMatchObject({ remoteThreads: 1, tokens: 150 })
      const retryRun = store.createRun({ projectId: project.id, name: 'Remote retry', command: 'job', workingDirectory: project.rootPath, status: 'running' })
      const retry = store.updateResearchTask(task.id, { expectedVersion: failed.version, status: 'running', runId: retryRun.id })
      expect(retry.attempt).toBe(2)
      store.updateRun(retryRun.id, { status: 'failed', error: 'second failure' })
      const failedAgain = store.reconcileResearchTaskRun(task.id, retry.version)
      expect(() => store.updateResearchTask(task.id, { expectedVersion: failedAgain.version, status: 'running' })).toThrow(/new Run/i)
      const thirdRun = store.createRun({ projectId: project.id, name: 'Remote third', command: 'job', workingDirectory: project.rootPath, status: 'running' })
      expect(() => store.updateResearchTask(task.id, { expectedVersion: failedAgain.version, status: 'running', runId: thirdRun.id })).toThrow(/budget/i)
    } finally { store.close() }
  })
})

function sessionLog(id: string, cwd: string, parentSession?: string): string {
  return `${JSON.stringify({
    type: 'session', version: 0, id, createdAt: 42, cwd,
    ...(parentSession === undefined ? {} : { parentSession }),
    delegationDepth: parentSession === undefined ? 0 : 1,
  })}\n`
}
