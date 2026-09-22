// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HeViewer } from '../src/client/he-viewer.js'

afterEach(cleanup)
const ok = (value: unknown) => ({ ok: true, value })
const viewer = { id: 'v1', assetId: 'a1', tool: 'image', version: 1, state: { heTool: 'he', sourceSha256: 'sha' } }
const he = { width: 20, height: 15, pages: 1, format: 'tiff', notes: [] }

it('submits a persistent segmentation, polls completion and displays the nuclei overlay', async () => {
  const segmentation={count:12,boundaryCount:2,tiles:4,preview:{pngBase64:'AQID'},model:{name:'2D_versatile_he'},notes:['research only']}
  const scienceViewer=vi.fn(async input=>{
    if(input.action==='list')return ok({assets:[{id:'a1',name:'slide.svs',uri:'file:///slide.svs'}],viewers:[]})
    if(input.action==='he_open')return ok({he:{he,viewer}})
    if(input.action==='he_segment')return ok({he:{run:{id:'r1',status:'running'}}})
    if(input.action==='he_status')return ok({he:{run:{id:'r1',status:'succeeded'},segmentation}})
    return ok({})
  })
  render(<HeViewer remote={{scienceViewer} as any} sessionId="s1" />)
  await screen.findByRole('option',{name:'slide.svs'});fireEvent.change(screen.getByLabelText('HE 资产'),{target:{value:'a1'}});fireEvent.click(screen.getByRole('button',{name:'打开切片'}))
  fireEvent.click(await screen.findByRole('button',{name:'StarDist 核分割'}))
  expect(await screen.findByAltText('HE 核分割叠加',{}, {timeout:5000})).toBeTruthy()
  expect(screen.getByText(/检测核数：12/)).toBeTruthy()
  expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({action:'he_segment',he:expect.objectContaining({requestId:expect.any(String),segmentation:{probabilityThreshold:0.6924782541382084}})}))
})

it('opens a slide, sends original-pixel ROI coordinates and renders metrics', async () => {
  const scienceViewer = vi.fn(async input => {
    if (input.action === 'list') return ok({ assets: [{ id: 'a1', name: 'slide.svs', uri: 'file:///slide.svs' }], viewers: [viewer] })
    if (input.action === 'he_open') return ok({ he: { he, viewer } })
    if (input.action === 'he_analyze') return ok({ he: { analysis: { format: 'zerowall-he-analysis', version: 1, width: 2, height: 2, region: input.region, pixels: 4, meanRgb: { r: 1, g: 2, b: 3 }, nucleiLikePixels: 1, nucleiLikeFraction: .25, flags: [], notes: ['screening'] }, viewer } })
    return ok({})
  })
  render(<HeViewer remote={{ scienceViewer } as any} sessionId="s1" />)
  fireEvent.change(await screen.findByLabelText('HE 资产'), { target: { value: 'a1' } })
  fireEvent.click(screen.getByRole('button', { name: '打开切片' }))
  await waitFor(() => expect(screen.getAllByText(/20×15/).length).toBeGreaterThan(0))
  fireEvent.change(screen.getByLabelText('HE x'), { target: { value: '2' } }); fireEvent.change(screen.getByLabelText('HE y'), { target: { value: '3' } }); fireEvent.change(screen.getByLabelText('HE width'), { target: { value: '2' } }); fireEvent.change(screen.getByLabelText('HE height'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: '统计 ROI' }))
  expect(await screen.findByText(/核样本启发式比例/)).toBeTruthy()
  expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action: 'he_analyze', viewerId: 'v1', expectedVersion: 1, region: { x: 2, y: 3, width: 2, height: 2, page: 0 } }))
})

it('renders pyramid PNG tiles, maps dragged ROI to level-0 pixels and restores saved regions', async () => {
  const he = { width:600,height:400,pages:2,format:'generic-tiff',engine:'openslide',calibration:{ x:.25,y:.5,unit:'um',source:'openslide.mpp' },bounds:{ x:0,y:0,width:600,height:400,source:'full-slide' },levels:[{ level:0,width:600,height:400,downsample:1 },{ level:1,width:300,height:200,downsample:2 }],notes:[] }
  const tile = { width:200,height:100,downsample:2,pngBase64:'AQID',region:{ x:100,y:100,width:400,height:200,page:1 },coverageLevel0:{ width:400,height:200 } }
  const scienceViewer = vi.fn(async input => input.action === 'list'
    ? ok({ assets:[{ id:'a1',name:'slide.svs',uri:'file:///slide.svs' }],viewers:[viewer] })
    : ok({ he:{ he,viewer,tile } }))
  render(<HeViewer remote={{ scienceViewer } as any} sessionId="s1" />)
  fireEvent.click(await screen.findByRole('tab'))
  const image = await screen.findByRole('img',{ name:'HE 瓦片与 ROI 选择' })
  expect(image.querySelector('image')?.getAttribute('href')).toBe('data:image/png;base64,AQID')
  expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action:'he_read',viewerId:'v1',expectedVersion:1 }))
  expect(scienceViewer.mock.calls.find(([input]) => input.action==='he_read')![0].region).toBeUndefined()
  vi.spyOn(image,'getBoundingClientRect').mockReturnValue({ x:0,y:0,left:0,top:0,right:200,bottom:100,width:200,height:100,toJSON:() => ({}) })
  fireEvent(image,new MouseEvent('pointerdown',{ bubbles:true,clientX:50,clientY:25 }))
  fireEvent(image,new MouseEvent('pointerup',{ bubbles:true,clientX:150,clientY:75 }))
  expect((screen.getByLabelText('HE x') as HTMLInputElement).value).toBe('200')
  expect((screen.getByLabelText('HE y') as HTMLInputElement).value).toBe('150')
  expect((screen.getByLabelText('HE width') as HTMLInputElement).value).toBe('200')
  fireEvent.click(screen.getByRole('button',{ name:'读取区域' }))
  await waitFor(() => expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({ action:'he_read',region:{ x:200,y:150,width:200,height:100,page:1 } })))
})
