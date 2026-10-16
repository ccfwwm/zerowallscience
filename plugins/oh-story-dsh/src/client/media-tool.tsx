import { useEffect, useState } from 'react'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { MediaAsset, MediaJob } from '@zerowallscience/plugin-ai-cloud/types'
import { Preview, type Call } from './components.js'
import styles from './media.css?inline'

export function MediaToolRow({ block, toolName, sessionId, call }: ToolCallViewProps & { call: Call }) {
  const text = 'kind' in block ? block.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n') : ''
  const [live, setLive] = useState<MediaJob | undefined>()
  let data: any
  try { data = text ? JSON.parse(text) : undefined } catch {}
  const initial = data?.requestId && data?.state ? data as MediaJob : undefined
  useEffect(() => {
    setLive(undefined)
    if (!initial || ['prepared', 'model-required', 'failed', 'rejected', 'cancelled'].includes(initial.state) || initial.assets.length) return
    let disposed = false, busy = false, timer: ReturnType<typeof setInterval> | undefined
    const refresh = async () => {
      if (busy) return
      busy = true
      try {
        const job = await call(sessionId, 'refresh', { projectId: initial.projectId, id: initial.id })
        if (!disposed) {
          setLive(job)
          if (job.assets.length || ['failed', 'rejected', 'cancelled', 'unknown', 'manual_review', 'submission-uncertain'].includes(job.state)) clearInterval(timer)
        }
      } catch {} finally { busy = false }
    }
    timer = setInterval(() => void refresh(), 5000); void refresh()
    return () => { disposed = true; clearInterval(timer) }
  }, [text, sessionId])
  const job = live ?? initial
  const items: MediaAsset[] = job?.assets ?? (data?.path && data?.mediaType ? [data] : [])
  const title = toolName === 'media_import' ? '素材已导入' : toolName === 'media_project' ? '媒体项目' : '多媒体创作'
  const status = !('kind' in block) ? '正在处理…' : block.isError ? '处理失败' : job ? ({ 'model-required': '暂无可用模型，请检查账号权限或模型设置', prepared: '草稿已保存', completed: '创作完成', succeeded: '创作完成', failed: '生成失败', 'submission-uncertain': '提交状态待核查，不会重复生成', unknown: '任务状态待核查' }[job.state] ?? '已提交，正在后台生成…') : items.length ? '文件已就绪' : '已处理'
  return <section className="media-studio media-inline" aria-label="对话媒体结果"><style>{styles}</style><div className="media-task"><header><strong>{title}</strong><span>{status}</span></header>{job && <p>{job.prompt}</p>}{job?.selection && <small>{job.selection.modelId}</small>}{items.map(asset => <Preview key={asset.path} asset={asset} sessionId={sessionId} />)}{('kind' in block && block.isError) && <p role="alert">{text}</p>}{job?.error && <p role="alert">{job.error}</p>}</div></section>
}
