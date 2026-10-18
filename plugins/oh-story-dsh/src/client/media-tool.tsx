import { useEffect, useState } from 'react'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { MediaAsset, MediaJob } from '@zerowallscience/plugin-ai-cloud/types'
import { Preview, mediaJobStatus, shouldRefreshMediaJob, canStopMediaJob, type Call } from './components.js'
import styles from './media.css?inline'

export function MediaToolRow({ block, toolName, sessionId, call }: ToolCallViewProps & { call: Call }) {
  const text = 'kind' in block ? block.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n') : ''
  const [live, setLive] = useState<MediaJob | undefined>()
  let data: any
  try { data = text ? JSON.parse(text) : undefined } catch {}
  const initial = data?.requestId && data?.state ? data as MediaJob : undefined
  useEffect(()=>{setLive(undefined)},[text,sessionId])
  const job = live ?? initial
  useEffect(() => {
    if (!job || !shouldRefreshMediaJob(job)) return
    let disposed = false, busy = false, timer: ReturnType<typeof setInterval> | undefined
    const refresh = async () => {
      if (busy) return
      busy = true
      try {
        const listed = await call(sessionId, 'list')
        const stored = (listed.jobs??[]).find((item:MediaJob)=>item.id===job.id)
        const next = stored??await call(sessionId, 'refresh', { projectId: job.projectId, id: job.id, automatic: true })
        if (!disposed) {
          setLive(next)
          if(stored&&shouldRefreshMediaJob(stored))void call(sessionId,'refresh',{projectId:stored.projectId,id:stored.id,automatic:true}).catch(()=>{})
          if (!shouldRefreshMediaJob(next)) clearInterval(timer)
        }
      } catch {} finally { busy = false }
    }
    timer = setInterval(() => void refresh(), 5000); void refresh()
    return () => { disposed = true; clearInterval(timer) }
  }, [text, sessionId, live?.collection])
  const items: MediaAsset[] = job?.assets ?? (data?.path && data?.mediaType ? [data] : [])
  const title = toolName === 'media_import' ? '素材已导入' : toolName === 'media_project' ? '媒体项目' : '多媒体创作'
  const status = !('kind' in block) ? '正在处理…' : block.isError ? '处理失败' : job ? mediaJobStatus(job) : items.length ? '文件已就绪' : '已处理'
  const control = async (action: 'refresh'|'pause') => { if(job)setLive(await call(sessionId,action,{projectId:job.projectId,id:job.id})) }
  return <section className="media-studio media-inline" aria-label="对话媒体结果"><style>{styles}</style><div className="media-task"><header><strong>{title}</strong><span>{status}</span></header>{job && <p>{job.prompt}</p>}{job?.selection && <small>{job.selection.modelId}</small>}{job&&!['prepared','model-required'].includes(job.state)&&<div><button onClick={()=>void control('refresh').catch(()=>{})}>重新获取</button>{canStopMediaJob(job)&&<button onClick={()=>void control('pause').catch(()=>{})}>停止本地收集</button>}</div>}{items.map(asset => <Preview key={asset.path} asset={asset} sessionId={sessionId} />)}{('kind' in block && block.isError) && <p role="alert">{text}</p>}{job?.error && <p role="alert">{job.error}</p>}</div></section>
}
