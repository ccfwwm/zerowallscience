// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MoleculeDockingPanel } from '../src/client/molecule-docking-panel.js'
afterEach(cleanup)
const assets=[{id:'r',name:'receptor',uri:'file:///receptor.pdbqt',location:'local',version:2},{id:'l',name:'ligands',uri:'file:///ligands.json',location:'local',version:3}]
it('submits explicit preparation and box, refreshes persisted run and opens its verified pose',async()=>{
  const poses=vi.fn();let submitted=false
  const moleculeDocking=vi.fn(async(input:any)=>({ok:true,value:input.action==='list'?{assets,runs:submitted?[{id:'run',name:'Vina',status:'running'}]:[]}:input.action==='submit'?(submitted=true,{run:{id:'run',status:'running'},analysisComplete:false}):{run:{id:'run',status:'succeeded'},analysisComplete:true,inputSnapshot:{box:{center:[1,2,3],size:[20,20,20]},threads:1,seed:42,preparationSource:'Saved receptor preparation',receptorSha256:'abc',ligandSha256:'def'},poses:[{ligandId:'ethanol',affinityKcalMol:-1.2,assetId:'pose'}]}}))
  render(<MoleculeDockingPanel remote={{moleculeDocking}} sessionId="s" onPose={poses} />)
  fireEvent.click(screen.getByText('Vina 分子对接 · 远程 CPU'))
  await waitFor(()=>expect(screen.getByRole('option',{name:'receptor · v2'})).toBeTruthy())
  fireEvent.change(screen.getByLabelText('对接受体'),{target:{value:'r'}});fireEvent.change(screen.getByLabelText('对接配体列表'),{target:{value:'l'}})
  fireEvent.change(screen.getByLabelText('受体准备来源'),{target:{value:'Public prepared receptor, pH 7, no waters'}})
  fireEvent.change(screen.getByLabelText('对接盒中心'),{target:{value:'1,2,3'}})
  fireEvent.click(screen.getByRole('button',{name:'上传受体并提交 Vina'}))
  await waitFor(()=>expect(moleculeDocking).toHaveBeenCalledWith(expect.objectContaining({action:'submit',sessionId:'s',expectedReceptorVersion:2,expectedLigandVersion:3,box:{center:[1,2,3],size:[20,20,20]},threads:1})))
  await waitFor(()=>expect(screen.getByText(/任务：running/)).toBeTruthy())
  fireEvent.click(screen.getByRole('button',{name:'刷新对接任务与取回产物'}))
  fireEvent.click(await screen.findByRole('button',{name:'查看首个构象'}));expect(poses).toHaveBeenCalledWith('pose')
  expect(screen.getByText(/不是实测亲和力/)).toBeTruthy();fireEvent.click(screen.getByText('此任务实际执行参数与输入快照'));expect(screen.getByText(/盒中心：1, 2, 3/)).toBeTruthy();expect(screen.getByText(/Saved receptor preparation/)).toBeTruthy()
})
it('does not submit blank coordinate components as zero',async()=>{
  const moleculeDocking=vi.fn(async()=>({ok:true,value:{assets,runs:[]}}))
  render(<MoleculeDockingPanel remote={{moleculeDocking}} sessionId="s" onPose={()=>{}} />)
  fireEvent.click(screen.getByText('Vina 分子对接 · 远程 CPU'));await waitFor(()=>expect(screen.getByRole('option',{name:'receptor · v2'})).toBeTruthy())
  fireEvent.change(screen.getByLabelText('对接受体'),{target:{value:'r'}});fireEvent.change(screen.getByLabelText('对接配体列表'),{target:{value:'l'}});fireEvent.change(screen.getByLabelText('受体准备来源'),{target:{value:'Prepared receptor source'}});fireEvent.change(screen.getByLabelText('对接盒中心'),{target:{value:'1,,3'}})
  fireEvent.click(screen.getByRole('button',{name:'上传受体并提交 Vina'}));await screen.findByText(/搜索盒需填写三个/)
  expect(moleculeDocking.mock.calls.every(([input])=>(input as any).action==='list')).toBe(true)
})
