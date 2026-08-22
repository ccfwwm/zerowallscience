import type { Context } from '@deepseek-ai/cordis'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { MessageImage, type MessageImageLabels } from '@deepseek-ai/dsh-client-ui-attachment/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { AlertTriangle, ExternalLink, ImageIcon, LoaderCircle } from 'lucide-react'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './ImageToolView.module.css'

interface ImageMeta {
  path: string
  model: string
  image?: ImageAttachmentRef
  previewWarning?: string
}

const LABELS: MessageImageLabels = {
  image: 'Generated image',
  open: 'Open full-size image',
  openNamed: label => `Open ${label}`,
  loading: 'Loading image...',
  loadFailed: 'Preview failed. Retry',
  lightbox: { dialog: 'Image preview', close: 'Close image preview' },
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
          <MessageImage
            attachment={meta.image}
            load={attachment => conversation.resolveImage(sessionId, attachment)}
            variant="single"
            labels={LABELS}
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
