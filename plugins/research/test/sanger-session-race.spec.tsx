// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SangerViewer } from '../src/client/sanger-viewer.js'
afterEach(cleanup)
const ok=(value:unknown)=>({ok:true,value})
const trace={format:'scf',version:'3.00',sampleCount:4,sampleSize:1,sourceSha256:'old-sha',channels:{A:[0,10,0,0],C:[0,0,10,0],G:[0,0,0,0],T:[0,0,0,0]},bases:[{position:1,peak:1,base:'A',quality:1,calls:{A:255,C:0,G:0,T:0}}],notes:[]}
it('ignores a late open response after switching to a different project session',async()=>{
 let release!:(value:unknown)=>void;const pending=new Promise(resolve=>release=resolve)
 const scienceViewer=vi.fn(async(input:any)=>input.action==='list'?ok({assets:[{id:input.sessionId==='s1'?'old':'new',name:input.sessionId==='s1'?'OLD-PROJECT.scf':'NEW-PROJECT.scf',uri:'file:///trace.scf'}],viewers:[]}):pending)
 const remote={scienceViewer};const ui=render(<SangerViewer remote={remote as any} sessionId="s1"/>);await screen.findByRole('option',{name:'OLD-PROJECT.scf'})
 fireEvent.change(screen.getByLabelText('Sanger 资产'),{target:{value:'old'}});fireEvent.click(screen.getByRole('button',{name:'打开峰图'}));await waitFor(()=>expect(scienceViewer).toHaveBeenCalledWith(expect.objectContaining({sessionId:'s1',action:'sanger_open'})))
 ui.rerender(<SangerViewer remote={remote as any} sessionId="s2"/>);await screen.findByRole('option',{name:'NEW-PROJECT.scf'})
 await act(async()=>{release(ok({sanger:{trace,viewer:{id:'old-view',assetId:'old',version:1,tool:'sequence',state:{traceTool:'sanger',threshold:.8,window:5}}}}));await pending})
 expect(screen.queryByRole('img',{name:'四色 Sanger 峰图'})).toBeNull();expect(screen.queryByRole('option',{name:'OLD-PROJECT.scf'})).toBeNull()
 expect(screen.getByRole('option',{name:'NEW-PROJECT.scf'})).toBeTruthy();expect(screen.getByRole('button',{name:'打开峰图'}).closest('fieldset')!.disabled).toBe(false)
})
