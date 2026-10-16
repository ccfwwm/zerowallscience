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
 const call=vi.fn(async()=>({...job,state:'completed',assets:[asset]}))
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
