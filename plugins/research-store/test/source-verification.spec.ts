import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { ResearchStore } from '../src/index.js'

const roots: string[] = []
const stores: ResearchStore[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'science-source-'))
  roots.push(root)
  return root
}
function fixture(options: { content?: string; variables?: string[]; extension?: string } = {}) {
  const root = tempRoot(), databasePath = join(root, 'research.sqlite')
  const store = new ResearchStore(databasePath); stores.push(store)
  const { project, study } = store.ensureResearchContext({ sessionId: 'source', rootPath: root, projectName: 'Source verification', target: 'Effect of exposure x on outcome y' })
  const path = join(root, 'actual' + (options.extension ?? '.csv'))
  writeFileSync(path, options.content ?? 'x,y\n1,2\n')
  const asset = store.createDataAsset({ projectId: project.id, name: 'Actual input', uri: pathToFileURL(path).href, location: 'local', mediaType: 'text/csv', provenance: { sourceChecked: true, verifier: 'caller-assertion' } })
  const contract = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'dataset-contract', payload: { applicability: 'usable', sourceStatus: 'supported', source: asset.uri, assetId: asset.id, availableVariables: options.variables ?? ['x', 'y'], verification: { sourceChecked: true, checkedAt: new Date().toISOString(), verifier: 'system-validation' } } })
  const question = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'question', payload: { population: 'Synthetic adults', outcome: 'y', estimand: 'mean difference' } })
  const plan = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'analysis-plan', payload: { method: 'linear regression', inputs: [contract.id], stoppingConditions: ['Stop if x or y are missing'], exploratory: false } })
  store.updateResearchStudy(study.id, { expectedVersion: store.getResearchStudy(study.id)!.version, currentQuestionId: question.id, currentPlanId: plan.id })
  return { root, databasePath, store, project, study, path, asset, contract }
}
function gate(store: ResearchStore, studyId: string) {
  return store.approveResearchGateAutomatically(studyId, store.getResearchStudy(studyId)!.version)
}
function expectSourceBlocked(store: ResearchStore, studyId: string) {
  const result = gate(store, studyId)
  expect(result.status).toBe('blocked')
  if (result.status !== 'blocked') throw new Error('Expected a blocked source result')
  expect(result.blockers.map(item => item.code)).toContain('CONTRACT_PROVENANCE_UNVERIFIED')
  return result
}

describe('system dataset source verification', () => {
  it.each([
    { population: false, outcome: false },
    { population: true, outcome: true },
    { population: 1, outcome: 2 },
    { population: { status: 'unknown' }, outcome: { status: 'pending' } },
    { population: { status: 'supported' }, outcome: { verified: true } },
    { population: { verification: { sourceChecked: true } }, outcome: { applicability: 'usable' } },
    { population: '未知。', outcome: '待定' },
    { population: 'Not specified', outcome: '待核验：结局变量' },
    { population: { description: 'Adults', status: 'pending' }, outcome: 'y' },
    { population: { description: 'Adults', missing: ['age range'] }, outcome: 'y' },
    { population: { description: 'Adults', verified: false }, outcome: 'y' },
    { population: { criteria: [{ age: { minimum: 18, maximum: '待补充' } }] }, outcome: 'y' },
    { population: { description: 'Adults' }, outcome: { name: 'y', definition: { status: 'unknown' } } },
    { population: 'Adults', outcome: 'y', status: 'unknown' },
  ])('does not auto approve incomplete or metadata-only scientific identities (%j)', payload => {
    const { store, study, contract } = fixture()
    expect(store.verifyDatasetContractSource(contract.id).status).toBe('verified')
    const current = store.getResearchStudy(study.id)!
    const question = store.getResearchDocument(current.currentQuestionId!)!
    store.updateResearchDocument(question.id, { expectedVersion: question.version, payload: { ...payload, missing: [] } })
    const result = gate(store, study.id)
    expect(result.status).toBe('blocked')
    if (result.status === 'blocked') expect(result.blockers).toContainEqual(expect.objectContaining({ code: 'QUESTION_INCOMPLETE', documentId: question.id }))
    expect(store.getResearchStudy(study.id)!.gate1).toBe('pending')
    expect(store.listStudyFreezes(study.id)).toEqual([])
  })

  it('approves complete structured scientific definitions with numeric bounds and resolved metadata', () => {
    const { store, study, contract } = fixture()
    expect(store.verifyDatasetContractSource(contract.id).status).toBe('verified')
    const current = store.getResearchStudy(study.id)!
    const question = store.getResearchDocument(current.currentQuestionId!)!
    store.updateResearchDocument(question.id, { expectedVersion: question.version, payload: {
      population: { description: 'Synthetic adults', criteria: { age: { minimum: 18, maximum: 80, unit: 'years' } }, excluded: false, status: 'specified', verified: true, missing: [] },
      outcome: { name: 'y', definition: { description: 'Synthetic response', unit: 'points', binary: false }, verification: { status: 'verified', sourceChecked: true }, needsReview: false },
      status: 'draft', missing: [],
    } })
    const result = gate(store, study.id)
    expect(result.status).toBe('approved')
    expect(store.getResearchStudy(study.id)!.gate1).toBe('approved')
    expect(store.listStudyFreezes(study.id)).toHaveLength(1)
  })

  it('does not auto approve an analysis plan whose status remains unknown', () => {
    const { store, study, contract } = fixture()
    expect(store.verifyDatasetContractSource(contract.id).status).toBe('verified')
    const current = store.getResearchStudy(study.id)!
    const plan = store.getResearchDocument(current.currentPlanId!)!
    store.updateResearchDocument(plan.id, { expectedVersion: plan.version, payload: { ...plan.payload, status: 'unknown' } })
    const result = gate(store, study.id)
    expect(result.status).toBe('blocked')
    if (result.status === 'blocked') expect(result.blockers).toContainEqual(expect.objectContaining({ code: 'ANALYSIS_PLAN_INCOMPLETE', documentId: plan.id }))
    expect(store.getResearchStudy(study.id)!.gate1).toBe('pending')
    expect(store.listStudyFreezes(study.id)).toEqual([])
  })

  it('does not trust caller-authored verification, asset metadata or arbitrary audit events', () => {
    const { store, project, study, contract } = fixture()
    store.recordAuditEvent(project.id, 'dataset-contract.source-verified', { actor: 'system-validation', contractId: contract.id, sourceChecked: true, verifier: 'local-delimited-file-v1' })
    expectSourceBlocked(store, study.id)
    expect(store.getResearchStudy(study.id)).toMatchObject({ gate1: 'pending' })
    expect(store.listStudyFreezes(study.id)).toHaveLength(0)
  })

  it('persists receipts bound to contract version/hash and actual source/columns across restart', () => {
    const { store, databasePath, study, contract, asset } = fixture()
    const checked = store.verifyDatasetContractSource(contract.id)
    expect(checked.status).toBe('verified')
    if (checked.status !== 'verified') throw new Error(checked.message)
    expect(checked.verification).toMatchObject({ contractId: contract.id, contractVersion: contract.version, assetId: asset.id, assetVersion: asset.version, sourceUri: asset.uri, header: ['x', 'y'], variables: ['x', 'y'], verifier: 'local-delimited-file-v1' })
    expect(checked.verification.sourceSha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(checked.verification.contractSha256).toMatch(/^[a-f0-9]{64}$/u)
    store.close(); stores.splice(stores.indexOf(store), 1)
    const reopened = new ResearchStore(databasePath); stores.push(reopened)
    const approved = gate(reopened, study.id)
    expect(approved.status).toBe('approved')
    if (approved.status !== 'approved') throw new Error('Expected source-backed approval')
    expect(approved.freeze?.snapshot.sourceVerifications).toEqual([checked.verification])
  })

  it('requires a new receipt when an unfrozen contract is revised', () => {
    const { store, study, contract } = fixture()
    expect(store.verifyDatasetContractSource(contract.id).status).toBe('verified')
    const revised = store.updateResearchDocument(contract.id, { expectedVersion: contract.version, payload: { ...contract.payload, notes: 'Updated source contract' } })
    expectSourceBlocked(store, study.id)
    const rechecked = store.verifyDatasetContractSource(contract.id)
    expect(rechecked).toMatchObject({ status: 'verified', verification: { contractVersion: revised.version } })
    expect(gate(store, study.id).status).toBe('approved')
  })

  it('rechecks changed source bytes and detaches the old immutable freeze from current inputs', () => {
    const { store, study, path, contract } = fixture()
    const original = store.verifyDatasetContractSource(contract.id)
    writeFileSync(path, 'x,y\n9,8\n')
    expectSourceBlocked(store, study.id)
    const current = store.verifyDatasetContractSource(contract.id)
    expect(current.status).toBe('verified')
    if (original.status !== 'verified' || current.status !== 'verified') throw new Error('Expected verified fixture')
    expect(current.verification.sourceSha256).not.toBe(original.verification.sourceSha256)
    const approved = gate(store, study.id)
    expect(approved.status).toBe('approved')
    const freezeId = store.getResearchStudy(study.id)!.currentFreezeId
    writeFileSync(path, 'x,y\n7,6\n')
    expectSourceBlocked(store, study.id)
    const refreshed = store.verifyDatasetContractSource(contract.id)
    expect(refreshed.status).toBe('verified')
    expect(store.getResearchStudy(study.id)!.currentFreezeId).toBeUndefined()
    expect(store.getResearchStudy(study.id)!.gate1).toBe('pending')
    expect(store.getResearchStudy(study.id)!.gate2).toBe('pending')
    expect(store.listStudyFreezes(study.id).map(item => item.id)).toContain(freezeId)
    expect(store.diagnoseResearchGate(study.id, 2)).toMatchObject({ status: 'proceedable', proceedable: true, readOnly: true })
  })

  it('rejects missing actual variables despite a claimed usable contract', () => {
    const { store, study, contract } = fixture({ variables: ['x', 'missing'] })
    expect(store.verifyDatasetContractSource(contract.id)).toMatchObject({ status: 'blocked', message: expect.stringContaining('absent') })
    expectSourceBlocked(store, study.id)
  })

  it('reaudits an approved Gate 2 when persisted Run state changes and keeps unchanged retries idempotent', () => {
    const { store, project, study, contract, databasePath } = fixture()
    expect(store.verifyDatasetContractSource(contract.id).status).toBe('verified')
    expect(gate(store, study.id).status).toBe('approved')
    const run = store.createRun({ projectId: project.id, name: 'Source run', command: 'synthetic', workingDirectory: project.rootPath, status: 'succeeded' })
    const evidence = store.registerResearchEvidence({ projectId: project.id, studyId: study.id, payload: { runId: run.id, needsReview: false } })
    const claim = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'claim', payload: { text: 'The synthetic estimate is positive', evidenceIds: [evidence.id] } })
    const first = store.approveResearchGate2Automatically(study.id, store.getResearchStudy(study.id)!.version)
    expect(first.status).toBe('approved')
    const version = first.study.version
    const retried = store.approveResearchGate2Automatically(study.id, version - 1)
    expect(retried).toMatchObject({ status: 'approved', study: { version } })
    // Terminal Run status is immutable in the normal API; simulate an external
    // persisted correction to ensure approval never caches evidence validity.
    const database = new DatabaseSync(databasePath)
    try { database.prepare("UPDATE runs SET status='failed',version=version+1 WHERE id=?").run(run.id) }
    finally { database.close() }
    expect(store.getResearchStudy(study.id)!.gate2).toBe('approved')
    const rechecked = store.approveResearchGate2Automatically(study.id, version)
    expect(rechecked.status).toBe('blocked')
    if (rechecked.status === 'blocked') expect(rechecked.blockers.map(item => item.code)).toContain('CLAIM_AUDIT_REQUIRED')
    expect(store.getResearchDocument(claim.id)!.payload.auditStatus).toBe('failed')
    expect(store.getResearchStudy(study.id)!.gate2).toBe('pending')
  })

  it('rejects foreign assets, sources outside the workspace and mismatched source identities', () => {
    const { store, project, study, contract } = fixture()
    const external = join(tempRoot(), 'outside.csv'); writeFileSync(external, 'x,y\n1,2\n')
    const outside = store.createDataAsset({ projectId: project.id, name: 'Outside input', uri: pathToFileURL(external).href, location: 'local', mediaType: 'text/csv' })
    let current = store.updateResearchDocument(contract.id, { expectedVersion: contract.version, payload: { ...contract.payload, assetId: outside.id, source: outside.uri } })
    expect(store.verifyDatasetContractSource(contract.id)).toMatchObject({ status: 'blocked', message: expect.stringContaining('inside') })
    const other = store.createProject({ name: 'Other project', rootPath: tempRoot() })
    const foreign = store.createDataAsset({ projectId: other.id, name: 'Foreign input', uri: outside.uri, location: 'local', mediaType: 'text/csv' })
    current = store.updateResearchDocument(contract.id, { expectedVersion: current.version, payload: { ...contract.payload, assetId: foreign.id, source: foreign.uri } })
    expect(store.verifyDatasetContractSource(contract.id)).toMatchObject({ status: 'blocked', message: expect.stringContaining('another project') })
    store.updateResearchDocument(contract.id, { expectedVersion: current.version, payload: { ...contract.payload, source: 'https://a-model-claimed-source.example/dataset' } })
    expect(store.verifyDatasetContractSource(contract.id)).toMatchObject({ status: 'blocked', message: expect.stringContaining('match') })
    expectSourceBlocked(store, study.id)
  })

  it('keeps remote contracts pending without treating model metadata as a remote verification', () => {
    const { store, project, study, contract } = fixture()
    const remote = store.createDataAsset({ projectId: project.id, name: 'Remote input', uri: 'https://example.org/actual.csv', location: 'web', mediaType: 'text/csv' })
    store.updateResearchDocument(contract.id, { expectedVersion: contract.version, payload: { ...contract.payload, assetId: remote.id, source: remote.uri } })
    expect(store.verifyDatasetContractSource(contract.id)).toMatchObject({ status: 'blocked', message: expect.stringContaining('local') })
    expectSourceBlocked(store, study.id)
  })

  it.each([
    { nhanesSurvey: { kind: 'summary', variable: 'x' } },
    { genetics: { analysis: 'mr', methods: ['ivw'] } },
  ])('does not use an unrelated local CSV receipt to approve formal remote inputs (%j)', remotePlan => {
    const { store, study, contract } = fixture()
    expect(store.verifyDatasetContractSource(contract.id).status).toBe('verified')
    const current = store.getResearchStudy(study.id)!
    const plan = store.getResearchDocument(current.currentPlanId!)!
    store.updateResearchDocument(plan.id, { expectedVersion: plan.version, payload: { ...plan.payload, ...remotePlan } })
    const result = gate(store, study.id)
    expect(result.status).toBe('blocked')
    if (result.status === 'blocked') expect(result.blockers).toContainEqual(expect.objectContaining({ code: 'CONTRACT_VERIFIER_UNAVAILABLE', documentId: plan.id }))
    expect(store.getResearchStudy(study.id)!.gate1).toBe('pending')
    expect(store.listStudyFreezes(study.id)).toEqual([])
  })

  it.each([
    { extension: '.csv', content: '\uFEFF"gene,name",y\r\nTP53,2\r\n', variables: ['gene,name', 'y'] },
    { extension: '.tsv', content: 'gene\ty\nTP53\t2\n', variables: ['gene', 'y'] },
  ])('reads real CSV/TSV headers including quotes and UTF-8 BOM ($extension)', options => {
    const { store, study, contract } = fixture(options)
    expect(store.verifyDatasetContractSource(contract.id).status).toBe('verified')
    expect(gate(store, study.id).status).toBe('approved')
  })

  it.each(['x,x\n1,2\n', 'x,y\n', '"x"garbage,y\n1,2\n', 'x,\n1,2\n'])('rejects malformed or incomplete source headers', content => {
    const { store, contract } = fixture({ content })
    expect(store.verifyDatasetContractSource(contract.id).status).toBe('blocked')
  })

  it('bounds source file and header sizes without trusting caller byte sizes', () => {
    const { store, path, contract } = fixture()
    truncateSync(path, 64 * 1024 * 1024 + 1)
    expect(store.verifyDatasetContractSource(contract.id)).toMatchObject({ status: 'blocked', message: expect.stringContaining('limit') })
    writeFileSync(path, 'x'.repeat(65537) + ',y\n1,2\n')
    expect(store.verifyDatasetContractSource(contract.id)).toMatchObject({ status: 'blocked', message: expect.stringContaining('limit') })
  })

  it('does not import receipts or promote imported snapshot metadata to trusted verification', () => {
    const { store, project, study, contract } = fixture()
    expect(store.verifyDatasetContractSource(contract.id).status).toBe('verified')
    expect(gate(store, study.id).status).toBe('approved')
    const imported = store.importResearchSnapshot(store.exportResearchSnapshot(project.id))
    const importedStudy = store.listResearchStudies(imported.id)[0]!
    expectSourceBlocked(store, importedStudy.id)
  })
})
