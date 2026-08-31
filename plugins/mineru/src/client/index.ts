import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { PreparedFile } from '@zerowallscience/plugin-files/types'

export const inject = ['remote', 'sessions', 'remote.zerowallFiles', 'remote.zerowallMineru']
interface FilesRemote { materialize(input: { sessionId: string; attachmentId: string }): Promise<RemoteResult<{ path: string }>> }
interface SessionBinding { prompt(content: Array<{ type: 'text'; text: string }>, mode?: 'queue'): Promise<void> }
function unwrap<T>(value: RemoteResult<T>): T { if (value.ok) return value.value; throw new Error(value.error.message) }
export function apply(ctx: ClientContext): void {
  const remote = ctx.remote as any
  const files = (ctx.get('remote.zerowallFiles') ?? remote?.zerowallFiles) as FilesRemote | undefined
  ctx.effect(() => {
    const listener = (event: Event): void => {
      const detail = (event as CustomEvent<{ file: PreparedFile; sessionId: string }>).detail
      if (!detail?.file?.attachmentId || !detail.sessionId) return
      void (async () => {
        const materialized = files ? unwrap(await files.materialize({ sessionId: detail.sessionId, attachmentId: detail.file.attachmentId })) : undefined
        const path = materialized?.path ?? detail.file.name
        const binding = (ctx.sessions as any).binding?.(detail.sessionId)?.session as SessionBinding | undefined
        await binding?.prompt([{ type: 'text', text: `请使用 MinerU 解析当前附件“${detail.file.name}”，文件路径：${path}。先调用 mineru_activate，再调用 mineru_parse；解析结果先保存为 Artifact，不要自动登记图谱或修改 PPT。` }], 'queue')
      })().catch(() => undefined)
    }
    window.addEventListener('zerowall:mineru-parse-attachment', listener)
    return () => window.removeEventListener('zerowall:mineru-parse-attachment', listener)
  }, 'zerowall: mineru attachment bridge')
}
