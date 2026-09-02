import { useEffect, useState } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from 'dsh-better-sidebar/client/service'
import type { TabComponentProps } from 'dsh-better-sidebar/client/service'
import { Check, Copy, Download, FileText, FolderOpen } from 'lucide-react'
import type { PreparedFile, UploadedFileBytes } from '../shared/types.js'
import styles from './viewer.module.css'

export const inject = ['betterSidebar', 'remote', 'remote.zerowallFiles']

interface AttachmentActionDetail {
  file: PreparedFile
  sessionId: string
  cwd?: string
  view?: 'original' | 'parsed'
}

interface FilesRemote {
  inspectOriginalMetadata(input: { sessionId: string; attachmentId: string }): Promise<RemoteResult<PreparedFile>>
  inspect(input: { sessionId: string; attachmentId: string; view?: 'original' | 'parsed'; kind?: 'local' | 'mineru' }): Promise<RemoteResult<PreparedFile>>
  getExtraction(input: { sessionId: string; attachmentId: string; kind: 'local' | 'mineru' }): Promise<RemoteResult<{ kind: 'local' | 'mineru'; state: 'running' | 'done' | 'failed'; artifactPath?: string } | undefined>>
  materializeOriginal(input: { sessionId: string; attachmentId: string }): Promise<RemoteResult<{ path: string }>>
  materializeExtraction(input: { sessionId: string; attachmentId: string; kind: 'local' | 'mineru' }): Promise<RemoteResult<{ path: string; name: string }>>
  downloadOriginal(input: { sessionId: string; attachmentId: string }): Promise<RemoteResult<UploadedFileBytes>>
}

function remoteValue<T>(name: string, result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw new Error(`${name} failed: ${result.error.code}: ${result.error.message}`)
}

function attachmentMeta(value: unknown): { attachmentId: string; view: 'original' | 'parsed'; initial?: PreparedFile } | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const attachmentId = (value as { attachmentId?: unknown }).attachmentId
  const view = (value as { view?: unknown }).view
  const initial = (value as { initial?: unknown }).initial
  return typeof attachmentId === 'string'
    ? { attachmentId, view: view === 'parsed' ? 'parsed' : 'original', ...(isPreparedFile(initial) ? { initial } : {}) }
    : undefined
}

function isPreparedFile(value: unknown): value is PreparedFile {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Partial<PreparedFile>
  return typeof item.attachmentId === 'string' && typeof item.name === 'string'
}

function AttachmentViewer({ remote, scope, tab, ctx }: TabComponentProps & { remote: FilesRemote }) {
  const meta = attachmentMeta(tab.meta)
  const [file, setFile] = useState<PreparedFile | null>(meta?.initial ?? null)
  const [payload, setPayload] = useState<UploadedFileBytes | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    let url: string | undefined
    setFile(meta?.initial ?? null)
    setPayload(null)
    setObjectUrl(null)
    setError(null)
    if (meta === undefined) {
      setError('附件信息无效。')
      return () => { live = false }
    }
    const metadataRequest = meta.view === 'parsed'
      ? remote.inspect({ sessionId: scope.sessionId, attachmentId: meta.attachmentId, view: 'parsed' })
      : remote.inspectOriginalMetadata({ sessionId: scope.sessionId, attachmentId: meta.attachmentId })
    const payloadRequest = meta.view === 'parsed' ? undefined : remote.downloadOriginal({ sessionId: scope.sessionId, attachmentId: meta.attachmentId })
    void Promise.all([metadataRequest, payloadRequest]).then(([metadataResponse, downloadResponse]) => {
      if (!live) return
      const metadata = remoteValue<PreparedFile>(meta.view === 'parsed' ? 'zerowallFiles.inspect' : 'zerowallFiles.inspectOriginalMetadata', metadataResponse)
      if (meta.view === 'parsed') {
        setFile(metadata)
        return
      }
      const bytes = remoteValue<UploadedFileBytes>('zerowallFiles.downloadOriginal', downloadResponse!)
      const binary = atob(bytes.data)
      const data = Uint8Array.from(binary, char => char.charCodeAt(0))
      url = URL.createObjectURL(new Blob([data], { type: bytes.mediaType || 'application/octet-stream' }))
      setFile(metadata)
      setPayload(bytes)
      setObjectUrl(url)
    }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => { live = false; if (url !== undefined) URL.revokeObjectURL(url) }
  }, [meta?.attachmentId, meta?.initial, meta?.view, remote, scope.sessionId])

  if (error !== null) return <div className={styles.state} role="alert">{error}</div>
  if (file === null) return <div className={styles.state}>正在读取附件…</div>
  const downloadAttachment = async (): Promise<void> => {
    try {
      const bytes = payload ?? remoteValue<UploadedFileBytes>('zerowallFiles.downloadOriginal', await remote.downloadOriginal({ sessionId: scope.sessionId, attachmentId: file.attachmentId }))
      const binary = atob(bytes.data)
      const data = Uint8Array.from(binary, char => char.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([data], { type: bytes.mediaType || 'application/octet-stream' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = bytes.name || file.name
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const openInWorkspace = async (): Promise<void> => {
    try {
      const response = await remote.materializeOriginal({ sessionId: scope.sessionId, attachmentId: file.attachmentId })
      const materialized = remoteValue<{ path: string }>('zerowallFiles.materializeOriginal', response)
      ctx.betterSidebar.openFile(scope, materialized.path, file.name)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const openParsedInWorkspace = async (): Promise<void> => {
    try {
      // Ask the Host which parser actually produced the result. Parser names
      // are implementation details (for example `text-auto` and
      // `mineru-legacy`) and cannot safely be used as a kind discriminator.
      const [mineru, local] = await Promise.all([
        remote.getExtraction({ sessionId: scope.sessionId, attachmentId: file.attachmentId, kind: 'mineru' }),
        remote.getExtraction({ sessionId: scope.sessionId, attachmentId: file.attachmentId, kind: 'local' }),
      ])
      const kind = mineru.ok && mineru.value?.state === 'done'
        ? 'mineru'
        : local.ok && local.value?.state === 'done' ? 'local' : undefined
      if (kind === undefined) throw new Error('该附件尚无可打开的解析结果。')
      const response = await remote.materializeExtraction({ sessionId: scope.sessionId, attachmentId: file.attachmentId, kind })
      const materialized = remoteValue<{ path: string; name: string }>('zerowallFiles.materializeExtraction', response)
      ctx.betterSidebar.openFile(scope, materialized.path, materialized.name)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const text = payload !== null && (payload.mediaType.startsWith('text/') || payload.mediaType === 'application/json')
    ? new TextDecoder().decode(Uint8Array.from(atob(payload.data), char => char.charCodeAt(0)))
    : undefined
  return (
    <article className={styles.viewer}>
      <header className={styles.header}>
        <FileText size={22} />
        <div>
        <strong>{meta?.view === 'parsed' ? `${file.name} · 解析结果` : file.name}</strong>
          <span>{file.mediaType} · {formatBytes(file.bytes)}</span>
        </div>
        <button type="button" title="复制文件" onClick={() => { void copyAttachment(remote, { file, sessionId: scope.sessionId, ...(scope.cwd === undefined ? {} : { cwd: scope.cwd }) }) }}>
          <Copy size={16} />
        </button>
        <button type="button" title="下载文件" onClick={() => { void downloadAttachment() }}>
          <Download size={16} />
        </button>
        <button type="button" title={meta?.view === 'parsed' ? '在工作区打开解析结果' : '在工作区打开原文件'} onClick={() => { void (meta?.view === 'parsed' ? openParsedInWorkspace() : openInWorkspace()) }}>
          <FolderOpen size={16} />
        </button>
        {meta?.view !== 'parsed' && <button type="button" title="查看解析结果" onClick={() => openParsedAttachment(ctx, { file, sessionId: scope.sessionId, ...(scope.cwd === undefined ? {} : { cwd: scope.cwd }) })}>
          <Check size={16} />
        </button>
        }
      </header>
      {meta?.view === 'parsed' && file.preview !== undefined && <pre className={styles.preview}>{file.preview}</pre>}
      {objectUrl !== null && file.mediaType === 'application/pdf' && <iframe className={styles.frame} src={objectUrl} title={file.name} />}
      {objectUrl !== null && file.mediaType.startsWith('image/') && <div className={styles.imageWrap}><img src={objectUrl} alt={file.name} /></div>}
      {text !== undefined && <pre className={styles.preview}>{text}</pre>}
      {objectUrl !== null && text === undefined && file.mediaType !== 'application/pdf' && !file.mediaType.startsWith('image/') && <div className={styles.state}>该原文件不能在浏览器内直接预览，请使用工具栏下载或在工作区打开。</div>}
    </article>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function openAttachment(ctx: ClientContext, detail: AttachmentActionDetail): void {
  const scope = { sessionId: detail.sessionId, ...(detail.cwd === undefined ? {} : { cwd: detail.cwd }) }
  ctx.betterSidebar.openTab({
    type: 'zerowall:attachment-viewer',
    id: `zerowall:attachment-viewer:${detail.file.attachmentId}`,
    title: detail.file.name,
    meta: {
      attachmentId: detail.file.attachmentId,
      ...(detail.view === 'parsed' ? { view: 'parsed' as const } : {}),
      initial: detail.file,
    },
  }, scope)
}

function openParsedAttachment(ctx: ClientContext, detail: AttachmentActionDetail): void {
  const scope = { sessionId: detail.sessionId, ...(detail.cwd === undefined ? {} : { cwd: detail.cwd }) }
  ctx.betterSidebar.openTab({
    type: 'zerowall:attachment-viewer',
    id: `zerowall:attachment-viewer:${detail.file.attachmentId}:parsed`,
    title: `${detail.file.name} · 解析结果`,
    meta: { attachmentId: detail.file.attachmentId, view: 'parsed', initial: detail.file },
  }, scope)
}

async function copyAttachment(remote: FilesRemote, detail: AttachmentActionDetail): Promise<void> {
  try {
    const response = await remote.downloadOriginal({ sessionId: detail.sessionId, attachmentId: detail.file.attachmentId })
    const file = remoteValue<UploadedFileBytes>('zerowallFiles.downloadOriginal', response)
    const desktop = (window as unknown as { zerowallDesktop?: { copyFile?(input: { name: string; mediaType: string; data: string }): Promise<boolean> } }).zerowallDesktop
    if (await desktop?.copyFile?.({ name: file.name, mediaType: file.mediaType, data: file.data })) return
  } catch {
    // Text fallback below preserves a useful clipboard result.
  }
  await navigator.clipboard.writeText(detail.file.name)
}

export function apply(ctx: ClientContext): void {
  const remote = (ctx.remote as any).zerowallFiles as FilesRemote

  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: 'zerowall:attachment-viewer',
    title: '附件预览',
    icon: size => <FileText size={size} />,
    hidden: true,
    dedupeKey: tab => { const meta = attachmentMeta(tab.meta); return meta === undefined ? undefined : `${meta.attachmentId}:${meta.view}` },
    component: props => <AttachmentViewer {...props} remote={remote} />,
  }), 'zerowall: attachment viewer')

  ctx.effect(() => {
    const open = (event: Event): void => { openAttachment(ctx, (event as CustomEvent<AttachmentActionDetail>).detail) }
    const copy = (event: Event): void => { void copyAttachment(remote, (event as CustomEvent<AttachmentActionDetail>).detail) }
    window.addEventListener('zerowall:attachment-open', open)
    window.addEventListener('zerowall:attachment-copy', copy)
    return () => {
      window.removeEventListener('zerowall:attachment-open', open)
      window.removeEventListener('zerowall:attachment-copy', copy)
    }
  }, 'zerowall: attachment actions')
}
