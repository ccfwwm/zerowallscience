import type { ResearchStore, ProjectRecord, ImageAnnotations } from '@zerowallscience/research-store'
import type { FijiImageConfig, FijiExperimentResult, ScratchImageConfig, ScratchMeasurement } from '../shared/fiji-experiments.js'

export function acceptedFijiReview(store: ResearchStore, project: ProjectRecord, assetId: string, sha256: string, image: FijiImageConfig) {
 const review=image.review
 if(!review)return undefined
 if(typeof review.reason!=='string'||!review.reason.trim()||review.reason.length>2000)throw new Error('Mask review reason is required (up to 2000 characters).')
 const revisions=store.listAnnotationRevisions(project.id,assetId)
 const head=revisions.filter(item=>item.status==='accepted'&&item.sourceSha256===sha256).at(-1)
 if(!head||head.id!==review.annotationRevisionId)throw new Error('Select the current accepted annotation revision matching this source hash.')
 if(!Array.isArray(review.excludedRoiIds)|| (review.foregroundRoiIds!==undefined&&!Array.isArray(review.foregroundRoiIds)))throw new Error('Review regions must be arrays of saved ROI IDs.')
 for(const ids of [review.excludedRoiIds,review.foregroundRoiIds??[]]){
  if(new Set(ids).size!==ids.length)throw new Error('Duplicate review ROI ID.')
  for(const id of ids){const roi=head.payload.rois.find(item=>item.id===id);if(!roi||roi.kind==='point'||roi.page!==0)throw new Error('Mask review requires existing page-0 area ROIs, not count points.')}
 }
 return {...review,payload:head.payload as ImageAnnotations}
}

export function validateScratchTimeline(image: ScratchImageConfig): void {
 const t=image.timeline;if(!t)return
 if(typeof t.fieldId!=='string'||!t.fieldId.trim()||!Number.isFinite(t.timeHours)||t.timeHours<0)throw new Error('Scratch timeline requires fieldId and nonnegative timeHours.')
 if(!Array.isArray(t.expectedHours)||t.expectedHours.length<1||t.expectedHours.length>100||!t.expectedHours.every(v=>Number.isFinite(v)&&v>=0)||new Set(t.expectedHours).size!==t.expectedHours.length||!t.expectedHours.includes(0)||!t.expectedHours.includes(t.timeHours))throw new Error('Expected hours must be unique, include baseline 0 and current time, and contain at most 100 time points.')
 const p=t.pixelSpacing;if(!p||![p.x,p.y].every(v=>Number.isFinite(v)&&v>0)||!['um','mm'].includes(p.unit)||typeof p.source!=='string'||!p.source.trim())throw new Error('A sourced physical pixel spacing is required for a linked scratch sequence.')
 if(t.timeHours===0&&t.baselineRunId)throw new Error('Baseline cannot depend on another baseline Run.')
 if(t.timeHours>0&&!t.baselineRunId)throw new Error('A successful baselineRunId is required for follow-up time points.')
}

export function matchScratchBaseline(image: ScratchImageConfig, baseline: FijiExperimentResult): number {
 const current=image.timeline!;const previous=baseline.context?.image
 if(baseline.experiment!=='scratch-wound'||!previous||previous.kind!=='scratch-wound'||!previous.timeline||previous.timeline.timeHours!==0||previous.sampleId!==image.sampleId||previous.timeline.fieldId!==current.fieldId)throw new Error('Baseline sample/field or time identity does not match.')
 if(JSON.stringify([...previous.timeline.expectedHours].sort((a,b)=>a-b))!==JSON.stringify([...current.expectedHours].sort((a,b)=>a-b)))throw new Error('Follow-up expected hours differ from the baseline plan.')
 if(baseline.reviewState==='needs_recheck')throw new Error('Baseline is stale; recompute and review it before a new follow-up.')
 const a=previous.timeline.pixelSpacing,b=current.pixelSpacing
 if(a.x!==b.x||a.y!==b.y||a.unit!==b.unit||(['x','y','width','height'] as const).some(key=>previous.roi[key]!==image.roi[key]))throw new Error('Linked scratch images must use the same declared physical spacing and ROI; register a revised plan for geometry changes.')
 const area=(baseline.measurements[0] as ScratchMeasurement)?.remainingArea
 if(!Number.isFinite(area)||area<=0)throw new Error('Baseline wound area must be positive.')
 return area
}
