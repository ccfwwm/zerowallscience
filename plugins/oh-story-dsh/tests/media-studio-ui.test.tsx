// @vitest-environment jsdom
import React from 'react'
import { act,render,screen,fireEvent,waitFor,cleanup } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import { MediaWorkspace,sessionProjectId,Preview } from '../src/client/index.js'
import { MediaToolRow } from '../src/client/media-tool.js'
afterEach(()=>{cleanup();vi.useRealTimers()})
const selection={groupId:'99',modelId:'chosen-video',profileId:'profile',operation:'video'}
const model={...selection,operations:['video'],sizes:[],qualities:[],resolutions:[],aspectRatios:[],duration:{},stale:false}
it('keeps video drafts free of submissions, then directly generates once on explicit request',async()=>{
 const job={id:'fixture-job',sessionId:'fixture-session',projectId:'default',revision:1,kind:'video',prompt:'产品宣传视频',selection,parameters:{},references:[],estimate:{currency:'USD',total:'0.01'},state:'prepared',assets:[]}
 const call=vi.fn(async(_:string,action:string)=>action==='list'?{projects:[],jobs:[job]}:action==='catalog'?{models:[model],status:'succeeded'}:{})
 render(<MediaWorkspace sessionId="fixture-session" call={call} send={vi.fn()}/>)
 await screen.findByText('开始生成');expect(screen.queryByText('确认费用并生成')).toBeNull()
 expect(call.mock.calls.some(c=>c[1]==='generate')).toBe(false)
 fireEvent.change(screen.getByLabelText('任务提示词'),{target:{value:'changed'}})
 expect((screen.getByText('开始生成') as HTMLButtonElement).disabled).toBe(true)
 fireEvent.change(screen.getByLabelText('任务提示词'),{target:{value:'产品宣传视频'}})
 fireEvent.click(screen.getByText('开始生成'))
 await waitFor(()=>expect(call.mock.calls.filter(c=>c[1]==='generate')).toHaveLength(1))
 expect(call.mock.calls.some(c=>['submit','authorize'].includes(c[1]))).toBe(false)
})
it('keeps ordinary image generation out of the media workspace examples',async()=>{
 const send=vi.fn(async()=>{}),call=vi.fn(async(_:string,action:string)=>action==='list'?{projects:[],jobs:[]}:action==='catalog'?{models:[model],status:'succeeded'}:{})
 render(<MediaWorkspace sessionId="fixture-session" call={call} send={send}/>)
 await screen.findByText('从一句话开始')
 expect(screen.queryByText('生成一张活动宣传海报')).toBeNull()
 fireEvent.click(screen.getByText('创作一段轻松的背景音乐'))
 await waitFor(()=>expect(send).toHaveBeenCalledOnce());expect(send.mock.calls[0]?.[0]).toContain('请使用多媒体创作')
 expect(screen.queryByText('初始化项目')).toBeNull();expect(document.querySelector('input[type=file]')).toBeNull()
})
it('renders legacy image jobs as read-only history',async()=>{
 const job={id:'legacy-image',sessionId:'fixture-session',projectId:'default',revision:1,kind:'image',prompt:'海报',selection:{...selection,operation:'image'},parameters:{},references:[],estimate:{currency:'USD',total:'0.01'},state:'prepared',assets:[]}
 const imageModel={...selection,operation:'image',modelId:'image-model',operations:['image'],duration:{},stale:false}
 const call=vi.fn(async(_:string,action:string)=>action==='list'?{projects:[],jobs:[job]}:action==='catalog'?{models:[imageModel],status:'succeeded'}:{})
 render(<MediaWorkspace sessionId="fixture-session" call={call} send={vi.fn()}/> )
 await screen.findByText('这是历史图片任务。普通图片生成和编辑请使用 gpt-image-generator；媒体工作台中的图片仅作为视频参考素材。')
 expect(screen.queryByText('开始生成')).toBeNull()
 expect(call.mock.calls.some(c=>c[1]==='generate')).toBe(false)
 expect(screen.getByText('海报')).toBeTruthy()
 fireEvent.click(screen.getByText('模型设置'))
 expect(screen.getAllByLabelText('任务模型')).toHaveLength(2)
 expect(screen.getAllByLabelText('任务模型').every(e=>(e as HTMLSelectElement).disabled)).toBe(true)
})
it('explains missing group permissions and disables empty model choices',async()=>{
 const call=vi.fn(async(_:string,action:string)=>action==='list'?{projects:[],jobs:[]}:action==='catalog'?{models:[],status:'succeeded'}:{})
 render(<MediaWorkspace sessionId="fixture-session" call={call} send={vi.fn()}/>)
 await screen.findByText(/当前账号没有可用的媒体模型/);fireEvent.click(screen.getByText('模型设置'))
 expect(screen.getAllByLabelText('任务模型').every(e=>(e as HTMLSelectElement).disabled)).toBe(true)
})
it('preserves unsaved model choices across background sync',async()=>{
 const call=vi.fn(async(_:string,action:string)=>action==='list'?{projects:[],jobs:[]}:action==='catalog'?{models:[model],status:'succeeded'}:{})
 render(<MediaWorkspace sessionId="fixture-session" call={call} send={vi.fn()}/>)
 await screen.findByText('1 个模型');fireEvent.click(screen.getByText('模型设置'))
 const select=screen.getAllByLabelText('任务模型')[0]!;fireEvent.change(select,{target:{value:'99|chosen-video|profile'}})
 fireEvent.click(screen.getByText('刷新'));await waitFor(()=>expect((select as HTMLSelectElement).value).toBe('99|chosen-video|profile'))
})
it('renders playable media directly in the conversation result',()=>{
 const asset={id:'a',path:'media-projects/p/assets/music.m4a',mediaType:'audio/mp4',bytes:100,sha256:'hash'}
 render(<MediaToolRow {...{phase:'result',sessionId:'s',toolName:'media_import',block:{kind:'tool-result',content:[{type:'text',text:JSON.stringify(asset)}],isError:false}} as any} call={vi.fn()}/>)
 expect(screen.getByLabelText('对话媒体结果').querySelector('audio')?.getAttribute('src')).toContain('/oh-story/media?sessionId=s')
})
it('stops background querying when an asynchronous result is downloaded',async()=>{
 vi.useFakeTimers()
 const asset={id:'a',path:'media-projects/p/assets/music.m4a',mediaType:'audio/mp4',bytes:100,sha256:'hash'}
 const job={id:'job-00001',requestId:'request-00001',projectId:'p',state:'queued',assets:[]}
 const call=vi.fn(async(_:string,action:string)=>action==='list'?{jobs:[{...job,state:'completed',assets:[asset]}]}:{...job,state:'completed',assets:[asset]})
 await act(async()=>{render(<MediaToolRow {...{phase:'result',sessionId:'s',toolName:'media_job',block:{kind:'tool-result',content:[{type:'text',text:JSON.stringify(job)}],isError:false}} as any} call={call}/>)})
 await act(async()=>{await vi.advanceTimersByTimeAsync(15000)})
 expect(call).toHaveBeenCalledOnce();expect(document.querySelector('audio')).toBeTruthy()
})

it('shows completed legacy compositions and running renders on tasks instead of an empty welcome',async()=>{
 const asset={id:'a',path:'media-projects/p/outputs/final.mp4',mediaType:'video/mp4',bytes:100,sha256:'hash'}
 const call=vi.fn(async(_:string,action:string)=>action==='list'?{jobs:[],projects:[{id:'p',title:'历史成片',revision:2,assets:[],outputs:[asset]}],compositions:[{id:'render',title:'当前合成',state:'running',assets:[]}]}:action==='catalog'?{models:[model],status:'succeeded'}:{})
 render(<MediaWorkspace sessionId="s" call={call} send={vi.fn()}/>)
 await screen.findByText('历史成片');expect(screen.getByText('当前合成')).toBeTruthy();expect(screen.getByText('正在合成')).toBeTruthy()
 expect(screen.queryByText('从一句话开始')).toBeNull();expect(document.querySelector('video')).toBeTruthy()
})

it('opens accessible enlarged previews and closes them without leaving the conversation',async()=>{
 const asset={id:'a',path:'media-projects/p/assets/p.png',mediaType:'image/png',bytes:100,sha256:'hash'}
 render(<Preview asset={asset} sessionId="s"/>);fireEvent.click(screen.getByRole('button',{name:'放大预览'}))
 expect(screen.getByRole('dialog',{name:'素材放大预览'}).querySelector('img')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'关闭放大预览'}));expect(screen.queryByRole('dialog')).toBeNull()
})

it('assigns independent project ids to sessions in the same workspace',()=>{
 expect(sessionProjectId('session-one')).not.toBe(sessionProjectId('session-two'))
 expect(sessionProjectId('session-one')).toMatch(/^[A-Za-z0-9_-]{1,80}$/)
})

it('shows persisted completed tasks and working reacquire/stop controls while the model catalog never returns',async()=>{
 let job:any={id:'job-recover-01',requestId:'request-recover-01',taskId:'mt_original',sessionId:'s',projectId:'p',revision:1,kind:'video',prompt:'原视频',selection,parameters:{},references:[],state:'completed',assets:[]}
 const call=vi.fn(async(_:string,action:string)=>{
  if(action==='list')return {projects:[],jobs:[job]}
  if(action==='catalog')return new Promise(()=>{})
  if(action==='refresh'){job={...job,collection:'downloading'};return job}
  if(action==='pause'){job={...job,collection:'paused'};return job}
  return {}
 })
 const view=render(<MediaWorkspace sessionId="s" call={call} send={vi.fn()}/>)
 await screen.findByText('原视频');await screen.findByText('生成完成，正在下载')
 fireEvent.click(screen.getByRole('button',{name:'停止本地收集'}))
 await screen.findByText('本地收集已停止')
 fireEvent.click(screen.getByRole('button',{name:'重新获取'}))
 await screen.findByText('生成完成，正在下载')
 expect(call.mock.calls.some(c=>c[1]==='generate')).toBe(false)
 view.rerender(<MediaWorkspace sessionId="new-session" call={vi.fn(async(_:string,action:string)=>action==='list'?{projects:[],jobs:[]}:action==='catalog'?{models:[],status:'succeeded'}:{})} send={vi.fn()}/>)
 await screen.findByText('从一句话开始')
})
it('moves history recovery into the cancellable task view immediately and never generates a replacement',async()=>{
 let job:any
 const history={requestId:'legacy-request-0001',taskId:'mt_history',status:'completed',selection}
 const call=vi.fn(async(_:string,action:string)=>{
  if(action==='list')return {projects:[],jobs:job?[job]:[]}
  if(action==='catalog')return new Promise(()=>{})
  if(action==='legacy')return [history]
  if(action==='legacy-recover'){job={...history,id:'recovered-job-0001',projectId:'p',sessionId:'s',kind:'video',prompt:'恢复历史视频任务',parameters:{},references:[],state:'completed',collection:'querying',assets:[],revision:1};return job}
  if(action==='pause'){job={...job,collection:'paused'};return job}
  if(action==='refresh')return job
  return {}
 })
 render(<MediaWorkspace sessionId="s" call={call} send={vi.fn()}/>)
 fireEvent.click(screen.getByRole('button',{name:'作品素材'}))
 fireEvent.click(screen.getByRole('button',{name:'读取历史任务'}))
 fireEvent.click(await screen.findByRole('button',{name:'恢复原任务'}))
 await screen.findByDisplayValue('恢复历史视频任务')
 fireEvent.click(screen.getByRole('button',{name:'停止本地收集'}))
 await screen.findByText('本地收集已停止')
 expect(call.mock.calls.filter(c=>c[1]==='legacy-recover')).toHaveLength(1)
 expect(call.mock.calls.some(c=>['submit','generate'].includes(c[1]))).toBe(false)
})

it('marks stale workspace polling as automatic so Host can preserve a newer pause',async()=>{
 const a:any={id:'job-a-0001',requestId:'request-a-0001',sessionId:'s',projectId:'p',revision:1,kind:'video',prompt:'先处理任务',selection,parameters:{},references:[],state:'completed',assets:[]}
 let b:any={...a,id:'job-b-0001',requestId:'request-b-0001',prompt:'已停止任务'},releaseA!:()=>void,paused=false,staleRefreshes=0
 const gate=new Promise<void>(resolve=>{releaseA=resolve})
 const call=vi.fn(async(_:string,action:string,input:any={})=>{
  if(action==='list')return {projects:[],jobs:[structuredClone(a),structuredClone(b)]}
  if(action==='catalog')return {models:[],status:'succeeded'}
  if(action==='refresh'&&input.id===a.id){await gate;return a}
  if(action==='pause'){paused=true;b={...b,collection:'paused'};return b}
  if(action==='refresh'&&input.id===b.id){
   if(paused)staleRefreshes++
   if(!(input.automatic===true&&b.collection==='paused'))b={...b,collection:'querying'}
   return b
  }
  return {}
 })
 render(<MediaWorkspace sessionId="s" call={call} send={vi.fn()}/>)
 await waitFor(()=>expect(call.mock.calls.some(([,action,input])=>action==='refresh'&&input.id===a.id)).toBe(true))
 const card=screen.getByDisplayValue(b.prompt).closest('article')!
 fireEvent.click(Array.from(card.querySelectorAll('button')).find(button=>button.textContent==='停止本地收集')!)
 await screen.findByText('本地收集已停止')
 releaseA()
 await waitFor(()=>expect(staleRefreshes).toBe(1))
 expect(b.collection).toBe('paused')
 expect(call.mock.calls.filter(([,action])=>action==='refresh').every(([, ,input])=>input.automatic===true)).toBe(true)
})

it.each(['workspace','conversation'])('keeps partial original artifacts stoppable and manually retryable in %s',async surface=>{
 let job:any={id:'partial-job-0001',requestId:'original-request-0001',taskId:'mt_original',projectId:'p',sessionId:'s',revision:1,kind:'video',prompt:'原任务部分结果',selection,parameters:{},references:[],state:'completed',collection:'downloading',assets:[{id:'first',projectId:'p',sessionId:'s',path:'media-projects/p/assets/first.mp4',mediaType:'video/mp4',bytes:10,sha256:'fixture'}]}
 const call=vi.fn(async(_:string,action:string,input:any={})=>{
  if(action==='list')return {projects:[],jobs:[structuredClone(job)]}
  if(action==='catalog')return {models:[],status:'succeeded'}
  if(action==='pause'){job={...job,collection:'paused'};return job}
  if(action==='refresh'){
   if(input.automatic!==true)job={...job,collection:'downloading'}
   return job
  }
  return {}
 })
 if(surface==='workspace')render(<MediaWorkspace sessionId="s" call={call} send={vi.fn()}/>)
 else render(<MediaToolRow {...{phase:'result',sessionId:'s',toolName:'media_job',block:{kind:'tool-result',content:[{type:'text',text:JSON.stringify(job)}],isError:false}} as any} call={call}/>)
 await screen.findByText('已获取 1 个文件，正在下载其余作品')
 expect(document.querySelector('video')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'停止本地收集'}))
 await screen.findByText('本地收集已停止')
 expect(document.querySelector('video')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'重新获取'}))
 await screen.findByText('已获取 1 个文件，正在下载其余作品')
 expect(call.mock.calls.some(([,action,input])=>action==='refresh'&&input.id===job.id&&input.automatic!==true)).toBe(true)
 expect(call.mock.calls.some(([,action])=>['submit','generate'].includes(action))).toBe(false)
})

it.each(['workspace','conversation'])('shows automatic waiting, keeps partial files playable, and can stop and explicitly resume in %s',async surface=>{
 const asset={id:'first',projectId:'p',sessionId:'s',path:'media-projects/p/assets/first.mp4',mediaType:'video/mp4',bytes:10,sha256:'fixture'}
 let job:any={id:'waiting-job-0001',requestId:'waiting-request-0001',taskId:'mt_waiting',projectId:'p',sessionId:'s',revision:1,kind:'video',prompt:'正在等待原作品',selection,parameters:{},references:[],state:'completed',collection:'waiting',collectionRetry:{attempts:120,startedAt:1,nextAttemptAt:Date.now()+30000,reason:'result-not-ready'},assets:[asset]}
 const call=vi.fn(async(_:string,action:string,input:any={})=>{
  if(action==='list')return {projects:[],jobs:[structuredClone(job)]}
  if(action==='catalog')return {models:[],status:'succeeded'}
  if(action==='pause'){job={...job,collection:'paused'};return job}
  if(action==='refresh'&&input.automatic!==true){job={...job,collection:'ready'};return job}
  return structuredClone(job)
 })
 if(surface==='workspace')render(<MediaWorkspace sessionId="s" call={call} send={vi.fn()}/>)
 else render(<MediaToolRow {...{phase:'result',sessionId:'s',toolName:'media_job',block:{kind:'tool-result',content:[{type:'text',text:JSON.stringify(job)}],isError:false}} as any} call={call}/>)
 await screen.findByText('已获取 1 个文件，等待其余作品可用')
 expect(document.querySelector('video')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'停止本地收集'}))
 await screen.findByText('本地收集已停止')
 expect(document.querySelector('video')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'重新获取'}))
 await screen.findByText('已完成')
 expect(call.mock.calls.some(([,action])=>['submit','generate','prepare','estimate'].includes(action))).toBe(false)
 expect(call.mock.calls.filter(([,action])=>['pause','refresh'].includes(action)).every(([, ,input])=>input.id==='waiting-job-0001')).toBe(true)
})
