import { useEffect, useState } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from 'dsh-better-sidebar/client/service'
import type { TabComponentProps } from 'dsh-better-sidebar/client/service'
import { Check, Copy, Download, FileText, FolderOpen } from 'lucide-react'
import type { FileExtraction, PreparedFile, UploadedFileBytes } from '../shared/types.js'
import { preferredExtractionKind } from '../shared/types.js'
import styles from './viewer.module.css'
import { UniversalPreview, installUniversalViewer, type WorkspaceRemote } from './universal-viewer.js'
import { openNativeViewer, prefersNativeOffice, workspaceFileAddress } from './file-routing.js'
import { readPreviewBytes } from './bounded-read.js'

export const inject = ['betterSidebar', 'slots', 'sidebarRight', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles', 'remote.zerowallFiles']

interface AttachmentActionDetail {
  file: Pick<PreparedFile, 'attachmentId' | 'name'> | PreparedFile
  sessionId: string
  cwd?: string
  view?: 'original' | 'parsed'
  complete?: (success: boolean, error?: string) => void
}

interface FilesRemote {
  readOriginalRange(input: { sessionId: string; attachmentId: string; offset: number; length: number }): Promise<RemoteResult<{ data: string; bytes: number; eof: boolean; version: string; name: string }>>
  renderOfficeAttachment(input: { sessionId: string; attachmentId: string }, signal: AbortSignal): Promise<RemoteResult<{ data: string; missingFonts: string[] }>>
  inspectOriginalMetadata(input: { sessionId: string; attachmentId: string }): Promise<RemoteResult<PreparedFile>>
  inspect(input: { sessionId: string; attachmentId: string; view?: 'original' | 'parsed'; kind?: 'local' | 'mineru' }): Promise<RemoteResult<PreparedFile>>
  getExtraction(input: { sessionId: string; attachmentId: string; kind: 'local' | 'mineru' }): Promise<RemoteResult<FileExtraction | undefined>>
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
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [pdfFallback, setPdfFallback] = useState<string>()

  useEffect(() => {
    let live = true
    const controller = new AbortController()
    setFile(meta?.initial ?? null)
    setPayload(null)
    setPreviewBytes(null); setPdfFallback(undefined)
    setError(null)
    if (meta === undefined) {
      setError('附件信息无效。')
      return () => { live = false }
    }
    const metadataRequest = meta.view === 'parsed'
      ? remote.inspect({ sessionId: scope.sessionId, attachmentId: meta.attachmentId, view: 'parsed' })
      : remote.inspectOriginalMetadata({ sessionId: scope.sessionId, attachmentId: meta.attachmentId })
    const payloadRequest = meta.view === 'parsed' ? undefined : readPreviewBytes(async (offset, length) => {
      const v = remoteValue('readOriginalRange', await remote.readOriginalRange({ sessionId: scope.sessionId, attachmentId: meta.attachmentId, offset, length }))
      return { ...v, data: Uint8Array.from(atob(v.data), c => c.charCodeAt(0)) }
    }, controller.signal)
    void Promise.all([metadataRequest, payloadRequest]).then(([metadataResponse, downloadResponse]) => {
      if (!live) return
      const metadata = remoteValue<PreparedFile>(meta.view === 'parsed' ? 'zerowallFiles.inspect' : 'zerowallFiles.inspectOriginalMetadata', metadataResponse)
      if (meta.view === 'parsed') {
        setFile(metadata)
        return
      }
      const bytes: UploadedFileBytes = { ...metadata, data: btoa(Array.from(downloadResponse!, v => String.fromCharCode(v)).join('')) }
      setFile(metadata)
      setPayload(bytes)
      setPreviewBytes(downloadResponse!)
    }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => { live = false; controller.abort() }
  }, [meta?.attachmentId, meta?.initial, meta?.view, remote, scope.sessionId, retry])

  useEffect(() => {
    if (!file || meta?.view === 'parsed' || ![file.localExtraction, file.mineruExtraction].some(item => item && ['queued', 'running'].includes(item.state))) return
    let live = true
    const timer = setTimeout(() => {
      void remote.inspectOriginalMetadata({ sessionId: scope.sessionId, attachmentId: file.attachmentId }).then(result => {
        if (live) setFile(remoteValue('parseStatus', result))
      }).catch(cause => { if (live) setError(errorText(cause)) })
    }, 2000)
    return () => { live = false; clearTimeout(timer) }
  }, [file, meta?.view, remote, scope.sessionId])

  if (error !== null && file === null) return <div className={styles.state} role="alert">{error}</div>
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
      const kind = availableExtraction(file.name, local, mineru)
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
        <button type="button" title="复制文件" onClick={() => { void copyAttachment(remote, { file, sessionId: scope.sessionId, ...(scope.cwd === undefined ? {} : { cwd: scope.cwd }) }).then(success => { if (!success) setError('无法将文件复制到系统剪贴板。') }, cause => setError(errorText(cause))) }}>
          <Copy size={16} />
        </button>
        <button type="button" title="下载文件" onClick={() => { void downloadAttachment() }}>
          <Download size={16} />
        </button>
        {scope.cwd !== undefined && <button type="button" title={meta?.view === 'parsed' ? '在工作区打开解析结果' : '在工作区打开原文件'} onClick={() => { void (meta?.view === 'parsed' ? openParsedInWorkspace() : openInWorkspace()) }}>
          <FolderOpen size={16} />
        </button>}
        {meta?.view !== 'parsed' && <button type="button" title="查看解析结果" onClick={() => { void openParsedAttachment(ctx, remote, { file, sessionId: scope.sessionId, ...(scope.cwd === undefined ? {} : { cwd: scope.cwd }) }).catch(cause => setError(errorText(cause))) }}>
          <Check size={16} />
        </button>
        }
      </header>
      {[file.localExtraction, file.mineruExtraction].filter((item): item is FileExtraction => !!item).map(item => <div key={item.kind} className={styles.state} data-extraction-state={item.state}>
        {item.kind === 'local' ? '本地解析' : 'MinerU'}：{extractionStateLabel(item.state)}
        {item.warning && <span> · {item.warning}</span>}{item.error && <span role="alert"> · {item.error}</span>}
        {item.taskId && <span> · 任务 {item.taskId}</span>}
      </div>)}
      {error !== null && <div className={styles.state} role="alert">{error}</div>}
      {meta?.view === 'parsed' && file.preview !== undefined && <pre className={styles.preview}>{file.preview}</pre>}
      {pdfFallback && <iframe className={styles.frame} src={pdfFallback} title={`${file.name} · Office→PDF`} />}
      {previewBytes !== null && !pdfFallback && text === undefined && <UniversalPreview name={file.name} bytes={previewBytes} retry={() => setRetry(v => v + 1)} {...(/\.(docx?|pptx?|xlsx?)$/iu.test(file.name) ? { fallback: () => {
        void remote.renderOfficeAttachment({ sessionId: scope.sessionId, attachmentId: file.attachmentId }, new AbortController().signal).then(result => {
          const v = remoteValue('Office→PDF', result)
          setPdfFallback(`data:application/pdf;base64,${v.data}`)
          if (v.missingFonts.length) setError(`缺少字体：${v.missingFonts.join(', ')}`)
        }).catch(cause => setError(errorText(cause)))
      } } : {})} nativeFallback={() => {
        void remote.materializeOriginal({ sessionId: scope.sessionId, attachmentId: file.attachmentId }).then(result => {
          const materialized = remoteValue('原生查看器', result)
          openNativeViewer(ctx, workspaceFileAddress(scope.sessionId, materialized.path))
        }).catch(cause => setError(errorText(cause)))
      }} />}
      {text !== undefined && <pre className={styles.preview}>{text}</pre>}
    </article>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function errorText(cause: unknown): string { return cause instanceof Error ? cause.message : String(cause) }

function extractionStateLabel(state: FileExtraction['state']): string {
  return { queued: '排队中', running: '进行中', done: '完成', failed: '失败', needs_ocr: '需要 OCR', needs_configuration: '需要配置', partial: '部分完成，可继续恢复' }[state]
}
function availableExtraction(name: string, local: RemoteResult<FileExtraction | undefined>, mineru: RemoteResult<FileExtraction | undefined>): 'local' | 'mineru' | undefined {
  const ref = { name, ...(local.ok && local.value ? { localExtraction: local.value } : {}), ...(mineru.ok && mineru.value ? { mineruExtraction: mineru.value } : {}) }
  const kind = preferredExtractionKind(ref)
  return (kind === 'local' ? ref.localExtraction : ref.mineruExtraction)?.state === 'done' ? kind : undefined
}

function openAttachmentTab(ctx: ClientContext, detail: AttachmentActionDetail): void {
  const scope = { sessionId: detail.sessionId, ...(detail.cwd === undefined ? {} : { cwd: detail.cwd }) }
  ctx.betterSidebar.openTab({
    type: 'zerowall:attachment-viewer',
    id: `zerowall:attachment-viewer:${detail.file.attachmentId}`,
    title: detail.file.name,
    meta: {
      attachmentId: detail.file.attachmentId,
      ...(detail.view === 'parsed' ? { view: 'parsed' as const } : {}),
      ...(isPreparedFile(detail.file) ? { initial: detail.file } : {}),
    },
  }, scope)
}

function openParsedAttachmentTab(ctx: ClientContext, detail: AttachmentActionDetail): void {
  const scope = { sessionId: detail.sessionId, ...(detail.cwd === undefined ? {} : { cwd: detail.cwd }) }
  ctx.betterSidebar.openTab({
    type: 'zerowall:attachment-viewer',
    id: `zerowall:attachment-viewer:${detail.file.attachmentId}:parsed`,
    title: `${detail.file.name} · 解析结果`,
    meta: { attachmentId: detail.file.attachmentId, view: 'parsed', ...(isPreparedFile(detail.file) ? { initial: detail.file } : {}) },
  }, scope)
}

async function openOriginalAttachment(ctx: ClientContext, remote: FilesRemote, detail: AttachmentActionDetail): Promise<void> {
  if (prefersNativeOffice(detail.file.name)) {
    // Materialization verifies session ownership and preserves the original
    // bytes. DSH can resolve this absolute path even without a workspace cwd.
    const materialized = remoteValue('zerowallFiles.materializeOriginal', await remote.materializeOriginal({ sessionId: detail.sessionId, attachmentId: detail.file.attachmentId }))
    openNativeViewer(ctx, workspaceFileAddress(detail.sessionId, materialized.path))
    return
  }
  if (detail.cwd === undefined) {
    remoteValue('zerowallFiles.inspectOriginalMetadata', await remote.inspectOriginalMetadata({ sessionId: detail.sessionId, attachmentId: detail.file.attachmentId }))
    openAttachmentTab(ctx, detail)
    return
  }
  const response = await remote.materializeOriginal({ sessionId: detail.sessionId, attachmentId: detail.file.attachmentId })
  const materialized = remoteValue<{ path: string }>('zerowallFiles.materializeOriginal', response)
  ctx.betterSidebar.openFile({ sessionId: detail.sessionId, cwd: detail.cwd }, materialized.path, detail.file.name)
}

async function openParsedAttachment(ctx: ClientContext, remote: FilesRemote, detail: AttachmentActionDetail): Promise<void> {
  if (detail.cwd === undefined) {
    openParsedAttachmentTab(ctx, detail)
    return
  }
  const [mineru, local] = await Promise.all([
    remote.getExtraction({ sessionId: detail.sessionId, attachmentId: detail.file.attachmentId, kind: 'mineru' }),
    remote.getExtraction({ sessionId: detail.sessionId, attachmentId: detail.file.attachmentId, kind: 'local' }),
  ])
  const kind = availableExtraction(detail.file.name, local, mineru)
  if (kind === undefined) throw new Error('该附件尚无可打开的解析结果。')
  const response = await remote.materializeExtraction({ sessionId: detail.sessionId, attachmentId: detail.file.attachmentId, kind })
  const materialized = remoteValue<{ path: string; name: string }>('zerowallFiles.materializeExtraction', response)
  ctx.betterSidebar.openFile({ sessionId: detail.sessionId, cwd: detail.cwd }, materialized.path, materialized.name)
}

async function copyAttachment(remote: FilesRemote, detail: AttachmentActionDetail): Promise<boolean> {
  const response = await remote.downloadOriginal({ sessionId: detail.sessionId, attachmentId: detail.file.attachmentId })
  const downloaded = remoteValue<UploadedFileBytes>('zerowallFiles.downloadOriginal', response)
  const desktop = (window as unknown as { zerowallDesktop?: { copyFile?(input: { name: string; mediaType: string; data: string }): Promise<boolean> } }).zerowallDesktop
  if (desktop?.copyFile !== undefined) {
    try {
      if (await desktop.copyFile({ name: downloaded.name, mediaType: downloaded.mediaType, data: downloaded.data })) return true
    } catch { /* Try the browser's binary clipboard when the desktop bridge is unavailable. */ }
  }
  if (navigator.clipboard?.write !== undefined && typeof ClipboardItem !== 'undefined') {
    try {
      const binary = atob(downloaded.data)
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
      await navigator.clipboard.write([new ClipboardItem({ [downloaded.mediaType || 'application/octet-stream']: new Blob([bytes], { type: downloaded.mediaType || 'application/octet-stream' }) })])
      return true
    } catch { /* Binary clipboard support is optional in browsers. */ }
  }
  // A copied filename is not a copied file. Let the caller show a failure.
  return false
}

export function apply(ctx: ClientContext): void {
  // Keep the remote namespace out of delayed slot/event callbacks. Cordis's
  // remote proxy requires an active inject fiber for dotted property reads.
  const remote = ctx.get('remote.zerowallFiles') as FilesRemote
  installUniversalViewer(ctx, ctx.get('remote.workspaceFiles') as WorkspaceRemote)

  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: 'zerowall:attachment-viewer',
    title: '附件预览',
    icon: size => <FileText size={size} />,
    hidden: true,
    dedupeKey: tab => { const meta = attachmentMeta(tab.meta); return meta === undefined ? undefined : `${meta.attachmentId}:${meta.view}` },
    component: props => <AttachmentViewer {...props} remote={remote} />,
  }), 'zerowall: attachment viewer')

  ctx.effect(() => {
    const open = (event: Event): void => {
      const detail = (event as CustomEvent<AttachmentActionDetail>).detail
      if (typeof detail?.sessionId !== 'string' || typeof detail.file?.attachmentId !== 'string') return
      event.preventDefault()
      const task = detail.view === 'parsed' ? openParsedAttachment(ctx, remote, detail) : openOriginalAttachment(ctx, remote, detail)
      void task.then(() => detail.complete?.(true), cause => detail.complete?.(false, errorText(cause)))
    }
    const copy = (event: Event): void => {
      const detail = (event as CustomEvent<AttachmentActionDetail>).detail
      if (typeof detail?.sessionId !== 'string' || typeof detail.file?.attachmentId !== 'string') return
      event.preventDefault()
      void copyAttachment(remote, detail).then(success => detail.complete?.(success, success ? undefined : '系统剪贴板不支持复制此文件。'), cause => detail.complete?.(false, errorText(cause)))
    }
    window.addEventListener('zerowall:attachment-open', open)
    window.addEventListener('zerowall:attachment-copy', copy)
    const readd = (event: Event): void => {
      const detail = (event as CustomEvent<{ attachmentId?: unknown; sessionId?: unknown; complete?: (success: boolean, error?: string) => void }>).detail
      if (typeof detail?.attachmentId !== 'string') return
      if (typeof detail.sessionId !== 'string' || detail.sessionId.length === 0) return
      event.preventDefault()
      const sessionId = detail.sessionId
      void remote.downloadOriginal({ sessionId, attachmentId: detail.attachmentId }).then(response => {
        if (!response.ok) throw new Error(response.error.message)
        const value = response.value
        const binary = atob(value.data)
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
        const file = new File([bytes], value.name, { type: value.mediaType || 'application/octet-stream' })
        const filesEvent = new CustomEvent('zerowall:attachment-files', { cancelable: true, detail: { files: [file], sessionId, complete: detail.complete } })
        window.dispatchEvent(filesEvent)
        if (!filesEvent.defaultPrevented) detail.complete?.(false, '当前会话的输入区无法接收附件。')
      }).catch(cause => detail.complete?.(false, errorText(cause)))
    }
    window.addEventListener('zerowall:attachment-readd', readd)
    return () => {
      window.removeEventListener('zerowall:attachment-open', open)
      window.removeEventListener('zerowall:attachment-copy', copy)
      window.removeEventListener('zerowall:attachment-readd', readd)
    }
  }, 'zerowall: attachment actions')
}
