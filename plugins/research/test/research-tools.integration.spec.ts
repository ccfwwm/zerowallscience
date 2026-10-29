import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchStore } from '../../research-store/src/index.js'
import * as Research from '../src/host/index.js'
import sharp from 'sharp'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { defaultSciencePythonExecutable } from '../src/host/managed-python.js'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.unstubAllEnvs() })
function testSession(id: string, cwd: string, userMessages: string[] = []) {
  // Match the Host-facing Session API used by automatic research-target
  // discovery while keeping these fixtures free of fabricated user evidence.
  return { id, header: { cwd }, snapshotEvents: () => userMessages.map(text => ({ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } })) }
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-tools-'))
  const db = join(root, 'research.sqlite')
  const store = new ResearchStore(db)
  const project = store.createProject({ name: 'A', rootPath: join(root, 'a') })
  const foreign = store.createProject({ name: 'B', rootPath: join(root, 'b') })
  await mkdir(project.rootPath); await mkdir(foreign.rootPath)
  const path = join(project.rootPath, 'ref.fa'); await writeFile(path, '>ref\nATGGAATTCTAA\n')
  const asset = store.createDataAsset({ projectId: project.id, name: 'ref', uri: pathToFileURL(path).href, location: 'local', mediaType: 'text/x-fasta' })
  vi.stubEnv('ZEROWALL_RESEARCH_DB', db)
  const ctx = new Context()
  const sessions = new Map([['a', testSession('a', project.rootPath)], ['b', testSession('b', foreign.rootPath)]])
  ctx.provide('sessions', { get: (id: string) => sessions.get(id) } as any)
  await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(Research)
  cleanups.push(async () => { await ctx.fiber.dispose(); store.close(); await rm(root, { recursive: true, force: true }) })
  const call = (name: string, args: object, session = 'a') => ctx.tools.execute({ name, arguments: args, callId: ToolCallId('integration'), signal: new AbortController().signal, agent: { session: sessions.get(session) } as any })
  return { ctx, store, project, foreign, asset, call, sessions, root }
}
function value(result: any): any { expect(result.isError, JSON.stringify(result.content)).toBe(false); return result.value }

it('keeps scientific services and conversation viewer routing available in a headless Host', async () => {
  const { ctx, call, asset } = await fixture()
  expect(ctx.get('webServer')).toBeUndefined()
  expect(Research.inject).toEqual(['tools'])
  expect(ctx.zerowallResearch).toBeDefined()
  expect((ctx.zerowallResearch as any).scienceWorkbench).toBeUndefined()
  expect((ctx.zerowallResearch as any).scienceWorkbenchEvents).toBeUndefined()
  expect((ctx.zerowallResearch as any).scienceViewerRoute).toBeTypeOf('function')
  expect(ctx.tools.get('science_viewer_panel')).toBeDefined()
  expect(ctx.tools.get('science_viewer')).toBeDefined()
  expect((await call('science_viewer_panel', { action: 'analyze', tool: 'imagej', request_id: 'legacy-analysis' })).isError).toBe(true)
  const opened = value(await call('science_viewer_panel', { action: 'open', tool: 'imagej', asset_id: asset.id, request_id: 'viewer-open-1' }))
  expect(opened).toMatchObject({ status: 'accepted', action: 'open', tool: 'imagej' })
  const repeated = value(await call('science_viewer_panel', { action: 'open', tool: 'imagej', asset_id: asset.id, request_id: 'viewer-open-1' }))
  expect(repeated).toMatchObject({ status: 'accepted', idempotent: true, action: 'open', tool: 'imagej' })
  expect((await call('science_viewer_panel', { action: 'open', tool: 'imagej', asset_id: 'other-asset', request_id: 'viewer-open-1' })).isError).toBe(true)
  await expect((ctx.zerowallResearch as any).scienceViewerRoute({ action: 'analyze', sessionId: 'a', requestId: 'viewer-analysis-1', tool: 'imagej' })).rejects.toThrow(/Only viewer open\/focus/u)
  await expect((ctx.zerowallResearch as any).scienceViewerRoute({ action: 'open', sessionId: 'a', requestId: 'viewer-invalid-tool', tool: 'not-a-viewer' })).rejects.toThrow(/supported scientific viewer/u)
  await expect((ctx.zerowallResearch as any).scienceViewerRoute({ action: 'open', sessionId: 'a', requestId: 'viewer-foreign-asset', tool: 'imagej', assetId: 'foreign-asset' })).rejects.toThrow(/does not belong to the active conversation/u)
  await expect((ctx.zerowallResearch as any).scienceViewerRoute({ action: 'open', sessionId: 'a', requestId: 'viewer-foreign-view', tool: 'imagej', viewerId: 'foreign-viewer' })).rejects.toThrow(/does not belong to the active conversation/u)
  await expect((ctx.zerowallResearch as any).scienceViewerRoute({ action: 'open', sessionId: 'a', requestId: 'viewer-foreign-run', tool: 'imagej', runId: 'foreign-run' })).rejects.toThrow(/does not belong to the active conversation/u)
  await expect((ctx.zerowallResearch as any).scienceViewerRoute({ action: 'open', sessionId: 'b', projectId: 'foreign-project', requestId: 'foreign-viewer-1', tool: 'imagej' })).rejects.toThrow(/active conversation research context/u)
  expect(value(await call('science_viewer', { action: 'native_status' }))).toEqual({ launches: [] })
})

it('mounts optional image routes when webServer arrives after the headless scientific tools', async () => {
  const { ctx, call } = await fixture()
  const dispose = vi.fn()
  const register = vi.fn(() => dispose)
  ctx.provide('webServer', { register } as any)
  await vi.waitFor(() => expect(register).toHaveBeenCalledOnce())
  expect(register.mock.calls[0]?.[0]).toMatchObject({ kind: 'prefix', path: '/zerowall/research-assets', handler: expect.any(Function) })
  expect(value(await call('science_viewer', { action: 'native_status' }))).toEqual({ launches: [] })
  await ctx.fiber.dispose()
  expect(dispose).toHaveBeenCalledOnce()
})

it('automatically creates and binds a project and draft study before research tools run', async () => {
  const { ctx, store, root, sessions } = await fixture()
  const cwd = join(root, 'ordinary-workspace'); await mkdir(cwd)
  sessions.set('ordinary', testSession('ordinary', cwd))
  const objective = 'Analyze a local pilot dataset for the effect of exposure X on outcome Y'
  const first = value(await callThrough(ctx, 'research_study', { action: 'list', target: objective }, sessions.get('ordinary')))
  const project = store.listProjects().find(item => item.rootPath.toLowerCase() === cwd.toLowerCase())
  expect(project).toBeDefined()
  const studies = store.listResearchStudies(project!.id)
  expect(studies).toHaveLength(1)
  expect(first.studies.map((study: any) => study.id)).toContain(studies[0]!.id)
  expect(store.listResearchDocuments(studies[0]!.id).map(document => document.kind).sort()).toEqual(['analysis-plan', 'dataset-contract', 'question'])
  expect(store.getSessionResearchStudy(project!.id, 'ordinary')?.id).toBe(studies[0]!.id)

  const repeated = value(await callThrough(ctx, 'research_study', { action: 'get', target: objective }, sessions.get('ordinary')))
  expect(repeated.study.id).toBe(studies[0]!.id)
  expect(store.listResearchStudies(project!.id)).toHaveLength(1)
  // Legacy RPC remains as an idempotent compatibility alias; it no longer
  // represents a prerequisite that blocks the research tool.
  const compatibilityProject = await ctx.zerowallResearch.registerSessionProject({ sessionId: 'ordinary' })
  expect(compatibilityProject.id).toBe(project!.id)

  expect(() => ctx.zerowallResearch.ensureResearchContext({ sessionId: 'missing' })).toThrow(/session/iu)
  sessions.set('bad', testSession('bad', join(root, 'absent')))
  expect(() => ctx.zerowallResearch.ensureResearchContext({ sessionId: 'bad' })).toThrow()
})

it('keeps a user objective bound across tool summaries, nested Gates, Runners and report entry points', async () => {
  const { ctx, store, project, sessions, call } = await fixture()
  const messages = ['Please investigate how exposure X relates to outcome Y in the pilot dataset, with the requested covariate adjustments.']
  sessions.set('a', testSession('a', project.rootPath, messages))
  const summary = 'Pilot exposure X and outcome Y'
  const first = value(await call('research_study', { action: 'get', target: summary })).study
  expect(store.getResearchDocument(first.currentQuestionId)?.payload.text).toBe(messages[0])

  // Contract creation must not run a Gate or switch Studies when the model
  // invokes a nested operation without the objective summary.
  const contract = value(await call('research_study', { action: 'create_document', kind: 'dataset-contract', target: summary, payload: { sourceStatus: 'unknown', variables: [] } })).document
  expect(contract.studyId).toBe(first.id)
  const gate = value(await call('research_study', { action: 'auto_gate1', target: summary }))
  expect(gate).toMatchObject({ status: 'proceedable', proceedable: true, readOnly: true, study: { id: first.id } })
  expect(gate.warnings.length).toBeGreaterThan(0)
  const plan = store.createResearchDocument({ projectId: project.id, studyId: first.id, kind: 'analysis-plan', payload: { method: 'validation fixture', inputs: [], stoppingConditions: ['fixture'], exploratory: false } })
  const task = store.createResearchTask({ projectId: project.id, studyId: first.id, name: 'Validation fixture', kind: 'runner' })
  const nhanes = vi.spyOn((ctx.zerowallResearch as any).nhanes, 'execute').mockResolvedValue({ status: 'runner-reached' })
  const genetics = vi.spyOn((ctx.zerowallResearch as any).genetics, 'execute').mockResolvedValue({ status: 'runner-reached' })
  for (const [action, runner] of [['run_nhanes_survey', nhanes], ['run_genetic_analysis', genetics]] as const) {
    const result = value(await call('research_study', { action, target: summary, request_id: action, plan_id: plan.id, contract_id: contract.id, task_id: task.id, expected_revision: plan.version }))
    expect(result).toEqual({ status: 'runner-reached' })
    expect(runner).toHaveBeenCalledOnce()
  }
  const report = value(await call('research_study', { action: 'generate_report', target: summary, report_mode: 'final' }))
  expect(report).toMatchObject({ mode: 'final', status: 'succeeded' })
  const manifest = JSON.parse(await readFile(fileURLToPath(report.manifest.uri), 'utf8'))
  expect(manifest.verificationStatus).toBe('not-certified-by-report-generation')
  expect(manifest.warnings).toEqual(expect.arrayContaining([expect.stringContaining('Gate 1'), expect.stringContaining('Gate 2')]))
  expect(manifest.studyId).toBe(first.id)
  expect(ctx.zerowallResearch.getActiveResearchStudy({ sessionId: 'a' })?.id).toBe(first.id)
  expect(store.listResearchStudies(project.id)).toHaveLength(1)

  messages.push('继续')
  expect(value(await call('research_study', { action: 'get', target: 'An unrequested replacement objective' })).study.id).toBe(first.id)
  messages.push('Investigate a different hypothesis concerning treatment Z and survival time.')
  const second = value(await call('research_study', { action: 'get', target: summary })).study
  expect(second.id).not.toBe(first.id)
  expect(store.listResearchStudies(project.id)).toHaveLength(2)
})

function callThrough(ctx: Context, name: string, args: object, session: unknown) {
  return ctx.tools.execute({ name, arguments: args, callId: ToolCallId('auto-research-context'), signal: new AbortController().signal, agent: { session } as any })
}

it('honors the currently selected compatible study without making users reselect it', async () => {
  const { ctx, store, project } = await fixture()
  const selected = store.createResearchStudy({ projectId: project.id, title: 'User-selected pilot study' })
  await ctx.zerowallResearch.setActiveResearchStudy({ sessionId: 'a', studyId: selected.id })

  const result = value(await callThrough(ctx, 'research_study', { action: 'get', target: 'A specific analysis objective for this selected study' }, testSession('a', project.rootPath)))
  expect(result.study.id).toBe(selected.id)
  expect(store.getSessionResearchStudy(project.id, 'a')?.id).toBe(selected.id)
  expect(store.listResearchStudies(project.id)).toHaveLength(2)
})

it('uses the automatically ensured Study when listing documents and tasks without an explicit study_id', async () => {
  const { ctx, store, call } = await fixture()
  const target = 'Inspect an automatically provisioned research workspace'
  const documents = value(await callThrough(ctx, 'research_study', { action: 'documents', target }, testSession('a', store.listProjects()[0]!.rootPath)))
  expect(documents.documents.map((document: any) => document.kind).sort()).toEqual(['analysis-plan', 'dataset-contract', 'question'])
  const tasks = value(await callThrough(ctx, 'research_study', { action: 'tasks', target }, testSession('a', store.listProjects()[0]!.rootPath)))
  expect(tasks.tasks).toEqual([])
})

it('installs a managed brain atlas without selecting or registering it as a project asset', async () => {
  const { ctx, store, project } = await fixture()
  const assetsBefore = store.listDataAssets(project.id)
  const install = vi.fn().mockResolvedValue({ atlas: { status: 'installed', directory: 'C:/managed-atlas', name: 'allen_mouse_25um' } })
  ;(ctx.zerowallResearch as any).brain.installAtlas = install
  await ctx.zerowallResearch.installBrainAtlas({ sessionId: 'a' })
  expect(install).toHaveBeenCalledOnce()
  expect(store.listDataAssets(project.id)).toEqual(assetsBefore)
  expect(store.listViewerSessions(project.id)).toEqual([])
})

it('does not register the managed atlas when an explicit open fails', async () => {
  const { ctx, store, project } = await fixture()
  ;(ctx.zerowallResearch as any).brain.assertBrainDependencies = vi.fn().mockResolvedValue(undefined)
  ;(ctx.zerowallResearch as any).brain.run = vi.fn().mockRejectedValue(new Error('atlas unavailable'))
  await expect(ctx.zerowallResearch.scienceViewer({ sessionId: 'a', action: 'brain_open' })).rejects.toThrow('atlas unavailable')
  expect(store.listDataAssets(project.id).filter(asset => asset.uri.startsWith('brainatlas://'))).toEqual([])
  expect(store.listViewerSessions(project.id)).toEqual([])
})

it('dispatches actual H5AD cell tools and exports results with project isolation', async () => {
  const { store, project, call } = await fixture()
  const path = join(project.rootPath, 'cells.h5ad')
  await promisify(execFile)(process.env.ZEROWALL_CELL_PYTHON || process.env.ZEROWALL_PYTHON || defaultSciencePythonExecutable() || 'python', ['-c', `import h5py,sys
with h5py.File(sys.argv[1], 'w') as f:
 f.attrs['encoding-type']='anndata'
 f.create_dataset('X', data=[[1.,0.],[0.,4.]])
 f.create_group('obs').create_dataset('_index',data=['cell1','cell2'])
 f.create_group('var').create_dataset('_index',data=['A','B'])
 f.create_group('obsm').create_dataset('X_umap',data=[[0.,0.],[1.,1.]])
`, path])
  const asset = store.createDataAsset({ projectId: project.id, name: 'cells', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/x-h5ad' })
  const opened = value(await call('science_viewer', { action: 'cell_open', asset_id: asset.id, gene: 'B', cell_limit: 1, embedding_limit: 1 }))
  expect(opened.cell.preview).toMatchObject({ truncated: true, expression: { values: [{ index: 0, value: 0 }] } })
  const id = opened.cell.viewer.id
  expect((await call('science_viewer', { action: 'cell_read', viewer_id: id, expected_revision: 1 }, 'b')).isError).toBe(true)
  const exported = value(await call('science_viewer', { action: 'cell_export', viewer_id: id, expected_revision: 1 }))
  expect(exported.cell.analysis.gene).toMatchObject({ cells: 2, detectedCells: 1, mean: 2, max: 4 })
  const artifact = exported.cell.artifact
  const manifest = JSON.parse(await readFile(fileURLToPath(artifact.uri), 'utf8'))
  expect(manifest).toMatchObject({ sourceAssetId: asset.id, scientificReview: 'pending', runtime: { matrixBlockElements: 262144 } })
  expect(manifest.readerSha256).toMatch(/^[a-f0-9]{64}$/)
  expect(store.listArtifacts(project.id)).toHaveLength(1)
  const selected = value(await call('science_viewer', { action: 'cell_select', viewer_id: id, expected_revision: exported.cell.viewer.version, cell_selection: { embedding: 'X_umap', axes: [0,1], polygon: [[.5,.5],[1.5,.5],[1.5,1.5],[.5,1.5]] } }))
  expect(selected.cell.selection).toMatchObject({ count: 1, sample: [{ index: 1, id: 'cell2' }], previewIndices: [] })
  const collection = value(await call('science_viewer', { action: 'cell_export_selection', viewer_id: id, expected_revision: selected.cell.viewer.version }))
  expect(await readFile(fileURLToPath(collection.cell.artifact.uri), 'utf8')).toContain('1,cell2')
}, 30000)

it('runs image/annotation tools through the Host and keeps preview pixels out of Agent text', async () => {
  const {store,project,call}=await fixture()
  const path=join(project.rootPath,'image.png')
  await sharp({create:{width:64,height:64,channels:3,background:'white'}}).png().toFile(path)
  const asset=store.createDataAsset({projectId:project.id,name:'image',uri:pathToFileURL(path).href,location:'local',mediaType:'image/png'})
  const opened=value(await call('science_viewer',{action:'image_open',asset_id:asset.id}))
  expect(opened.image).toMatchObject({coordinates:{width:64,height:64}})
  expect(opened.image).not.toHaveProperty('pngBase64')
  const annotation={expectedRevisionId:null,payload:{coordinates:opened.image.coordinates,rois:[{id:'r',name:'ROI',page:0,kind:'rectangle',x:0,y:0,width:8,height:8}]}}
  const saved=value(await call('science_viewer',{action:'annotation_save',viewer_id:opened.viewer.id,expected_revision:1,annotation}))
  expect(saved.annotationSave.conflict).toBe(false)
  const exported=value(await call('science_viewer',{action:'annotation_export',viewer_id:opened.viewer.id,expected_revision:1}))
  expect(JSON.parse(await readFile(fileURLToPath(exported.artifact.uri),'utf8')).payload.rois[0]).toMatchObject({width:8,height:8})
  expect((await call('science_viewer',{action:'image_read',viewer_id:opened.viewer.id},'b')).isError).toBe(true)
})

it('uses the same native launch validation in RPC and Agent calls', async () => {
  const { ctx, project, call } = await fixture()
  vi.stubEnv('ZEROWALL_PYTHON_ROOT', join(project.rootPath, 'missing', 'zerowall-python'))
  vi.stubEnv('ZEROWALL_PYTHON_RUNTIME_ROOT', join(project.rootPath, 'missing', 'Python'))
  await expect(ctx.zerowallResearch.launchScientificEngine({ sessionId: 'a', engine: 'napari' })).rejects.toThrow()
  expect((await call('science_viewer', { action: 'launch_native', engine: 'napari' })).isError).toBe(true)
  expect((await call('science_viewer', { action: 'launch_native' })).isError).toBe(true)
  await expect(ctx.zerowallResearch.launchScientificEngine({ sessionId: 'missing', engine: 'napari' })).rejects.toThrow('session')
  expect(value(await call('science_viewer', { action: 'native_status' }))).toEqual({ launches: [] })
})

it('discovers and executes the real sequence asset-to-artifact tool with project and revision isolation', async () => {
  const { ctx, store, project, asset, call } = await fixture()
  expect(ctx.tools.get('science_viewer')).toBeDefined()
  const opened = value(await call('science_viewer', { action: 'open', asset_id: asset.id }))
  const viewerId = opened.viewer.id
  expect(opened.window.sequence).toBe('ATGGAATTCTAA')
  expect((await call('science_viewer', { action: 'read', viewer_id: viewerId }, 'b')).isError).toBe(true)
  value(await call('science_viewer', { action: 'save', viewer_id: viewerId, expected_revision: 1, state: { recordIndex: 0, start: 4, count: 6, selectionStart: 4, selectionEnd: 9 } }))
  expect((await call('science_viewer', { action: 'export', viewer_id: viewerId, expected_revision: 1, operation: 'translate' })).isError).toBe(true)
  const exported = value(await call('science_viewer', { action: 'export', viewer_id: viewerId, expected_revision: 2, operation: 'translate' }))
  expect(exported.analysis.sequence).toBe('EF')
  const result = JSON.parse(await readFile(fileURLToPath(exported.artifact.uri), 'utf8'))
  expect(result).toMatchObject({ assetId: asset.id, viewerVersion: 2, analysis: { start: 4, end: 9, sequence: 'EF' } })
  expect(store.listArtifacts(project.id)).toHaveLength(1)
  expect(store.listResearchStudies(project.id)).toHaveLength(1)
})

it('runs the canvas Agent schema through Host and returns source-linked artifacts without SVG text', async () => {
  const { ctx, project, asset, call } = await fixture()
  expect(ctx.tools.get('science_viewer')).toBeDefined()
  const spec = { title: 'Actual tool route', width: 640, height: 400, xLabel: 'x', yLabel: 'y', sourceAssetIds: [asset.id], series: [{ id: 's', name: 'Reference', color: '#2255aa', points: [{ x: 0, y: 1 }, { x: 1, y: 2 }] }] }
  const result = value(await call('science_viewer', { action: 'canvas_export', canvas_spec: spec }))
  expect(result.canvas.canvas.pointCount).toBe(2)
  expect(result.canvas.canvas.svgOmittedFromAgentText).toBe(true)
  expect(result.canvas.canvas).not.toHaveProperty('svg')
  expect(result.canvas.artifacts).toHaveLength(4)
  expect(result.canvas.artifacts.every((a: any) => a.projectId === project.id)).toBe(true)
  expect((await call('science_viewer', { action: 'canvas_export', canvas_spec: spec }, 'b')).isError).toBe(true)
})

it('keeps gates and computed evidence out of the Agent proposal tool', async () => {
  const { ctx, store, project, foreign, call } = await fixture()
  const study = store.createResearchStudy({ projectId: project.id, title: 'Local study' })
  await ctx.zerowallResearch.setActiveResearchStudy({ sessionId: 'a', studyId: study.id })
  const other = store.createResearchStudy({ projectId: foreign.id, title: 'Foreign study' })
  for (const action of ['approve_gate', 'freeze', 'approveResearchGate']) expect((await call('research_study', { action, study_id: study.id })).isError).toBe(true)
  for (const kind of ['evidence', 'claim']) expect((await call('research_study', { action: 'create_document', study_id: study.id, kind, payload: { result: 1 } })).isError).toBe(true)
  expect((await call('research_study', { action: 'get', study_id: other.id })).isError).toBe(true)
  expect((await call('research_study', { action: 'list', project_id: foreign.id })).isError).toBe(true)
  value(await call('research_study', { action: 'create_document', study_id: study.id, kind: 'observation', payload: { status: 'unverified', text: 'Observed by user, not yet replicated.' } }))
  const run = store.createRun({ projectId: project.id, name: 'fixture', command: 'fixture', workingDirectory: project.rootPath, status: 'succeeded' })
  expect((await call('research_study', { action: 'register_evidence', study_id: study.id, payload: { runId: 'missing', evidenceType: 'computed' } })).isError).toBe(true)
  const evidence = value(await call('research_study', { action: 'register_evidence', study_id: study.id, payload: { runId: run.id, evidenceType: 'computed', needsReview: false } }))
  expect(evidence.document.payload.needsReview).toBe(true)
  const claim = await ctx.zerowallResearch.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'claim', payload: { text: 'fixture claim', evidenceIds: [evidence.document.id] } })
  const audited = value(await call('research_study', { action: 'audit_claim', study_id: study.id, claim_id: claim.id, expected_version: 1 }))
  expect(audited.document.payload).toMatchObject({ auditStatus: 'failed', needsReview: true })
  expect(store.listResearchDocuments(study.id).map(doc => doc.kind).sort()).toEqual([
    'analysis-plan', 'claim', 'dataset-contract', 'evidence', 'observation', 'question',
  ])
  expect(store.getResearchStudy(study.id)).toMatchObject({ gate1: 'pending', gate2: 'pending' })
})

it('exposes task budget and Run reconciliation through the Research Host', async () => {
  const { ctx, store, project, call } = await fixture()
  const study = store.createResearchStudy({ projectId: project.id, title: 'Task RPC', budget: { maxRemoteThreads: 1, maxTokens: 100 } })
  await ctx.zerowallResearch.setActiveResearchStudy({ sessionId: 'a', studyId: study.id })
  const task = await ctx.zerowallResearch.createResearchTask({ projectId: project.id, studyId: study.id, name: 'Scout', kind: 'data-scout', budget: { remoteThreads: 1, tokens: 100 } })
  const run = store.createRun({ projectId: project.id, name: 'Scout run', command: 'scout', workingDirectory: project.rootPath, status: 'running' })
  const running = await ctx.zerowallResearch.updateResearchTask({ id: task.id, changes: { expectedVersion: task.version, status: 'running', runId: run.id } })
  expect(await ctx.zerowallResearch.getResearchTaskBudget(study.id)).toMatchObject({ usage: { remoteThreads: 1, tokens: 100 }, accounting: 'estimated-per-attempt' })
  store.updateRun(run.id, { status: 'succeeded', progress: 1 })
  expect(await ctx.zerowallResearch.reconcileResearchTaskRun({ id: task.id, expectedVersion: running.version })).toMatchObject({ status: 'succeeded' })
  expect(value(await call('research_study', { action: 'tasks', study_id: study.id })).tasks).toHaveLength(1)
  expect(value(await call('research_study', { action: 'task_budget', study_id: study.id })).budget.usage.tokens).toBe(100)
})

it('runs the four non-blot Fiji experiment metric contracts as traceable local artifacts', async () => {
  const { ctx, store, project } = await fixture()
  const input = { sessionId: 'a', action: 'analyze' as const, experiment: 'bacterial-cfu' as const, requestId: 'cfu-1', measurements: [{ plateId: 'P1', colonyCount: 10, dilutionFactor: 100, platedVolumeMl: 0.1 }] }
  const first = await ctx.zerowallResearch.fijiExperiment(input)
  expect(first.result?.measurements[0]).toMatchObject({ cfuPerMl: 10000 })
  expect(first.artifacts).toHaveLength(1)
  const second = await ctx.zerowallResearch.fijiExperiment(input)
  expect(second.run?.id).toBe(first.run?.id)
  await expect(ctx.zerowallResearch.fijiExperiment({ ...input, measurements: [{ ...input.measurements![0], colonyCount: 11 }] })).rejects.toThrow(/IDEMPOTENCY_CONFLICT/)
  expect(store.listRuns(project.id).filter(run => run.leaseOwner === 'fiji-experiment')).toHaveLength(1)
})

it('exposes the NHANES contract gate through the project-scoped research tool', async () => {
  const { ctx, store, project, call } = await fixture()
  const study = store.createResearchStudy({ projectId: project.id, title: 'NHANES contract' })
  await ctx.zerowallResearch.setActiveResearchStudy({ sessionId: 'a', studyId: study.id })
  const result = value(await call('research_study', { action: 'validate_nhanes_contract', study_id: study.id, contract: { datasets: [{ cycle: '2017-2018', component: 'Demographics', dataset: 'DEMO_J', weight: 'WTINT2YR' }], strata: 'SDMVSTRA', psu: 'SDMVPSU', weight: 'WTINT2YR', isolatedPsuHandling: 'survey-option-recorded' } }))
  expect(result).toMatchObject({ studyId: study.id, status: 'usable', contract: '7.0.0-nhanes-contract.1' })
})

it('exposes the genetic contract gate and keeps it project-scoped', async () => {
  const { ctx, store, project, foreign, call } = await fixture()
  const study = store.createResearchStudy({ projectId: project.id, title: 'Genetic contract' })
  await ctx.zerowallResearch.setActiveResearchStudy({ sessionId: 'a', studyId: study.id })
  const contract = { method: 'coloc', exposureDefinition: 'BMI QTL', outcomeDefinition: 'alopecia GWAS', ancestry: 'EUR', genomeBuild: 'GRCh37', effectUnit: 'SD', sampleOverlapChecked: true, harmonized: true, completeRegion: true, requiredFields: true, leadSnpOnly: true }
  const result = value(await call('research_study', { action: 'validate_genetic_contract', study_id: study.id, contract }))
  expect(result).toMatchObject({ studyId: study.id, status: 'not-applicable', contract: '7.0.0-genetic-contract.2' })
  expect((await call('research_study', { action: 'validate_genetic_contract', study_id: study.id, project_id: foreign.id, contract })).isError).toBe(true)
})

it('generates a traceable draft and a formal report while preserving review warnings', async () => {
  const { ctx, store, project, call } = await fixture()
  const study = store.createResearchStudy({ projectId: project.id, title: '肥胖—脱发报告链路', phase: 'evidence' })
  await ctx.zerowallResearch.setActiveResearchStudy({ sessionId: 'a', studyId: study.id })
  store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'question', payload: { text: 'BMI 与明确脱发表型的关系待核验。' } })
  const catalog = store.createArtifact({ projectId: project.id, name: 'Catalog fixture', uri: 'file:///catalog.json', mediaType: 'application/json' })
  store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'evidence', payload: { result: '目录侦察完成', artifactId: catalog.id, needsReview: true } })
  const draft = value(await call('research_study', { action: 'generate_report', study_id: study.id }))
  expect(draft.report.uri).toMatch(/^file:/)
  expect(await readFile(fileURLToPath(draft.report.uri), 'utf8')).toContain('Introduction')
  expect(JSON.parse(await readFile(fileURLToPath(draft.manifest.uri), 'utf8'))).toMatchObject({ format: 'zerowall-science-imrad-report', needsReview: true })
  const final = value(await call('research_study', { action: 'generate_report', study_id: study.id, report_mode: 'final' }))
  expect(final).toMatchObject({ mode: 'final', status: 'succeeded', blockers: [] })
  expect(final.warnings.length).toBeGreaterThan(0)
  expect(await readFile(fileURLToPath(final.report.uri), 'utf8')).toContain('科学核验状态：含未核验项目')
})

it('runs the managed Allen 25 um BrainGlobe atlas through the science viewer when configured', async () => {
  const atlasDir = process.env.ZEROWALL_BRAINGLOBE_DIR
  if (!atlasDir) return
  const { store, project, call } = await fixture()
  const opened = value(await call('science_viewer', { action: 'brain_open' }))
  expect(opened.brain.summary).toMatchObject({ atlas: 'allen_mouse_25um', resolution: [25, 25, 25], regionCount: 840 })
  const viewerId = opened.brain.viewer.id
  const read = value(await call('science_viewer', { action: 'brain_read', viewer_id: viewerId, expected_revision: 1 }))
  const sliced = value(await call('science_viewer', { action: 'brain_analyze', viewer_id: viewerId, expected_revision: read.brain.viewer.version, brain_axis: 0, brain_index: 100, brain_downsample: 16 }))
  expect(sliced.brain.slice).toMatchObject({ axis: 0, index: 100 })
  const queried = value(await call('science_viewer', { action: 'brain_analyze', viewer_id: viewerId, expected_revision: sliced.brain.viewer.version, brain_region: 'cerebrum' }))
  expect(queried.brain.region.matches.length).toBeGreaterThan(0)
  const mapped = value(await call('science_viewer', { action: 'brain_cells', viewer_id: viewerId, expected_revision: queried.brain.viewer.version, brain_coordinates: [[264, 160, 228], [0, 0, 0]], brain_coordinate_units: 'voxel' }))
  expect(mapped.brain.analysis).toMatchObject({ total: 2 })
  const exported = value(await call('science_viewer', { action: 'brain_export', viewer_id: viewerId, expected_revision: mapped.brain.viewer.version, brain_region: 'cerebrum' }))
  expect(exported.brain.artifact).toMatchObject({ name: 'BrainGlobe atlas analysis' })
  expect(store.listArtifacts(project.id)).toHaveLength(1)
}, 60000)

it('renders a traceable brainrender PNG and HTML scene when the managed environment is configured', async () => {
  const atlasDir = process.env.ZEROWALL_BRAINGLOBE_DIR
  const python = process.env.ZEROWALL_BRAINGLOBE_PYTHON
  if (!atlasDir || !python) return
  const { store, project, call } = await fixture()
  const rendered = value(await call('science_viewer', { action: 'brain_render', brain_regions: ['MOs'], brain_coordinates: [[1000, 1000, 1000]], brain_coordinate_units: 'micron', brain_title: 'ZeroWall test scene' }))
  expect(rendered.brain.rendering).toMatchObject({ status: 'succeeded', regions: ['MOs'], coordinateCount: 1 })
  const png = rendered.brain.rendering.pngUri
  const html = rendered.brain.rendering.htmlUri
  expect((await readFile(fileURLToPath(png))).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(await readFile(fileURLToPath(html), 'utf8')).toContain('k3d')
  expect(rendered.brain.artifact).toMatchObject({ name: 'BrainGlobe 3D scene manifest' })
  expect(store.listArtifacts(project.id)).toHaveLength(3)
}, 180000)

it('runs managed cellfinder detection and records source hashes when configured', async () => {
  const atlasDir = process.env.ZEROWALL_BRAINGLOBE_DIR
  const python = process.env.ZEROWALL_BRAINGLOBE_PYTHON
  if (!atlasDir || !python) return
  const { store, project, call } = await fixture()
  const path = join(project.rootPath, 'signal.npy')
  await promisify(execFile)(python, ['-c', 'import numpy as np,sys; a=np.zeros((4,8,8),dtype=np.float32); a[2,4,4]=1000; np.save(sys.argv[1],a)', path])
  const asset = store.createDataAsset({ projectId: project.id, name: 'signal.npy', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/octet-stream' })
  const detected = value(await call('science_viewer', { action: 'brain_cellfinder', asset_id: asset.id, brain_voxel_sizes: [5, 1, 1], brain_n_free_cpus: 63, brain_skip_classification: true, brain_start_plane: 0, brain_end_plane: 4 }))
  expect(detected.brain.cellfinder).toMatchObject({ status: 'succeeded', sourceAssetId: asset.id, voxelSizes: [5, 1, 1] })
  expect(detected.brain.artifact).toMatchObject({ name: 'BrainGlobe cellfinder detection' })
  const manifest = JSON.parse(await readFile(fileURLToPath(detected.brain.artifact.uri), 'utf8'))
  expect(manifest).toMatchObject({ format: 'zerowall-cellfinder-detection', sourceAssetId: asset.id, scientificReview: 'pending', parameters: { skipClassification: true } })
  expect(manifest.sourceSha256).toMatch(/^[a-f0-9]{64}$/u)
}, 240000)

it('validates brainreg registration contracts before starting the managed runner', async () => {
  const { store, project, call } = await fixture()
  const path = join(project.rootPath, 'stack.tif')
  await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } } }).tiff().toFile(path)
  const asset = store.createDataAsset({ projectId: project.id, name: 'stack.tif', uri: pathToFileURL(path).href, location: 'local', mediaType: 'image/tiff' })
  const result = await call('science_viewer', { action: 'brain_register', asset_id: asset.id, brain_orientation: 'invalid', brain_voxel_sizes: [25, 25, 25] })
  expect(result.isError).toBe(true)
  expect(JSON.stringify(result.content)).toMatch(/orientation|three-letter/u)
})

it('runs CFU image segmentation from a project image and records source provenance', async () => {
  const { ctx, store, project } = await fixture()
  const path = join(project.rootPath, 'plate.png')
  const pixels = Buffer.alloc(16 * 12)
  const paint = (x: number, y: number, points: Array<[number, number]>) => { for (const [dx, dy] of points) pixels[(y + dy) * 16 + x + dx] = 255 }
  paint(1, 1, [[0,0],[1,0],[0,1],[1,1]]); paint(9, 2, [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]])
  await sharp(pixels, { raw: { width: 16, height: 12, channels: 1 } }).toColourspace('b-w').png().toFile(path)
  const asset = store.createDataAsset({ projectId: project.id, name: 'plate.png', uri: pathToFileURL(path).href, location: 'local', mediaType: 'image/png' })
  const result = await ctx.zerowallResearch.fijiExperiment({ sessionId: 'a', action: 'analyze', experiment: 'bacterial-cfu', requestId: 'cfu-image-1', sourceAssetId: asset.id, image: { plateId: 'P1', dilutionFactor: 100, platedVolumeMl: .1, threshold: 200, minArea: 2, maxArea: 10, polarity: 'bright', roi: { x: 0, y: 0, width: 16, height: 12 } } })
  expect(result.result?.imageAnalysis).toMatchObject({ foregroundPixels: 10, componentAreas: [4, 6], discardedComponents: 0 })
  expect(result.result?.measurements[0]).toMatchObject({ colonyCount: 2, cfuPerMl: 2000 })
  expect(result.artifacts?.[0]?.metadata).toMatchObject({ experiment: 'bacterial-cfu', scientificReview: 'pending', engine: 'imagej' })
  expect(result.artifacts?.map(item => item.name)).toEqual(expect.arrayContaining(['mask.png', 'overlay.png', 'particles.csv', 'analysis.roi', 'completion.json']))
}, 60000)

it('runs scratch, colony and tube image protocols through the Host artifact path', async () => {
  const { ctx, store, project } = await fixture()
  const pixels = Buffer.alloc(24 * 16)
  for (let y = 2; y < 6; y++) for (let x = 2; x < 8; x++) pixels[y * 24 + x] = 255
  for (let x = 4; x < 20; x++) pixels[8 * 24 + x] = 255
  for (let y = 6; y < 12; y++) pixels[y * 24 + 12] = 255
  const path = join(project.rootPath, 'protocols.png')
  await sharp(pixels, { raw: { width: 24, height: 16, channels: 1 } }).toColourspace('b-w').png().toFile(path)
  const asset = store.createDataAsset({ projectId: project.id, name: 'protocols.png', uri: pathToFileURL(path).href, location: 'local', mediaType: 'image/png' })
  const common = { sessionId: 'a', action: 'analyze' as const, sourceAssetId: asset.id }
  const scratch = await ctx.zerowallResearch.fijiExperiment({ ...common, experiment: 'scratch-wound', requestId: 'scratch-image-1', image: { kind: 'scratch-wound', sampleId: 's1', time: '24h', initialArea: 40, threshold: 200, polarity: 'bright', roi: { x: 0, y: 0, width: 12, height: 8 } } })
  expect(scratch.result?.measurements[0]).toMatchObject({ remainingArea: 24, closurePercent: 40 })
  const colony = await ctx.zerowallResearch.fijiExperiment({ ...common, experiment: 'colony-formation', requestId: 'colony-image-1', image: { kind: 'colony-formation', wellId: 'A1', threshold: 200, minArea: 2, maxArea: 100, polarity: 'bright', roi: { x: 0, y: 0, width: 12, height: 8 }, stainUnit: 'pixel' } })
  expect(colony.result?.measurements[0]).toMatchObject({ independentCount: 1, stainedArea: 24 })
  const tube = await ctx.zerowallResearch.fijiExperiment({ ...common, experiment: 'tube-formation', requestId: 'tube-image-1', image: { kind: 'tube-formation', sampleId: 't1', threshold: 200, polarity: 'bright', roi: { x: 0, y: 7, width: 24, height: 9 }, unit: 'pixel', unitScale: 1 } })
  expect((tube.result?.measurements[0] as any).segments).toBeGreaterThan(0)
  expect(store.listArtifacts(project.id).filter(item => item.name === 'result.json')).toHaveLength(3)
  expect(scratch.artifacts?.map(item => item.name)).toContain('mask.png')
  expect(colony.artifacts?.map(item => item.name)).toContain('overlay.png')
}, 60000)

it('keeps legacy Gate 1/2 actions read-only and does not freeze or alter the study', async () => {
  const { ctx, store, project } = await fixture()
  const study = store.createResearchStudy({ projectId: project.id, title: 'Automatically verified local source' })
  await ctx.zerowallResearch.setActiveResearchStudy({ sessionId: 'a', studyId: study.id })
  const path = join(project.rootPath, 'input.csv')
  await writeFile(path, 'x\n1\n')
  const asset = store.createDataAsset({ projectId: project.id, name: 'Input', uri: pathToFileURL(path).href, location: 'local', mediaType: 'text/csv' })
  const contract = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'dataset-contract', payload: { applicability: 'usable', sourceStatus: 'supported', source: asset.uri, assetId: asset.id, availableVariables: ['x', 'y'], verification: { sourceChecked: true, verifier: 'system-validation', checkedAt: new Date().toISOString() } } })
  const question = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'question', payload: { population: 'Synthetic adults', outcome: 'y' } })
  const plan = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'analysis-plan', payload: { method: 'linear regression', inputs: [contract.id], stoppingConditions: ['Missing input variables'], exploratory: false } })
  const incomplete = ctx.zerowallResearch.updateResearchStudy({ id: study.id, changes: { expectedVersion: store.getResearchStudy(study.id)!.version, currentQuestionId: question.id, currentPlanId: plan.id } })
  expect(incomplete.gate1).toBe('pending')
  expect(store.listStudyFreezes(study.id)).toEqual([])
  const before = store.getResearchStudy(study.id)
  const gate1 = ctx.zerowallResearch.autoApproveResearchGate1({ sessionId: 'a', studyId: study.id })
  const gate2 = ctx.zerowallResearch.autoApproveResearchGate2({ sessionId: 'a', studyId: study.id })
  expect(gate1).toMatchObject({ status: 'proceedable', proceedable: true, readOnly: true, study: { gate1: 'pending' } })
  expect(gate1.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CONTRACT_PROVENANCE_UNVERIFIED' })]))
  expect(gate2).toMatchObject({ status: 'proceedable', proceedable: true, readOnly: true, study: { gate2: 'pending' } })
  expect(store.getResearchStudy(study.id)).toEqual(before)
  expect(store.listStudyFreezes(study.id)).toEqual([])
})

it.each([
  { runner: 'nhanes', remote: 'runNhanesSurveyRemote', payload: { nhanesSurvey: { kind: 'summary', variable: 'x' } } },
  { runner: 'genetics', remote: 'runGeneticAnalysisRemote', payload: { genetics: { analysis: 'mr', methods: ['ivw'] } } },
])('lets formal $runner requests reach their strict Runner without a Gate 1 check', async ({ runner, remote, payload }) => {
  const { ctx, store, project } = await fixture()
  const study = store.createResearchStudy({ projectId: project.id, title: `Remote ${runner} source` })
  await ctx.zerowallResearch.setActiveResearchStudy({ sessionId: 'a', studyId: study.id })
  const path = join(project.rootPath, 'unrelated.csv'); await writeFile(path, 'x,y\n1,2\n')
  const asset = store.createDataAsset({ projectId: project.id, name: 'Unrelated local source', uri: pathToFileURL(path).href, location: 'local', mediaType: 'text/csv' })
  const contract = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'dataset-contract', payload: { applicability: 'usable', sourceStatus: 'supported', source: asset.uri, assetId: asset.id, availableVariables: ['x', 'y'] } })
  const question = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'question', payload: { population: 'Synthetic adults', outcome: 'y' } })
  const plan = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'analysis-plan', payload: { method: runner, inputs: [contract.id], stoppingConditions: ['Unverified remote inputs'], exploratory: false, ...payload } })
  ctx.zerowallResearch.updateResearchStudy({ id: study.id, changes: { expectedVersion: store.getResearchStudy(study.id)!.version, currentQuestionId: question.id, currentPlanId: plan.id } })
  const task = store.createResearchTask({ projectId: project.id, studyId: study.id, name: 'Remote analysis', kind: runner, exploratory: false })
  const service = ctx.zerowallResearch as any
  const execute = vi.spyOn(service[runner], 'execute').mockResolvedValue({ status: 'runner-reached' } as any)
  const result = await service[remote]({ sessionId: 'a', studyId: study.id, contractId: contract.id, planId: plan.id, expectedPlanVersion: plan.version, taskId: task.id, requestId: `remote-${runner}` })
  expect(result).toEqual({ status: 'runner-reached' })
  expect(execute).toHaveBeenCalledOnce()
  expect(store.getResearchStudy(study.id)!.gate1).toBe('pending')
  expect(store.listStudyFreezes(study.id)).toEqual([])

  // The Host delegates exploratory requests through the same strict Runner.
  const exploratory = store.createResearchTask({ projectId: project.id, studyId: study.id, name: 'Exploratory preparation', kind: runner, exploratory: true })
  execute.mockResolvedValueOnce({ status: 'blocked', stage: 'runner-contract' })
  const preparation = await service[remote]({ sessionId: 'a', studyId: study.id, contractId: contract.id, planId: plan.id, expectedPlanVersion: plan.version, taskId: exploratory.id, requestId: `exploratory-${runner}` })
  expect(execute).toHaveBeenCalledTimes(2)
  expect(preparation).toEqual({ status: 'blocked', stage: 'runner-contract' })
})
