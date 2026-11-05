import { expect, it } from 'vitest'
import { editableReconstructionFailures, exportBlockers, exportRequirements, refreshPages, runPresentationImageTasks, validateEditablePagePlan, type PresentationWorkflow } from '../src/host/presentation-workflow.js'
import { formatReconstructionWorkerError, reconstructionCapabilityMessage, validateReconstructionReceipt, reconstructionQualityPassed, assertCurrentReconstructionEvidence, invalidateReconstructionEvidence, reconstructionComparisonImproved } from '../src/host/presentation-reconstruction.js'

it('keeps the best actual render when a text repair damages the rest of the slide',()=>{
  const best={ssim:.95,nativeTextMae:40,textEdgeP95:5}
  expect(reconstructionComparisonImproved({ssim:.96,nativeTextMae:30,textEdgeP95:4},best)).toBe(true)
  expect(reconstructionComparisonImproved({ssim:.90,nativeTextMae:20,textEdgeP95:2},best)).toBe(false)
  expect(reconstructionComparisonImproved({ssim:.96,nativeTextMae:42,textEdgeP95:5},best)).toBe(false)
})

it('rejects repairs that lose measurable text, worsen glyph outlines or lower page fidelity',()=>{
  const best={ssim:.95,nativeTextMae:40,textEdgeP95:5,glyphEdgeP95:3,nativeTextGeometryCoverage:1}
  const better={...best,nativeTextMae:30,textEdgeP95:3,glyphEdgeP95:2}
  expect(reconstructionComparisonImproved(better,best)).toBe(true)
  expect(reconstructionComparisonImproved({...better,nativeTextGeometryCoverage:.9},best)).toBe(false)
  expect(reconstructionComparisonImproved({...better,glyphEdgeP95:8},best)).toBe(false)
  expect(reconstructionComparisonImproved({...better,ssim:.948},best)).toBe(false)
})

it('separates completed processing from quality approval and invalidates edited-page evidence', () => {
  const quality={contentVerified:true,inventoryVerified:true,scientificImagesVerified:true,rasterTexts:0}
  const comparison={ssim:.99,textEdgeP95:1.5,glyphEdgeP95:1.5,nativeTextGeometryCoverage:1}
  expect(reconstructionQualityPassed(quality,comparison)).toBe(true)
  for(const patch of [{rasterTexts:1},{contentVerified:false},{inventoryVerified:false}])expect(reconstructionQualityPassed({...quality,...patch},comparison)).toBe(false)
  expect(reconstructionQualityPassed(quality,{ssim:.999,textEdgeP95:null})).toBe(false)
  expect(reconstructionQualityPassed(quality,{...comparison,glyphEdgeP95:6})).toBe(false)
  expect(reconstructionQualityPassed(quality,{...comparison,nativeTextGeometryCoverage:.9})).toBe(false)
  expect(reconstructionQualityPassed(quality,{ssim:.99,textEdgeP95:1.5})).toBe(false)
  const job:any={page:1,status:'processing',quality:{finalRender:comparison},evidenceFingerprint:'v1',qualityStatus:'passed'}
  expect(()=>assertCurrentReconstructionEvidence(job,'v1')).toThrow('render evidence')
  job.status='complete';expect(()=>assertCurrentReconstructionEvidence(job,'v1')).not.toThrow()
  expect(()=>assertCurrentReconstructionEvidence(job,'v2')).toThrow('render evidence')
  const state:any={reconstruction:{jobs:{1:job},approval:{pages:{1:'v1'}}}}
  invalidateReconstructionEvidence(state,[{page:1,fingerprint:'v2'}])
  expect(job.qualityStatus).toBe('review');expect(job.evidenceFingerprint).toBeUndefined();expect(state.reconstruction.approval).toBeUndefined()
})

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
it('explains how to install the signed reconstruction capability when its runtime modules are missing', () => {
  expect(formatReconstructionWorkerError("ModuleNotFoundError: No module named 'rapidocr_onnxruntime'")).toContain('PPT_RECONSTRUCTION_CAPABILITY_MISSING')
  expect(reconstructionCapabilityMessage()).toContain('ppt-reconstruction')
  expect(formatReconstructionWorkerError('OCR exceeded its page budget.')).toBe('OCR exceeded its page budget.')
})
it('rejects unsafe worker receipts before they can enter a presentation project', () => {
  const valid = { schemaVersion: 1, width: 960, height: 540, files: { 'visual-1.png': 'a'.repeat(64) }, elements: [
    { elementId: 'visual-1', elementType: 'image', src: 'visual-1.png', bounds: [0, 0, 400, 300] },
    { elementId: 'title', elementType: 'text', content: { text: 'Research' }, bounds: [20, 20, 300, 50] },
  ] }
  expect(() => validateReconstructionReceipt(valid, 960, 540)).not.toThrow()
  for (const patch of [{ src: '../visual-1.png' }, { bounds: [900, 0, 400, 300] }, { elementType: 'script' }, { bounds: [0, 0, Number.NaN, 300] }]) {
    expect(() => validateReconstructionReceipt({ ...valid, elements: [{ ...valid.elements[0], ...patch }] }, 960, 540)).toThrow()
  }
  expect(() => validateReconstructionReceipt({ ...valid, files: {} }, 960, 540)).toThrow('path/hash')
  expect(() => validateReconstructionReceipt({ ...valid, elements: [valid.elements[0], valid.elements[0]] }, 960, 540)).toThrow('ID')
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
