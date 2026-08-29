import { useEffect, useState } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from 'dsh-better-sidebar/client/service'
import type { TabComponentProps } from 'dsh-better-sidebar/client/service'
import { Copy, FileText } from 'lucide-react'
import type { PreparedFile, UploadedFileBytes } from '../shared/types.js'
import styles from './viewer.module.css'

export const inject = ['betterSidebar', 'remote', 'remote.zerowallFiles']

interface AttachmentActionDetail {
  file: PreparedFile
  sessionId: string
  cwd?: string
}

interface FilesRemote {
  inspect(input: { sessionId: string; attachmentId: string }): Promise<RemoteResult<PreparedFile>>
  materialize(input: { sessionId: string; attachmentId: string }): Promise<RemoteResult<{ path: string }>>
  download(input: { sessionId: string; attachmentId: string }): Promise<RemoteResult<UploadedFileBytes>>
}

function remoteValue<T>(name: string, result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw new Error(`${name} failed: ${result.error.code}: ${result.error.message}`)
}

function attachmentMeta(value: unknown): { attachmentId: string } | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const attachmentId = (value as { attachmentId?: unknown }).attachmentId
  return typeof attachmentId === 'string' ? { attachmentId } : undefined
}

function AttachmentViewer({ remote, scope, tab }: TabComponentProps & { remote: FilesRemote }) {
  const meta = attachmentMeta(tab.meta)
  const [file, setFile] = useState<PreparedFile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setFile(null)
    setError(null)
    if (meta === undefined) {
      setError('附件信息无效。')
      return () => { live = false }
    }
    void remote.inspect({ sessionId: scope.sessionId, attachmentId: meta.attachmentId }).then((response: unknown) => {
      if (live) setFile(remoteValue<PreparedFile>('zerowallFiles.inspect', response))
    }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => { live = false }
  }, [meta?.attachmentId, remote, scope.sessionId])

  if (error !== null) return <div className={styles.state} role="alert">{error}</div>
  if (file === null) return <div className={styles.state}>正在读取附件…</div>
  return (
    <article className={styles.viewer}>
      <header className={styles.header}>
        <FileText size={22} />
        <div>
          <strong>{file.name}</strong>
          <span>{file.mediaType} · {formatBytes(file.bytes)}</span>
        </div>
        <button type="button" title="复制文件" onClick={() => { void copyAttachment(remote, { file, sessionId: scope.sessionId, ...(scope.cwd === undefined ? {} : { cwd: scope.cwd }) }) }}>
          <Copy size={16} />
        </button>
      </header>
      {file.warning !== undefined && <p className={styles.warning}>{file.warning}</p>}
      <pre className={styles.preview}>{file.preview.trim() === '' ? '该文件没有可直接显示的文本内容。' : file.preview}</pre>
    </article>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function openAttachment(ctx: ClientContext, remote: FilesRemote, detail: AttachmentActionDetail): Promise<void> {
  const scope = { sessionId: detail.sessionId, ...(detail.cwd === undefined ? {} : { cwd: detail.cwd }) }
  if (detail.cwd !== undefined) {
    try {
      const response = await remote.materialize({ sessionId: detail.sessionId, attachmentId: detail.file.attachmentId })
      const materialized = remoteValue<{ path: string }>('zerowallFiles.materialize', response)
      ctx.betterSidebar.openFile(scope, materialized.path, detail.file.name)
      return
    } catch {
      // A stale or unavailable workspace falls through to the session viewer.
    }
  }
  ctx.betterSidebar.openTab({
    type: 'zerowall:attachment-viewer',
    id: `zerowall:attachment-viewer:${detail.file.attachmentId}`,
    title: detail.file.name,
    meta: { attachmentId: detail.file.attachmentId },
  }, scope)
}

async function copyAttachment(remote: FilesRemote, detail: AttachmentActionDetail): Promise<void> {
  try {
    const response = await remote.download({ sessionId: detail.sessionId, attachmentId: detail.file.attachmentId })
    const file = remoteValue<UploadedFileBytes>('zerowallFiles.download', response)
    const desktop = (window as unknown as { zerowallDesktop?: { copyFile?(input: { name: string; mediaType: string; data: string }): Promise<boolean> } }).zerowallDesktop
    if (await desktop?.copyFile?.({ name: file.name, mediaType: file.mediaType, data: file.data })) return
  } catch {
    // Text fallback below preserves a useful clipboard result.
  }
  const summary = detail.file.preview?.replace(/\s+/gu, ' ').trim()
  await navigator.clipboard.writeText(summary ? `${detail.file.name}\n${summary}` : detail.file.name)
}

export function apply(ctx: ClientContext): void {
  const remote = (ctx.remote as any).zerowallFiles as FilesRemote

  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: 'zerowall:attachment-viewer',
    title: '附件预览',
    icon: size => <FileText size={size} />,
    hidden: true,
    dedupeKey: tab => attachmentMeta(tab.meta)?.attachmentId,
    component: props => <AttachmentViewer {...props} remote={remote} />,
  }), 'zerowall: attachment viewer')

  ctx.effect(() => {
    const open = (event: Event): void => { void openAttachment(ctx, remote, (event as CustomEvent<AttachmentActionDetail>).detail) }
    const copy = (event: Event): void => { void copyAttachment(remote, (event as CustomEvent<AttachmentActionDetail>).detail) }
    window.addEventListener('zerowall:attachment-open', open)
    window.addEventListener('zerowall:attachment-copy', copy)
    return () => {
      window.removeEventListener('zerowall:attachment-open', open)
      window.removeEventListener('zerowall:attachment-copy', copy)
    }
  }, 'zerowall: attachment actions')
}
