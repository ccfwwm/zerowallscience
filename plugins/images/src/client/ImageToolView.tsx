import type { Context } from '@deepseek-ai/cordis'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { AlertTriangle, ExternalLink, ImageIcon, LoaderCircle } from 'lucide-react'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import css from './ImageToolView.module.css'

interface ImageMeta {
  path: string
  model: string
  image?: ImageAttachmentRef
  previewWarning?: string
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function imageRef(value: unknown): ImageAttachmentRef | undefined {
  const item = record(value)
  if (item === undefined || typeof item.attachmentId !== 'string' || item.mediaType !== 'image/png'
    || typeof item.bytes !== 'number' || typeof item.width !== 'number' || typeof item.height !== 'number') return undefined
  return {
    attachmentId: item.attachmentId as ImageAttachmentRef['attachmentId'],
    mediaType: item.mediaType,
    bytes: item.bytes,
    width: item.width,
    height: item.height,
    ...(typeof item.name === 'string' ? { name: item.name } : {}),
  }
}

export function imageToolMeta(value: unknown): ImageMeta | undefined {
  const meta = record(value)
  if (meta === undefined || typeof meta.path !== 'string' || typeof meta.model !== 'string') return undefined
  const image = imageRef(meta.image)
  return {
    path: meta.path,
    model: meta.model,
    ...(image === undefined ? {} : { image }),
    ...(typeof meta.previewWarning === 'string' ? { previewWarning: meta.previewWarning } : {}),
  }
}

function fileName(path: string): string {
  const parts = path.split(/[\\/]/u)
  return parts[parts.length - 1] || path
}

function resultText(block: ToolCallViewProps['block']): string | undefined {
  if (!('kind' in block)) return undefined
  const text = block.content.flatMap(item => item.type === 'text' ? [item.text] : []).join('\n').trim()
  return text || undefined
}

function GeneratedImagePreview({ attachment, load }: {
  attachment: ImageAttachmentRef
  load: (attachment: ImageAttachmentRef) => Promise<string>
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const close = useCallback(() => { setOpen(false) }, [])
  const label = attachment.name ?? 'Generated image'
  const fit = useMemo(() => {
    const natural = attachment.width / attachment.height
    const ratio = Math.min(4, Math.max(0.25, natural))
    const box = ratio >= 1 ? { width: 240, height: 240 / ratio } : { width: 240 * ratio, height: 240 }
    const scale = Math.min(1, attachment.width / box.width, attachment.height / box.height)
    return {
      width: Math.max(1, Math.round(box.width * scale)),
      height: Math.max(1, Math.round(box.height * scale)),
      objectPosition: natural < 0.25 ? 'center top' : natural > 4 ? 'left center' : 'center',
    }
  }, [attachment.height, attachment.width])

  useEffect(() => {
    let live = true
    setFailed(false)
    setSrc(null)
    void load(attachment)
      .then(url => { if (live) setSrc(url) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [attachment, attempt, load])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [close, open])

  if (failed) {
    return <button type="button" className={css.previewError} onClick={() => setAttempt(value => value + 1)}>Preview failed. Retry</button>
  }
  return (
    <>
      <button
        type="button"
        className={css.previewFrame}
        style={{ width: fit.width, height: fit.height }}
        title="Open full-size image"
        aria-label={`Open ${label}`}
        onClick={() => { if (src !== null) setOpen(true) }}
      >
        {src === null
          ? <span className={css.previewLoading}>Loading image...</span>
          : <img src={src} alt={label} style={{ objectPosition: fit.objectPosition }} />}
      </button>
      <Modal open={open && src !== null} onClose={close} title="Image preview" closeLabel="Close image preview" className={css.lightboxDialog}>
        {src !== null ? <img className={css.lightboxImage} src={src} alt={label} /> : null}
      </Modal>
    </>
  )
}

export function ImageToolRow({ conversation, ...props }: ToolCallViewProps & { conversation: IConversation }) {
  const { block, toolName, openFile, sessionId } = props
  const settled = 'kind' in block
  const meta = settled ? imageToolMeta(block.meta) : undefined
  const failed = settled && block.isError
  const title = toolName === 'edit_image' ? 'Edit image' : 'Generate image'
  const path = meta?.path ?? (() => {
    const raw = settled ? block.call?.argsRaw : block.argsRaw
    try {
      const args = raw === undefined ? undefined : JSON.parse(raw) as Record<string, unknown>
      return typeof args?.output_path === 'string' ? args.output_path : undefined
    } catch {
      return undefined
    }
  })()

  return (
    <section className={css.card} data-state={!settled ? 'running' : failed ? 'error' : 'ok'}>
      <header className={css.header}>
        <span className={css.icon} aria-hidden="true"><ImageIcon size={16} /></span>
        <span className={css.heading}>
          <strong>{title}</strong>
          <span>{path === undefined ? toolName : fileName(path)}</span>
        </span>
        {!settled ? <LoaderCircle className={css.spin} size={16} aria-label="Working" /> : null}
        {path !== undefined ? (
          <button type="button" className={css.open} title="Open image file" aria-label="Open image file" onClick={() => openFile(path)}>
            <ExternalLink size={15} />
          </button>
        ) : null}
      </header>

      {meta?.image !== undefined ? (
        <div className={css.preview}>
          <GeneratedImagePreview
            attachment={meta.image}
            load={attachment => conversation.resolveImage(sessionId, attachment)}
          />
        </div>
      ) : null}

      {meta !== undefined ? (
        <div className={css.meta}>
          <span>{meta.model}</span>
          <span>{meta.image === undefined ? 'File saved' : `${meta.image.width} x ${meta.image.height}`}</span>
        </div>
      ) : null}

      {meta?.previewWarning !== undefined ? (
        <p className={css.warning}><AlertTriangle size={14} aria-hidden="true" />{meta.previewWarning}</p>
      ) : null}
      {failed ? <p className={css.error}>{resultText(block) ?? 'Image operation failed.'}</p> : null}
    </section>
  )
}

export function registerImageToolViews(ctx: Context): void {
  ctx.slots.inject('tool.call.toolview', function* () {
    const View = (props: ToolCallViewProps) => <ImageToolRow {...props} conversation={ctx.conversation} />
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'generate_image' }, View)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'edit_image' }, View)
  })
}
