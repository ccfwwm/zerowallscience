import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchStore } from '../src/index.js'

const roots: string[] = []
afterEach(() => { vi.useRealTimers(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'research-context-refinement-')); roots.push(root)
  return { path: join(root, 'store.sqlite'), input: { sessionId: 's1', rootPath: root, projectName: 'Research' } }
}

it('adopts a first concrete goal into an untouched automatic general draft and retains its IDs', () => {
  const f = fixture(); const store = new ResearchStore(f.path)
  try {
    const initial = store.ensureResearchContext(f.input)
    const documentIds = store.listResearchDocuments(initial.study.id).map(item => item.id).sort()
    const concrete = store.ensureResearchContext({ ...f.input, target: 'Estimate BMI association with mortality in adults' })
    expect(concrete.study.id).toBe(initial.study.id)
    expect(concrete.createdStudy).toBe(false)
    expect(store.listResearchDocuments(initial.study.id).map(item => item.id).sort()).toEqual(documentIds)
    expect(store.getResearchDocument(concrete.study.currentQuestionId!)?.payload.text).toBe('Estimate BMI association with mortality in adults')
  } finally { store.close() }
})

it('reuses a safe additive goal refinement and continuation after restart', () => {
  const f = fixture(); let store = new ResearchStore(f.path)
  const target = 'Estimate BMI association with mortality in adults'
  const first = store.ensureResearchContext({ ...f.input, target })
  const refined = store.ensureResearchContext({ ...f.input, target: `${target}, adjusting for age and sex` })
  expect(refined.study.id).toBe(first.study.id)
  expect(store.listResearchStudies(first.project.id)).toHaveLength(1)
  store.close(); store = new ResearchStore(f.path)
  try {
    for (const continuation of ['', '请继续', '继续前面的需求', '继续前面的分析。', '请继续之前的研究', '进度如何？', '现在进展怎么样', '目前到哪一步了', 'Please continue.', 'Please continue the previous analysis.', "What's the current status?"]) {
      const resumed = store.ensureResearchContext({ ...f.input, target: continuation })
      expect(resumed.study.id).toBe(first.study.id)
      expect(resumed.targetFingerprint).toBe(refined.targetFingerprint)
    }
    expect(store.listResearchDocuments(first.study.id)).toHaveLength(3)
  } finally { store.close() }
})

it('keeps continuation-only first messages as pending context without inventing a research objective', () => {
  const f = fixture(); const store = new ResearchStore(f.path)
  try {
    const context = store.ensureResearchContext({ ...f.input, target: '继续前面的需求' })
    expect(store.getResearchDocument(context.study.currentQuestionId!)?.payload).toMatchObject({ text: '待补充：研究问题', status: 'incomplete', missing: ['用户研究目标'] })
    const concrete = store.ensureResearchContext({ ...f.input, target: 'Estimate BMI association with mortality in adults' })
    expect(concrete.study.id).toBe(context.study.id)
    expect(store.listResearchStudies(context.project.id)).toHaveLength(1)
  } finally { store.close() }
})

it('retains the latest target when several bindings share the same wall-clock millisecond', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-23T00:00:00.000Z'))
  const f = fixture(); let store = new ResearchStore(f.path)
  const target = 'Estimate BMI association with mortality in adults'
  const first = store.ensureResearchContext({ ...f.input, target })
  const refined = store.ensureResearchContext({ ...f.input, target: `${target}, adjusting for age and sex` })
  expect(refined.study.id).toBe(first.study.id)
  store.close(); store = new ResearchStore(f.path)
  try {
    expect(store.ensureResearchContext({ ...f.input, target: '继续前面的分析' }).targetFingerprint).toBe(refined.targetFingerprint)
    // An upsert of an older alias also becomes the latest durable binding.
    store.ensureResearchContext({ ...f.input, target })
    expect(store.ensureResearchContext({ ...f.input, target: '继续前面的分析' }).targetFingerprint).toBe(first.targetFingerprint)
  } finally { store.close() }
})

it('reuses a populated legacy selection with exactly the same objective without changing existing content', () => {
  const f = fixture(); let store = new ResearchStore(f.path)
  const target = 'Estimate BMI association with mortality in adults'
  const project = store.createProject({ name: f.input.projectName, rootPath: f.input.rootPath })
  const selected = store.createResearchStudy({ projectId: project.id, title: target })
  const question = store.createResearchDocument({ projectId: project.id, studyId: selected.id, kind: 'question', payload: { origin: 'user', text: target, population: 'adults', outcome: 'mortality', customField: 'retain me' } })
  store.updateResearchStudy(selected.id, { expectedVersion: store.getResearchStudy(selected.id)!.version, currentQuestionId: question.id })
  store.setSessionResearchStudy(project.id, f.input.sessionId, selected.id)
  const before = store.getResearchStudy(selected.id)
  const documents = store.listResearchDocuments(selected.id)
  store.close(); store = new ResearchStore(f.path)
  try {
    const continued = store.ensureResearchContext({ ...f.input, target: '继续前面的需求' })
    const matching = store.ensureResearchContext({ ...f.input, target })
    expect(continued.study.id).toBe(selected.id)
    expect(matching.study.id).toBe(selected.id)
    expect(matching.createdStudy).toBe(false)
    expect(store.getResearchStudy(selected.id)).toEqual(before)
    expect(store.listResearchDocuments(selected.id)).toEqual(documents)
    expect(store.listResearchStudies(project.id)).toHaveLength(1)
    const unrelated = store.ensureResearchContext({ ...f.input, target: 'Compare breast cancer expression between tumor subtypes' })
    expect(unrelated.study.id).not.toBe(selected.id)
    expect(store.listResearchDocuments(selected.id)).toEqual(documents)
  } finally { store.close() }
})

it.each([false, true])('creates pending drafts for a selected blank Study with an explicit fingerprint: %s', withFingerprint => {
  const f = fixture(); const store = new ResearchStore(f.path)
  try {
    const target = 'Estimate BMI association with mortality in adults'
    const context = store.ensureResearchContext({ ...f.input, target })
    const selected = store.createResearchStudy({ projectId: context.project.id, title: 'User selection' })
    store.setSessionResearchStudy(context.project.id, f.input.sessionId, selected.id, withFingerprint ? context.targetFingerprint : undefined)
    const ensured = store.ensureResearchContext({ ...f.input, target })
    expect(ensured.study.id).toBe(selected.id)
    expect(ensured.createdStudy).toBe(false)
    const documents = store.listResearchDocuments(selected.id)
    expect(documents.map(item => item.kind).sort()).toEqual(['analysis-plan', 'dataset-contract', 'question'])
    expect(documents.find(item => item.kind === 'question')?.payload.text).toBe(target)
    expect(documents.find(item => item.kind === 'dataset-contract')?.payload).toMatchObject({ sourceStatus: 'unknown', applicability: 'pending' })
    expect(documents.find(item => item.kind === 'analysis-plan')?.payload).toMatchObject({ status: 'pending', exploratory: true })
    expect(store.listResearchTasks(selected.id)).toHaveLength(0)
    const repeated = store.ensureResearchContext({ ...f.input, target })
    expect(repeated.study.id).toBe(selected.id)
    expect(store.listResearchDocuments(selected.id).map(item => item.id).sort()).toEqual(documents.map(item => item.id).sort())
  } finally { store.close() }
})

it('fills a selected blank Study after a continuation initially supplied only its durable goal fingerprint', () => {
  const f = fixture(); const store = new ResearchStore(f.path)
  try {
    const target = 'Estimate BMI association with mortality in adults'
    const context = store.ensureResearchContext({ ...f.input, target })
    const selected = store.createResearchStudy({ projectId: context.project.id, title: 'Selected blank' })
    store.setSessionResearchStudy(context.project.id, f.input.sessionId, selected.id, context.targetFingerprint)
    const continued = store.ensureResearchContext({ ...f.input, target: '继续前面的需求' })
    const ids = store.listResearchDocuments(selected.id).map(item => item.id).sort()
    expect(continued.study.id).toBe(selected.id)
    expect(store.getResearchDocument(continued.study.currentQuestionId!)?.payload.status).toBe('incomplete')
    const concrete = store.ensureResearchContext({ ...f.input, target })
    expect(concrete.study.id).toBe(selected.id)
    expect(store.getResearchDocument(concrete.study.currentQuestionId!)?.payload.text).toBe(target)
    expect(store.listResearchDocuments(selected.id).map(item => item.id).sort()).toEqual(ids)
  } finally { store.close() }
})

it('reuses exactly matching frozen legacy Studies in a new session without altering the freeze', () => {
  const f = fixture(); const store = new ResearchStore(f.path)
  try {
    const target = 'Among adults, does BMI associate with mortality?'
    const project = store.createProject({ name: f.input.projectName, rootPath: f.input.rootPath })
    const selected = store.createResearchStudy({ projectId: project.id, title: target })
    const question = store.createResearchDocument({ projectId: project.id, studyId: selected.id, kind: 'question', payload: { text: target, population: 'adults', outcome: 'mortality', estimand: 'association' } })
    const contract = store.createResearchDocument({ projectId: project.id, studyId: selected.id, kind: 'dataset-contract', payload: { applicability: 'usable', sourceStatus: 'supported', source: 'test-fixture', availableVariables: ['BMI', 'mortality'] } })
    const plan = store.createResearchDocument({ projectId: project.id, studyId: selected.id, kind: 'analysis-plan', payload: { method: 'fixture', inputs: [contract.id], stoppingConditions: ['stop'], exploratory: false } })
    const linked = store.updateResearchStudy(selected.id, { expectedVersion: store.getResearchStudy(selected.id)!.version, currentQuestionId: question.id, currentPlanId: plan.id })
    const approved = store.approveResearchGate(selected.id, 1, 'approved', linked.version, 'fixture')
    const freeze = store.freezeResearchStudy(selected.id, approved.version)
    const before = store.getResearchStudy(selected.id)
    const documents = store.listResearchDocuments(selected.id)
    // Legacy selection has no session-context row to establish compatibility.
    store.setSessionResearchStudy(project.id, 'legacy-frozen', selected.id)
    expect(store.ensureResearchContext({ ...f.input, sessionId: 'legacy-frozen', target }).study.id).toBe(selected.id)
    // Current Host selection supplies the new session's fingerprint.
    const automatic = store.ensureResearchContext({ ...f.input, target })
    expect(automatic.study.id).not.toBe(selected.id)
    expect(store.setSessionResearchStudy(project.id, f.input.sessionId, selected.id, automatic.targetFingerprint)?.id).toBe(selected.id)
    expect(store.ensureResearchContext({ ...f.input, target }).study.id).toBe(selected.id)
    expect(store.listStudyFreezes(selected.id)).toEqual([freeze])
    expect(store.listResearchDocuments(selected.id)).toEqual(documents)
    expect(store.getResearchStudy(selected.id)).toEqual(before)
    const unrelated = store.ensureResearchContext({ ...f.input, target: 'Estimate diabetes incidence in children' })
    expect(unrelated.study.id).not.toBe(selected.id)
    expect(store.setSessionResearchStudy(project.id, f.input.sessionId, selected.id, unrelated.targetFingerprint)?.id).toBe(unrelated.study.id)
    expect(store.listStudyFreezes(selected.id)).toEqual([freeze])
  } finally { store.close() }
})

it('keeps explicit selection isolated when the same session moves between workspaces', () => {
  const f = fixture(); const store = new ResearchStore(f.path)
  try {
    const target = 'Estimate BMI association with mortality in adults'
    const first = store.ensureResearchContext({ ...f.input, target })
    const selected = store.createResearchStudy({ projectId: first.project.id, title: 'Selected' })
    store.setSessionResearchStudy(first.project.id, f.input.sessionId, selected.id, first.targetFingerprint)
    const selectedContext = store.ensureResearchContext({ ...f.input, target })
    const otherWorkspace = store.ensureResearchContext({ ...f.input, rootPath: join(f.input.rootPath, 'other-workspace'), target })
    expect(otherWorkspace.project.id).not.toBe(first.project.id)
    expect(otherWorkspace.study.id).not.toBe(selected.id)
    expect(() => store.setSessionResearchStudy(otherWorkspace.project.id, f.input.sessionId, selected.id, otherWorkspace.targetFingerprint)).toThrow('current project')
    const resumed = store.ensureResearchContext({ ...f.input, target: '继续前面的分析' })
    expect(resumed.study.id).toBe(selected.id)
    expect(resumed.targetFingerprint).toBe(selectedContext.targetFingerprint)
  } finally { store.close() }
})

it('never rewrites populated draft content or aliases distinct scientific objectives', () => {
  const f = fixture(); const store = new ResearchStore(f.path)
  try {
    const target = 'Estimate BMI association with mortality in adults'
    const first = store.ensureResearchContext({ ...f.input, target })
    const question = store.getResearchDocument(first.study.currentQuestionId!)!
    store.updateResearchDocument(question.id, { expectedVersion: question.version, payload: { ...question.payload, population: 'adults' } })
    const refined = store.ensureResearchContext({ ...f.input, target: `${target}, adjusting for age and sex` })
    expect(refined.study.id).not.toBe(first.study.id)
    expect(store.getResearchDocument(question.id)?.payload).toMatchObject({ text: target, population: 'adults' })
    const other = store.ensureResearchContext({ ...f.input, target: 'Compare breast cancer expression between tumor subtypes' })
    expect(other.study.id).not.toBe(refined.study.id)
    expect(store.listResearchStudies(first.project.id)).toHaveLength(3)
  } finally { store.close() }
})
