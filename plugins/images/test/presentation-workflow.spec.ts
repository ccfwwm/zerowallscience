import { expect, it } from 'vitest'
import { editableReconstructionFailures, exportBlockers, exportRequirements, refreshPages, runPresentationImageTasks, validateEditablePagePlan, type PresentationWorkflow } from '../src/host/presentation-workflow.js'

it('runs page image tasks with bounded concurrency and stable result order', async () => {
  let active = 0
  let maximum = 0
  const result = await runPresentationImageTasks([
    { id: 'page-1', page: 1, run: async () => { active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 8)); active--; return 'one' } },
    { id: 'page-2', page: 2, run: async () => { active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 2)); active--; return 'two' } },
    { id: 'page-3', page: 3, run: async () => { active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 4)); active--; return 'three' } },
  ], 2)
  expect(result).toEqual(['one', 'two', 'three'])
  expect(maximum).toBeLessThanOrEqual(2)
})
it('validates native editable plans and requires real text, table and chart fields', () => {
  const plan = validateEditablePagePlan(1, [
    { elementId: 'title', elementType: 'text', bounds: [40, 30, 800, 60], content: { text: 'Editable title' } },
    { elementId: 'table', elementType: 'table', bounds: [50, 120, 400, 220], rows: [['A', 'B']] },
    { elementId: 'chart', elementType: 'chart', bounds: [500, 120, 400, 220], data: { labels: ['A'] }, series: [{ name: 'value', values: [1] }] },
  ], 'template-page-1')
  expect(plan).toMatchObject({ page: 1, templateAssetId: 'template-page-1' })
  expect(() => validateEditablePagePlan(1, [{ elementId: 'bad', elementType: 'text', bounds: [0, 0, 20, 20] }])).toThrow('content.text')
  expect(() => validateEditablePagePlan(1, [{ elementId: 'bad', elementType: 'shape', bounds: [0, 0, 0, 20] }])).toThrow('positive bounds')
  expect(() => validateEditablePagePlan(1, [{ elementId: 'bad', elementType: 'chart', bounds: [0, 0, 20, 20], data: {} }])).toThrow('data and series')
})

it('checks reconstructed native objects against the editable plan', () => {
  const plan = validateEditablePagePlan(1, [
    { elementId: 'title', elementType: 'text', bounds: [10, 10, 200, 50], content: { text: 'Editable title' } },
    { elementId: 'chart', elementType: 'chart', bounds: [20, 100, 300, 200], data: { labels: ['A'] }, series: [{ name: 'value', values: [1] }] },
  ])
  const snapshot = { page: 1, id: 'pages/01.page', fingerprint: 'rev-1', data: { elements: [
    { elementId: 'title', elementType: 'text', bounds: [10, 10, 200, 50], content: { text: 'Editable title' } },
    { elementId: 'chart', elementType: 'chart', bounds: [20, 100, 300, 200], data: { labels: ['A'] }, series: [{ name: 'value', values: [1] }] },
  ] } }
  expect(editableReconstructionFailures(snapshot, plan)).toEqual([])
  expect(editableReconstructionFailures({ ...snapshot, data: { elements: [{ ...snapshot.data.elements[0], content: { text: 'wrong' } }, snapshot.data.elements[1]] } }, plan)).toEqual(['Changed editable text title.'])
  expect(editableReconstructionFailures({ ...snapshot, data: { elements: [snapshot.data.elements[0]] } }, plan)).toEqual(['Missing or changed editable PPTD object chart.'])
})

it('invalidates only changed pages and blocks export until checks, render and review match', () => {
  const snapshots = [1, 2].map(page => ({ page, id: `pages/${page}.page`, fingerprint: `page-${page}`, data: {} }))
  const state: PresentationWorkflow = { schemaVersion: 3, spec: 'spec.json', manifest: 'assets.json', mode: 'new', outputMode: 'editable', dir: 'deck', journal: 'journal', changedPages: [], pages: {}, phase: 'built' }
  refreshPages(state, snapshots, { 1: 'asset-a', 2: 'asset-b' })
  expect(state.changedPages).toEqual([1, 2])
  for (const page of Object.values(state.pages)) {
    page.checks.ppt_check = { fingerprint: page.fingerprint, findings: [] }
    page.checks.ppt_render = { fingerprint: page.fingerprint, findings: [], screenshot: `page-${page.id}.png` }
    page.review = { fingerprint: page.fingerprint, observations: 'Viewed the rendered page and confirmed text, image bounds and contrast.', waivers: [] }
  }
  expect(exportBlockers(state)).toEqual([])
  state.pages[2]!.fingerprint = 'changed'
  expect(exportBlockers(state)).toEqual([2])
  expect(exportRequirements(state)).toMatchObject([{ page: 2, missingChecks: true, missingRender: true, missingReview: true }])
  refreshPages(state, snapshots.slice(0, 1), { 1: 'asset-a' })
  expect(exportBlockers(state)).toEqual([])
  expect(state.changedPages).toEqual([1])
})
