import { useEffect, useRef, useState } from 'react'
import type { MediaAsset, MediaJob } from '@zerowallscience/plugin-ai-cloud/types'
import type { AiCloudMediaModel } from '@zerowallscience/plugin-account/types'
import type { CompositionJob, MediaProject } from '../media-types.js'
import styles from './media.css?inline'
import { JobCard, ModelFields, Preview, sessionProjectId, shouldRefreshMediaJob, type Call } from './components.js'

const categories = [['video', '视频', '短视频、镜头与宣传片素材'], ['music', '音乐', '背景音乐与配乐']] as const
const examples = [
  ['把这张图片做成一段视频', '这是独立视频任务，请使用多媒体创作。'],
  ['创作一段轻松的背景音乐', '这是独立音乐任务，请使用多媒体创作。'],
  ['制作一条 15 秒的产品宣传片', '这是独立视频宣传片任务，请使用多媒体创作。'],
] as const
type CatalogState = { status: string; error?: string }

export function MediaWorkspace({ sessionId, call, send, visible = true }: { sessionId: string; call: Call; send: (prompt: string) => Promise<unknown>; visible?: boolean }) {
  const [tab, setTab] = useState<'tasks' | 'models' | 'assets'>('tasks')
  const [projects, setProjects] = useState<MediaProject[]>([]), [jobs, setJobs] = useState<MediaJob[]>([])
  const [compositions,setCompositions]=useState<CompositionJob[]>([])
  const [models, setModels] = useState<AiCloudMediaModel[]>([]), [defaults, setDefaults] = useState<any>({})
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' })
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [choiceDirty, setChoiceDirty] = useState(false)
  const [legacy, setLegacy] = useState<any[]>([]), [legacyOpen, setLegacyOpen] = useState(false)
  const epoch = useRef(0), polling = useRef(false), dirtyChoice = useRef(false), catalogBusy = useRef(false)
  dirtyChoice.current = choiceDirty
  const sync = async (refresh = false) => {
    const revision = epoch.current
    // Stored tasks and recovery controls must appear even if model discovery is
    // offline. Result collection uses the original task, not today's catalog.
    if(!catalogBusy.current){
      catalogBusy.current=true
      void call(sessionId,'catalog',{refresh}).then(directory=>{if(revision===epoch.current){setModels(directory.models??[]);setCatalog({status:directory.status,...(directory.error?{error:directory.error}:{})})}}).catch(()=>{if(revision===epoch.current)setCatalog({status:'error',error:'模型目录暂不可用，已有任务仍可重新获取。'})}).finally(()=>{if(revision===epoch.current)catalogBusy.current=false})
      void call(sessionId,'choices').then(choices=>{if(revision===epoch.current&&!dirtyChoice.current)setDefaults(choices)}).catch(()=>{})
    }
    const data=await call(sessionId,'list')
    if(revision===epoch.current){setProjects(data.projects??[]);setJobs(data.jobs??[]);setCompositions(data.compositions??[])}
  }
  useEffect(() => {
    epoch.current++; catalogBusy.current=false; setProjects([]); setJobs([]); setCompositions([]); setModels([]); setDefaults({}); setLegacy([])
    setChoiceDirty(false); setLegacyOpen(false); setMessage(''); setCatalog({ status: 'loading' }); setTab('tasks')
    return () => { epoch.current++ }
  }, [sessionId])
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    const poll = async () => {
      if (polling.current) return
      polling.current = true
      const revision = epoch.current
      try {
        const data = await call(sessionId, 'list')
        if(!cancelled&&revision===epoch.current){setProjects(data.projects??[]);setJobs(data.jobs??[]);setCompositions(data.compositions??[])}
        for (const job of data.jobs ?? []) {
          if (cancelled || revision !== epoch.current) return
          if (shouldRefreshMediaJob(job)) {
            await call(sessionId, 'refresh', { projectId: job.projectId, id: job.id, automatic: true }).catch(() => {})
          }
        }
        if (!cancelled && revision === epoch.current) await sync()
      } catch (error: any) {
        if (!cancelled && revision === epoch.current) { setCatalog({ status: 'error', error: '暂时无法读取媒体配置，请重试。' }); setMessage(error.message) }
      } finally { polling.current = false }
    }
    void call(sessionId, 'activate').catch(() => {}); void poll()
    const timer = setInterval(() => { void poll() }, 4000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [sessionId, visible])
  const act = async (fn: () => Promise<unknown>, success = '') => {
    if (busy) return
    setBusy(true); setMessage('')
    try { await fn(); await sync(); setMessage(success) } catch (error: any) { setMessage(error.message) } finally { setBusy(false) }
  }
  const recoverHistory = async (requestId: string) => {
    const job = await call(sessionId, 'legacy-recover', { projectId: sessionProjectId(sessionId), requestId })
    setLegacy(items => items.map(task => task.requestId === requestId ? { ...task, recoveryId: job.id } : task))
    setTab('tasks')
  }
  const usable = models.filter(m => !m.stale && m.operations.some(operation => operation === 'video' || operation === 'chat_music'))
  const assets = [...new Map([...projects.flatMap(p => [...p.assets, ...p.outputs]), ...jobs.flatMap(j => j.assets)].map(a => [a.path, a])).values()]
  const recorded=new Set(compositions.flatMap(j=>j.assets.map(a=>a.path)))
  const historical=projects.flatMap(project=>project.outputs.filter(a=>!recorded.has(a.path)).map(asset=>({id:asset.id,projectId:project.id,sessionId, title:project.title,state:'completed' as const,editRevision:project.editRevision??project.revision,createdAt:'',updatedAt:'',assets:[asset]})))
  const renderTasks:CompositionJob[]=[...compositions,...historical]
  const taskCount=jobs.length+renderTasks.length
  const notice = catalog.status === 'loading' ? '正在读取媒体模型…' : catalog.status === 'signedOut' ? '先登录 AI 云平台，即可同步可用模型。' : !usable.length && catalog.status === 'succeeded' ? '当前账号没有可用的媒体模型。请在 AI 云平台开通“图片音频视频分组”权限，再刷新模型。' : catalog.error
  return <aside className="media-studio" aria-label="多媒体创作工作台">
    <style>{styles}</style>
    <div className="media-panel">
      <header className="media-heading"><span className="media-brand-icon" aria-hidden="true">✦</span><div><h2>多媒体创作</h2><p>视频、音乐与宣传片任务</p></div><span className="media-count">{usable.length ? `${new Set(usable.map(m => m.modelId)).size} 个模型` : '待配置'}</span></header>
      <nav className="media-tabs" aria-label="媒体工作台页面">{([['tasks', '任务与结果'], ['models', '模型设置'], ['assets', '作品素材']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}{id === 'tasks' && taskCount > 0 && <span>{taskCount}</span>}</button>)}</nav>
      {notice && <div className="media-notice" role="status"><span>{notice}</span><button disabled={busy || catalog.status === 'loading'} onClick={() => void act(() => sync(true))}>刷新模型</button></div>}
      {tab === 'tasks' && <section className="media-section">
        {!taskCount ? <div className="media-welcome"><span className="media-empty-icon" aria-hidden="true">✧</span><h3>从一句话开始</h3><p>在左侧对话中描述视频、音乐或宣传片需求，或试试下面的例子。普通图片生成和编辑请使用图片工具。</p><div className="media-examples">{examples.map(([prompt, instruction], index) => <button key={prompt} disabled={busy} onClick={() => void act(() => send(`${prompt}。${instruction}`))}><span aria-hidden="true">{['▷', '♫', '▤'][index]}</span>{prompt}<span aria-hidden="true">↗</span></button>)}</div><div className="media-steps"><span>1 描述需求</span><span>2 自动创作</span><span>3 查看作品</span></div></div> : <><p className="media-help">继续在对话中调整视频、音乐或宣传片任务。图片参考素材可以用于视频生成；普通图片生成请使用图片工具。</p>{renderTasks.map(job=><article className="media-task media-composition" key={job.id} data-state={job.state}><header><strong>宣传片合成</strong><span>{{running:"正在合成",completed:"已完成",failed:"合成失败",unknown:"合成已中断"}[job.state]}</span></header><h3>{job.title}</h3>{job.state==="running"&&<p role="status">正在合并镜头、字幕和音轨，完成后会直接显示成片。</p>}{job.error&&<p role="alert">{job.error}</p>}{job.assets.map(asset=><Preview key={asset.path} asset={asset} sessionId={sessionId}/>)}</article>)}{jobs.map(job => <JobCard key={job.id} job={job} models={models} call={call} sessionId={sessionId} reload={() => sync()} onDirty={() => {}} assets={assets.filter(a => a.projectId === job.projectId)} />)}</>}
      </section>}
      {tab === 'models' && <section className="media-section"><div className="media-section-heading"><div><h3>默认媒体模型</h3><p>已有选择自动沿用；首次未配置时自动选择可用模型。</p></div><button disabled={busy} onClick={() => void act(() => sync(true))}>刷新</button></div>{categories.map(([kind, label, description]) => <section className="media-model-card" key={kind}><header><strong>{label}</strong><small>{description}</small></header><ModelFields models={models} kind={kind} selection={defaults[kind]?.selection} parameters={defaults[kind]?.parameters ?? {}} onChange={(selection, parameters) => { setChoiceDirty(true); setDefaults((previous: any) => { const next = { ...previous }; if (selection) next[kind] = { selection, parameters }; else delete next[kind]; return next }) }} /></section>)}<p className="media-help">旁白支持通过对话导入已有音频。配音模型暂不可用。</p><button className="primary media-save" disabled={busy || !choiceDirty} onClick={() => void act(async () => { await call(sessionId, 'save-choices', { choices: defaults }); dirtyChoice.current = false; setChoiceDirty(false) }, '默认模型已保存，后续对话会沿用这些选择。')}>保存模型设置</button></section>}
      {tab === 'assets' && <section className="media-section"><div className="media-section-heading"><div><h3>作品与素材</h3><p>把素材发到对话，或告诉助手项目内的文件路径。</p></div></div>{!assets.length ? <div className="media-empty"><span aria-hidden="true">▧</span><p>还没有作品或素材</p><small>生成结果和通过对话导入的素材会显示在这里。</small></div> : <div className="media-assets">{assets.map(asset => <div className="media-asset" key={asset.path}><Preview asset={asset} sessionId={sessionId} /><span className="media-asset-name" title={asset.path}>{asset.path.split('/').at(-1)}</span></div>)}</div>}{projects.filter(p => p.shots.length > 0).map(project => <section className="media-project-summary" key={project.id}><h3>{project.title}</h3><p>{project.shots.length} 个镜头 · {project.aspectRatio} · {project.shots.reduce((sum, shot) => sum + shot.duration, 0).toFixed(1)} 秒</p><small>在对话中说“调整第二个镜头”或“合成导出宣传片”。</small></section>)}<details className="media-history" open={legacyOpen} onToggle={event => setLegacyOpen(event.currentTarget.open)}><summary>历史任务恢复</summary><p className="media-help">只查询原任务，不会重新生成。</p><button disabled={busy} onClick={() => void act(async () => setLegacy(await call(sessionId, 'legacy')))}>读取历史任务</button>{legacy.map(task => <div className="media-task" key={task.requestId}><strong>{task.selection.modelId}</strong><p>{task.status}</p><button disabled={busy} onClick={() => void act(() => recoverHistory(task.requestId))}>恢复原任务</button>{task.assets?.map((asset: MediaAsset) => <Preview key={asset.path} asset={asset} sessionId={sessionId} />)}</div>)}</details></section>}
      {message && <div className="media-feedback" role="status">{message}</div>}
      <footer className="media-footer">对话即创作 · 沿用已选模型与参数</footer>
    </div>
  </aside>
}
