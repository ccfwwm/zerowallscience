import { expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ResearchStore } from '../../../store/src/index.js'
import { acceptedFijiReview, validateScratchTimeline, matchScratchBaseline } from '../src/host/fiji-review.js'
import { cfuMeasurement, colonyMeasurement, type ScratchImageConfig } from '../src/shared/fiji-experiments.js'

it('retains count-only results and rejects reciprocal dilution/unit mistakes',()=>{
 expect(cfuMeasurement({plateId:'P',colonyCount:4})).toMatchObject({colonyCount:4,cfuPerMl:null,dilutionFactor:null,platedVolumeMl:null})
 expect(cfuMeasurement({plateId:'P',colonyCount:4,dilutionFactor:1000,platedVolumeMl:.1}).cfuPerMl).toBe(40000)
 for(const dilutionFactor of [.001,0,-1,NaN,Infinity])expect(()=>cfuMeasurement({plateId:'P',colonyCount:4,dilutionFactor})).toThrow()
 expect(colonyMeasurement({wellId:'A1',independentCount:4,seededCells:100})).toMatchObject({colonyFormationFraction:.04})
 expect(colonyMeasurement({wellId:'A1',independentCount:4})).toMatchObject({colonyFormationFraction:null})
 expect(()=>colonyMeasurement({wellId:'A1',independentCount:4,seededCells:0})).toThrow()
})

it('requires the current accepted source-bound mask revision and area ROI ids',async()=>{
 const root=await mkdtemp(join(tmpdir(),'fiji-review-'));const store=new ResearchStore(join(root,'store.sqlite'))
 try{
  const project=store.createProject({name:'p',rootPath:root});const path=join(root,'image.pgm');await writeFile(path,'fixture');const asset=store.createDataAsset({projectId:project.id,name:'image',uri:pathToFileURL(path).href,location:'local',mediaType:'image/x-portable-graymap'});const sha256='a'.repeat(64)
  const payload={coordinates:{convention:'pixel-edge-top-left' as const,width:10,height:10,pages:1,calibration:null},rois:[{id:'r',name:'r',page:0,kind:'rectangle' as const,x:1,y:1,width:2,height:2},{id:'p',name:'p',page:0,kind:'point' as const,x:2,y:2}]}
  const first=store.createAnnotationRevision({projectId:project.id,assetId:asset.id,sourceSha256:sha256,expectedRevisionId:null,origin:'workbench',payload}).head
  const image={kind:'bacterial-cfu' as const,plateId:'p',threshold:128,polarity:'bright' as const,minArea:2,maxArea:50,roi:{x:0,y:0,width:10,height:10},review:{annotationRevisionId:first.id,excludedRoiIds:['r'],reason:'reflection'}}
  expect(acceptedFijiReview(store,project,asset.id,sha256,image)?.payload).toEqual(payload)
  expect(()=>acceptedFijiReview(store,project,asset.id,'b'.repeat(64),image)).toThrow('current accepted')
  expect(()=>acceptedFijiReview(store,project,asset.id,sha256,{...image,review:{...image.review,excludedRoiIds:['p']}})).toThrow('area ROIs')
  expect(()=>acceptedFijiReview(store,project,asset.id,sha256,{...image,review:{...image.review,excludedRoiIds:['r','r']}})).toThrow('Duplicate')
  const next=store.createAnnotationRevision({projectId:project.id,assetId:asset.id,sourceSha256:sha256,expectedRevisionId:first.id,origin:'fiji',payload}).head
  expect(()=>acceptedFijiReview(store,project,asset.id,sha256,image)).toThrow('current accepted')
  const conflict=store.createAnnotationRevision({projectId:project.id,assetId:asset.id,sourceSha256:sha256,expectedRevisionId:first.id,origin:'napari',payload});expect(conflict.conflict).toBe(true)
  expect(()=>acceptedFijiReview(store,project,asset.id,sha256,{...image,review:{...image.review,annotationRevisionId:conflict.revision.id}})).toThrow('current accepted')
  expect(acceptedFijiReview(store,project,asset.id,sha256,{...image,review:{...image.review,annotationRevisionId:next.id}})?.annotationRevisionId).toBe(next.id)
 }finally{store.close();await rm(root,{recursive:true,force:true})}
})

it('freezes time identity, baseline correspondence, expected times and pixel spacing',()=>{
 const image:ScratchImageConfig={kind:'scratch-wound',sampleId:'S1',time:'0h',initialArea:48,threshold:128,polarity:'bright',roi:{x:2,y:2,width:18,height:12},timeline:{fieldId:'F1',timeHours:0,expectedHours:[0,24,48],pixelSpacing:{x:1,y:1,unit:'um',source:'fixture'}}}
 validateScratchTimeline(image)
 expect(()=>validateScratchTimeline({...image,timeline:{...image.timeline!,timeHours:24}})).toThrow('baselineRunId')
 expect(()=>validateScratchTimeline({...image,timeline:{...image.timeline!,expectedHours:[0,0]}})).toThrow('unique')
 const baseline:any={experiment:'scratch-wound',measurements:[{remainingArea:48}],context:{image},reviewState:'current'}
 const later={...image,timeline:{...image.timeline!,timeHours:24,baselineRunId:'baseline'}}
 expect(matchScratchBaseline(later,baseline)).toBe(48)
 expect(()=>matchScratchBaseline({...later,sampleId:'S2'},baseline)).toThrow('sample/field')
 expect(()=>matchScratchBaseline({...later,timeline:{...later.timeline,pixelSpacing:{...later.timeline.pixelSpacing,x:2}}},baseline)).toThrow('spacing')
 expect(()=>matchScratchBaseline({...later,timeline:{...later.timeline,expectedHours:[0,24]}},baseline)).toThrow('expected hours')
 expect(()=>matchScratchBaseline(later,{...baseline,reviewState:'needs_recheck'})).toThrow('stale')
})
