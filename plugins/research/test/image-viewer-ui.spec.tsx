// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ImageViewer } from '../src/client/image-viewer.js'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
beforeEach(() => { vi.stubGlobal('PointerEvent', MouseEvent); SVGElement.prototype.setPointerCapture = vi.fn() })
const ok = (value: unknown) => ({ ok:true,value })
const coordinates = {convention:'pixel-edge-top-left',width:2000,height:1000,pages:1,calibration:null}
const view = {id:'v',assetId:'a',tool:'image',version:1,state:{page:0,zoom:1,panX:0,panY:0}}
const image = {sourceSha256:'a'.repeat(64),coordinates,format:'png',channels:1,depth:'uchar',page:0,previewWidth:1200,previewHeight:600,pngBase64:'AA==',notes:[],axes:{order:'XYZCT',sizes:{X:2000,Y:1000,Z:2,C:3,T:4},physicalSize:{x:.5,y:.5,unit:'um'},position:{page:0,z:0,c:0,t:0}}}
const payload = {coordinates,rois:[]}
function fixture() {
  return vi.fn(async (input:any) => {
    if(input.action==='list') return ok({assets:[{id:'a',name:'Test image',uri:'file:///image.png',location:'local'}],viewers:[view]})
    if(input.action==='image_read') return ok({viewer:view,image,annotations:[]})
    if(input.action==='image_save') return ok({viewer:{...view,version:2,state:input.imageState},image,annotations:[]})
    if(input.action==='annotation_save') return ok({viewer:view,annotations:[],annotationHead:{id:'r1',payload:input.annotation.payload},annotationSave:{conflict:false}})
    return ok({})
  })
}
async function canvas(scienceViewer:any) {
  render(<ImageViewer remote={{scienceViewer} as any} sessionId="s1" />)
  fireEvent.click(await screen.findByRole('tab',{name:'Test image · v1'}))
  const canvas=await screen.findByLabelText('图像 ROI 画布')
  vi.spyOn(canvas,'getBoundingClientRect').mockReturnValue({x:0,y:0,left:0,top:0,right:1000,bottom:500,width:1000,height:500,toJSON:()=>({})})
  return canvas
}
it('maps a dragged rectangle into original pixel coordinates, not preview coordinates',async()=>{
  const scienceViewer=fixture(); const surface=await canvas(scienceViewer)
  fireEvent.pointerDown(surface,{clientX:10,clientY:20,button:0,pointerId:1})
  fireEvent.pointerUp(surface,{clientX:14,clientY:24,button:0,pointerId:1})
  fireEvent.click(screen.getByRole('button',{name:'保存 ROI 修订'}))
  await waitFor(()=>expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({action:'annotation_save',sessionId:'s1',expectedVersion:1,annotation:{expectedRevisionId:null,payload:{coordinates,rois:[expect.objectContaining({kind:'rectangle',x:20,y:40,width:8,height:8,page:0})]}}})))
})
it('shows verified OME axis order, dimensions, position and calibration',async()=>{
  const scienceViewer=fixture(); await canvas(scienceViewer)
  const axes = screen.getByLabelText('OME 轴位置').textContent
  expect(axes).toContain('OME XYZCT')
  expect(axes).toContain('Z2 · C3 · T4')
  expect(axes).toContain('当前页 0 · Z0 · C0 · T0')
  expect(axes).toContain('像素 0.5×0.5 um/px')
})
it('uses persisted zoom/pan for points and refuses drawing against an unsaved view',async()=>{
  const scienceViewer=fixture(); const surface=await canvas(scienceViewer)
  fireEvent.change(screen.getByLabelText('ROI 绘制方式'),{target:{value:'point'}})
  fireEvent.change(screen.getByLabelText('缩放'),{target:{value:'2'}})
  fireEvent.pointerDown(surface,{clientX:20,clientY:20,button:0,pointerId:1})
  expect(screen.getByLabelText('ROI 列表').children).toHaveLength(0)
  fireEvent.click(screen.getByRole('button',{name:'保存图像视角'}))
  await waitFor(()=>expect(screen.queryByText('视角尚未保存；保存后再绘制标注。')).toBeNull())
  fireEvent.pointerDown(surface,{clientX:20,clientY:20,button:0,pointerId:1})
  fireEvent.click(screen.getByRole('button',{name:'保存 ROI 修订'}))
  await waitFor(()=>expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({action:'annotation_save',expectedVersion:2,annotation:{expectedRevisionId:null,payload:{coordinates,rois:[expect.objectContaining({kind:'point',x:20,y:20})]}}})))
})
it('retains conflict status and requires explicit adoption before saving over the latest head',async()=>{
  const scienceViewer=fixture(); const surface=await canvas(scienceViewer)
  const current = {id:'head2',revision:2,status:'accepted',origin:'workbench',payload}
  const branch = {id:'conflict3',revision:3,status:'conflict',origin:'workbench',payload:{...payload,rois:[{id:'p',name:'Recovered point',kind:'point',x:5,y:6,page:0}]}}
  scienceViewer.mockImplementation(async input => input.action==='list' ? ok({assets:[],viewers:[view]}) : ok({viewer:view,annotations:[current,branch],annotationHead:current,annotationSave:{conflict:true,head:current,revision:branch}}))
  fireEvent.pointerDown(surface,{clientX:10,clientY:20,button:0,pointerId:1})
  fireEvent.pointerUp(surface,{clientX:14,clientY:24,button:0,pointerId:1})
  fireEvent.click(screen.getByRole('button',{name:'保存 ROI 修订'}))
  expect(await screen.findByRole('status')).toHaveProperty('textContent',expect.stringContaining('冲突分支'))
  fireEvent.click(screen.getByRole('button',{name:'采用修订 3 的内容再保存'}))
  fireEvent.click(screen.getByRole('button',{name:'保存 ROI 修订'}))
  await waitFor(()=>expect(scienceViewer).toHaveBeenLastCalledWith(expect.objectContaining({action:'list'})))
  expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({action:'annotation_save',annotation:{expectedRevisionId:'head2',payload:branch.payload}}))
})
it('restores native return actions from Host records and keeps collection conflicts visible',async()=>{
  const scienceViewer=fixture(); const original=scienceViewer.getMockImplementation()!
  scienceViewer.mockImplementation(async input=>{
    if(input.action==='native_status')return ok({launches:[{launchId:'native',id:'napari',createdAt:'now',status:'unobserved',annotationBridge:{viewerId:'v'}}]})
    if(input.action==='annotation_collect')return ok({viewer:view,annotations:[],annotationSave:{conflict:true},artifact:{id:'artifact',uri:'file:///return.json',checksum:'hash'}})
    return original(input)
  })
  await canvas(scienceViewer)
  fireEvent.click(await screen.findByRole('button',{name:'收取 napari 标注回传'}))
  await waitFor(()=>expect(scienceViewer).toHaveBeenCalledWith({action:'annotation_collect',sessionId:'s1',viewerId:'v',expectedVersion:1,launchId:'native'}))
  expect(await screen.findByRole('status')).toHaveProperty('textContent',expect.stringContaining('冲突分支'))
})

it('runs accepted ROI intensity analysis and renders the traceable result', async () => {
  const current = { id: 'head', revision: 1, status: 'accepted', origin: 'workbench', payload: { ...payload, rois: [{ id: 'r1', name: 'ROI 1', kind: 'rectangle', page: 0, x: 1, y: 1, width: 8, height: 8 }] } }
  const analysis = { runner: 'zerowall-image-intensity/7.0.0-1', sourceAssetId: 'a', sourceSha256: 'a'.repeat(64), viewerId: 'v', viewerVersion: 1, annotationRevisionId: 'head', sourceWidth: 2000, sourceHeight: 1000, sourcePages: 1, calibration: null, rois: [{ roiId: 'r1', name: 'ROI 1', kind: 'rectangle', page: 0, pixelCount: 64, channels: 1, sum: [6400], mean: [100], min: [100], max: [100], standardDeviation: [0] }], notes: ['统计来自原始解码像素。'] }
  const scienceViewer = vi.fn(async (input: any) => {
    if (input.action === 'list') return ok({ assets: [{ id: 'a', name: 'Test image', uri: 'file:///image.png', location: 'local' }], viewers: [view] })
    if (input.action === 'native_status') return ok({ launches: [] })
    if (input.action === 'image_read') return ok({ viewer: view, image, annotations: [current], annotationHead: current })
    if (input.action === 'image_analyze') return ok({ viewer: view, annotations: [current], annotationHead: current, imageAnalysis: analysis, artifact: { id: 'artifact-1', uri: 'file:///analysis.json', checksum: 'c'.repeat(64) } })
    return ok({})
  })
  await canvas(scienceViewer)
  const button = screen.getByRole('button', { name: 'ROI 强度分析' })
  expect((button as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(button)
  await waitFor(() => expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'image_analyze', viewerId: 'v', expectedVersion: 1 })))
  const result = await screen.findByRole('region', { name: 'ROI 强度分析结果' })
  expect(result.textContent).toContain('ROI 1')
  expect(result.textContent).toContain('artifact-1')
})

it('disables intensity analysis until an accepted ROI is available', async () => {
  const scienceViewer = fixture(); await canvas(scienceViewer)
  expect((screen.getByRole('button', { name: 'ROI 强度分析' }) as HTMLButtonElement).disabled).toBe(true)
})

it('runs label mask analysis with an optional label subset and renders per-label statistics', async () => {
  const current = { id: 'head', revision: 1, status: 'accepted', origin: 'workbench', payload: { ...payload, rois: [{ id: 'r1', name: 'ROI 1', kind: 'rectangle', page: 0, x: 1, y: 1, width: 8, height: 8 }] } }
  const maskAnalysis = { runner: 'zerowall-image-mask/7.0.0-1', sourceAssetId: 'a', sourceSha256: 'a'.repeat(64), maskAssetId: 'm', maskSha256: 'b'.repeat(64), viewerId: 'v', viewerVersion: 1, annotationRevisionId: 'head', sourceWidth: 2000, sourceHeight: 1000, sourcePages: 1, maskDepth: 'uchar', requestedLabels: [1, 2], rois: [{ roiId: 'r1', name: 'ROI 1', kind: 'rectangle', page: 0, labels: [{ label: 1, pixelCount: 32, channels: 1, sum: [3200], mean: [100], min: [90], max: [110], standardDeviation: [5] }, { label: 2, pixelCount: 32, channels: 1, sum: [6400], mean: [200], min: [190], max: [210], standardDeviation: [5] }] }], notes: ['标签来自独立掩膜。'] }
  const scienceViewer = vi.fn(async (input: any) => {
    if (input.action === 'list') return ok({ assets: [{ id: 'a', name: 'Test image', uri: 'file:///image.png', location: 'local' }, { id: 'm', name: 'Labels', uri: 'file:///mask.tif', location: 'local' }], viewers: [view] })
    if (input.action === 'native_status') return ok({ launches: [] })
    if (input.action === 'image_read') return ok({ viewer: view, image, annotations: [current], annotationHead: current })
    if (input.action === 'image_mask_analyze') return ok({ viewer: view, annotations: [current], annotationHead: current, imageMaskAnalysis: maskAnalysis, artifact: { id: 'mask-artifact', uri: 'file:///mask-analysis.json', checksum: 'c'.repeat(64) } })
    return ok({})
  })
  await canvas(scienceViewer)
  fireEvent.change(screen.getByLabelText('标签掩膜资产'), { target: { value: 'm' } })
  fireEvent.change(screen.getByLabelText('标签集合'), { target: { value: '1, 2' } })
  const button = screen.getByRole('button', { name: '标签掩膜分析' })
  expect((button as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(button)
  await waitFor(() => expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'image_mask_analyze', viewerId: 'v', expectedVersion: 1, maskAssetId: 'm', maskLabels: [1, 2] })))
  const result = await screen.findByRole('region', { name: '标签掩膜分析结果' })
  expect(result.textContent).toContain('掩膜：m')
  expect(result.textContent).toContain('mask-artifact')
  expect(result.textContent).toContain('100')
  expect(result.textContent).toContain('200')
})

it('blocks label mask analysis until a mask asset is selected', async () => {
  const scienceViewer = fixture(); await canvas(scienceViewer)
  expect((screen.getByRole('button', { name: '标签掩膜分析' }) as HTMLButtonElement).disabled).toBe(true)
})
