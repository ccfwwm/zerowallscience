/** User-message projection that keeps serialized review context out of the visible bubble. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import {
  IconArchiveOutline20,
  IconBrowseOutline16,
  IconCodeOutline16,
  IconCopyOutline16,
  IconDataOutline16,
  IconFolderClose16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import { ReviewCommentPill } from './ReviewCommentPill.tsx'
import css from './ProducedFiles.module.css'

const REVIEW_START = '<file_review_comments>'
const REVIEW_END = '</file_review_comments>'

interface ProjectedReviewComment {
  readonly path: string
  readonly kind: 'context' | 'del' | 'add'
  readonly oldLine: string
  readonly newLine: string
  readonly body: string
}

interface ReviewMessageProjection {
  readonly commentCount: number
  readonly comments: readonly ProjectedReviewComment[]
  readonly visibleText: string
}

type UserMessageProps = ChatNodeViewProps<'user' | 'steering'> & {
  readonly reviewT: TranslateNS<typeof NS>
}

type ImageAttachment = import('@deepseek-ai/dsh-attachment').ImageAttachmentRef

interface ChatFileAttachment {
  readonly attachmentId: string
  readonly name: string
  readonly mediaType: string
  readonly bytes: number
  readonly parser?: string
  readonly status?: string
  readonly textChars?: number
  readonly pageCount?: number
  readonly sheetCount?: number
  readonly preview?: string
  readonly content?: string
  readonly parseStatus?: 'idle' | 'queued' | 'running' | 'done' | 'failed'
  readonly parseProgress?: number
  readonly parseError?: string
}

interface ContentParts {
  readonly text: string
  readonly images: readonly { readonly attachment: ImageAttachment }[]
  readonly files: readonly ChatFileAttachment[]
  readonly rest: readonly unknown[]
}

type MutableChatFileAttachment = { -readonly [Key in keyof ChatFileAttachment]: ChatFileAttachment[Key] }

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key]
  return typeof field === 'string' && field !== '' ? field : undefined
}

/** Normalize the canonical durable file block plus older replay wrappers. */
function fileAttachmentFromBlock(block: unknown): ChatFileAttachment | undefined {
  if (block === null || typeof block !== 'object' || Array.isArray(block)) return undefined
  const value = block as Record<string, unknown>
  const sources: Record<string, unknown>[] = []
  const pending: Array<{ record: Record<string, unknown>; depth: number }> = [
    { record: value, depth: 0 },
  ]
  const seen = new Set<Record<string, unknown>>()
  while (pending.length > 0) {
    const next = pending.shift()
    if (next === undefined || seen.has(next.record)) continue
    seen.add(next.record)
    sources.push(next.record)
    if (next.depth >= 5) continue
    for (const key of ['attachment', 'file', 'metadata', 'ref', 'data']) {
      const nested = next.record[key]
      if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) {
        pending.push({ record: nested as Record<string, unknown>, depth: next.depth + 1 })
      }
    }
  }

  const hasFileIdentity = (record: Record<string, unknown>): boolean =>
    typeof record.attachmentId === 'string' &&
    record.attachmentId.length > 0 &&
    (typeof record.name === 'string' || typeof record.mediaType === 'string')
  if (value.type !== 'file' && !sources.some(hasFileIdentity)) return undefined

  const firstString = (key: string): string | undefined => {
    for (const source of sources) {
      const found = stringField(source, key)
      if (found !== undefined) return found
    }
    return undefined
  }
  const firstNumber = (key: string): number | undefined => {
    for (const source of sources) {
      const found = source[key]
      if (typeof found === 'number') return found
    }
    return undefined
  }
  const attachmentId = firstString('attachmentId')
  if (attachmentId === undefined) return undefined
  const attachment: MutableChatFileAttachment = {
    attachmentId,
    name: firstString('name') ?? 'uploaded-file',
    mediaType: firstString('mediaType') ?? 'application/octet-stream',
    bytes: firstNumber('bytes') ?? 0,
  }
  const parser = firstString('parser')
  const status = firstString('status')
  const textChars = firstNumber('textChars')
  const pageCount = firstNumber('pageCount')
  const sheetCount = firstNumber('sheetCount')
  const preview = firstString('preview')
  const content = firstString('content')
  const parseStatus = firstString('parseStatus')
  const parseProgress = firstNumber('parseProgress')
  const parseError = firstString('parseError')
  if (parser !== undefined) attachment.parser = parser
  if (status !== undefined) attachment.status = status
  if (textChars !== undefined) attachment.textChars = textChars
  if (pageCount !== undefined) attachment.pageCount = pageCount
  if (sheetCount !== undefined) attachment.sheetCount = sheetCount
  if (preview !== undefined) attachment.preview = preview
  if (content !== undefined) attachment.content = content
  if (parseStatus !== undefined) {
    attachment.parseStatus = parseStatus as Exclude<ChatFileAttachment['parseStatus'], undefined>
  }
  if (parseProgress !== undefined) attachment.parseProgress = parseProgress
  if (parseError !== undefined) attachment.parseError = parseError
  return attachment
}

function unescapeXml(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&')
}

function projectedComments(serialized: string): readonly ProjectedReviewComment[] {
  const comments: ProjectedReviewComment[] = []
  const filePattern = /<file path="([^"]*)">([\s\S]*?)<\/file>/g
  let fileMatch: RegExpExecArray | null
  while ((fileMatch = filePattern.exec(serialized)) !== null) {
    const path = unescapeXml(fileMatch[1] ?? '')
    const fileBody = fileMatch[2] ?? ''
    const commentPattern =
      /<comment kind="(context|del|add)" old_line="([^"]*)" new_line="([^"]*)">([\s\S]*?)<\/comment>/g
    let commentMatch: RegExpExecArray | null
    while ((commentMatch = commentPattern.exec(fileBody)) !== null) {
      const feedback = /<feedback>([\s\S]*?)<\/feedback>/.exec(commentMatch[4] ?? '')
      comments.push({
        path,
        kind: commentMatch[1] as ProjectedReviewComment['kind'],
        oldLine: commentMatch[2] ?? '',
        newLine: commentMatch[3] ?? '',
        body: unescapeXml(feedback?.[1] ?? ''),
      })
    }
  }
  return comments
}

/** Recognize only the leading envelope emitted by this plugin and retain any user text after it. */
export function projectReviewMessageText(text: string): ReviewMessageProjection | null {
  if (!text.startsWith(REVIEW_START)) return null
  const end = text.indexOf(REVIEW_END, REVIEW_START.length)
  if (end < 0) return null
  const serialized = text.slice(0, end + REVIEW_END.length)
  const comments = projectedComments(serialized)
  const commentCount = comments.length
  if (commentCount === 0) return null
  return {
    commentCount,
    comments,
    visibleText: text.slice(end + REVIEW_END.length).replace(/^\n{1,2}/, ''),
  }
}

function contentParts(content: readonly unknown[]): ContentParts {
  const texts: string[] = []
  const images: Array<{ attachment: ImageAttachment }> = []
  const files: ChatFileAttachment[] = []
  const rest: unknown[] = []
  for (const block of content) {
    const value = block as {
      readonly type?: unknown
      readonly text?: unknown
      readonly attachment?: unknown
    }
    if (value.type === 'text' && typeof value.text === 'string') texts.push(value.text)
    else if (value.type === 'image' && value.attachment !== undefined) {
      images.push({ attachment: value.attachment as ImageAttachment })
    } else {
      const file = fileAttachmentFromBlock(block)
      if (file === undefined) rest.push(block)
      else files.push(file)
    }
  }
  return { text: texts.join(''), images, files, rest }
}

function fileIconFor(file: ChatFileAttachment): ReactNode {
  const extension = file.name.split('.').pop()?.toLocaleLowerCase() ?? ''
  if (
    file.mediaType.includes('zip') ||
    file.mediaType.includes('compressed') ||
    ['zip', '7z', 'rar', 'tar', 'gz'].includes(extension)
  )
    return <IconArchiveOutline20 size={22} />
  if (
    file.mediaType.includes('json') ||
    file.mediaType.includes('javascript') ||
    ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go'].includes(extension)
  )
    return <IconCodeOutline16 size={22} />
  if (
    file.mediaType.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extension)
  )
    return <IconBrowseOutline16 size={22} />
  if (
    file.mediaType.includes('spreadsheet') ||
    file.mediaType.includes('excel') ||
    ['xls', 'xlsx', 'csv'].includes(extension)
  )
    return <IconDataOutline16 size={22} />
  if (
    file.mediaType.includes('presentation') ||
    ['ppt', 'pptx', 'key'].includes(extension)
  )
    return <IconFolderClose16 size={22} />
  return <IconDataOutline16 size={22} />
}

function FileCards({
  files,
  sessionId,
  openAttachment,
  openParsedAttachment,
  copyAttachment,
}: {
  readonly files: readonly ChatFileAttachment[]
  readonly sessionId?: string
  readonly openAttachment?: ((attachment: ChatFileAttachment) => void) | undefined
  readonly openParsedAttachment?: ((attachment: ChatFileAttachment) => void) | undefined
  readonly copyAttachment?: ((attachment: ChatFileAttachment) => void) | undefined
}) {
  if (files.length === 0) return null
  return (
    <div className={css.reviewMessageFileCards} role="list" aria-label="附件">
      {files.map((file) => (
        <div
          className={css.reviewMessageFileCard}
          role="listitem"
          key={file.attachmentId}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'copy'
            event.dataTransfer.setData(
              'application/x-zerowall-attachment',
              JSON.stringify({
                attachmentId: file.attachmentId,
                name: file.name,
                mediaType: file.mediaType,
                sessionId,
              }),
            )
            event.dataTransfer.setData('text/plain', file.name)
          }}
        >
          <button
            type="button"
            className={css.reviewMessageFileOpen}
            onClick={() => openAttachment?.(file)}
            disabled={openAttachment === undefined}
            title="预览附件"
          >
            <span className={css.reviewMessageFileIcon} aria-hidden>
              {fileIconFor(file)}
            </span>
            <span className={css.reviewMessageFileName}>{file.name}</span>
          </button>
          <button
            type="button"
            className={`${css.reviewMessageFileOpen} ${css.reviewMessageFileParsed}`}
            onClick={() => openParsedAttachment?.(file)}
            disabled={openParsedAttachment === undefined}
            title="查看解析结果"
            aria-label={`查看 ${file.name} 的解析结果`}
          >
            <span aria-hidden>↗</span>
          </button>
          <button
            type="button"
            className={css.reviewMessageFileCopy}
            onClick={() => copyAttachment?.(file)}
            disabled={copyAttachment === undefined}
            title="复制附件"
            aria-label={`复制附件 ${file.name}`}
          >
            <IconCopyOutline16 />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Match the host's compact reference treatment for ordinary user messages. */
function projectPlainReferences(text: string): ReactNode {
  const expression = /(^|\s)([/@][\w-]+)(?=\s|$)/g
  const parts: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = expression.exec(text)) !== null) {
    const tokenStart = match.index + (match[1]?.length ?? 0)
    const label = match[2] ?? ''
    if (tokenStart > cursor) {
      parts.push(<span key={cursor}>{text.slice(cursor, tokenStart)}</span>)
    }
    parts.push(
      <span
        key={tokenStart}
        className={css.reviewMessageReference}
        data-ref-chip={label.startsWith('@') ? 'subagent' : 'skill'}
      >
        {label}
      </span>,
    )
    cursor = tokenStart + label.length
  }
  if (parts.length === 0) return <span>{text}</span>
  if (cursor < text.length) parts.push(<span key={cursor}>{text.slice(cursor)}</span>)
  return parts
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function messageClock(time: number, t: UserMessageProps['t']): string {
  const value = new Date(time)
  const today = new Date()
  const clock = `${pad2(value.getHours())}:${pad2(value.getMinutes())}`
  if (
    value.getFullYear() === today.getFullYear() &&
    value.getMonth() === today.getMonth() &&
    value.getDate() === today.getDate()
  )
    return clock
  const params = { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() }
  const date =
    value.getFullYear() === today.getFullYear() ? t('clock.md', params) : t('clock.ymd', params)
  return `${date} ${clock}`
}

async function writeText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard === undefined) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={css.reviewMessageActionIcon}>
      <path d="m4.5 10 3.5 3.5 7.5-7.5" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={css.reviewMessageActionIcon}>
      <rect x="6.5" y="6.5" width="9" height="9" rx="1.5" />
      <path d="M13.5 6.5v-2a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2" />
    </svg>
  )
}


function ExtraBlock({ value, label }: { readonly value: unknown; readonly label: string }) {
  let serialized: string
  try {
    serialized = JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    serialized = String(value)
  }
  return (
    <details className={css.reviewMessageExtraBlock}>
      <summary>{label}</summary>
      <pre>{serialized}</pre>
    </details>
  )
}

function MessageActions({
  text,
  time,
  t,
}: {
  readonly text: string
  readonly time: number
  readonly t: UserMessageProps['t']
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  const copy = useCallback(() => {
    if (copied) return
    void writeText(text).then((success) => {
      if (!success) return
      setCopied(true)
      timer.current = window.setTimeout(() => {
        timer.current = null
        setCopied(false)
      }, 1000)
    })
  }, [copied, text])

  return (
    <div className={css.reviewMessageActions}>
      <span className={css.reviewMessageTime}>{messageClock(time, t)}</span>
      <button
        type="button"
        className={css.reviewMessageAction}
        title={copied ? t('copied') : t('copy')}
        aria-label={copied ? t('copied') : t('copy')}
        onClick={copy}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  )
}

/** Shadow the host user renderer while preserving its ordinary-message behavior. */
export function ReviewUserMessage({
  node,
  sessionId,
  cwd,
  renderMessageImages,
  openAttachment,
  openParsedAttachment,
  copyAttachment,
  t,
  reviewT,
}: UserMessageProps) {
  const { content, time } = node.data
  const { text, images, files, rest } = contentParts(content)
  const projection = projectReviewMessageText(text)
  const visibleText = projection?.visibleText ?? text
  const countLabel =
    projection === null
      ? null
      : projection.commentCount === 1
        ? reviewT('review.commentCountOne')
        : reviewT('review.commentCount', { count: String(projection.commentCount) })
  const copyText =
    projection === null
      ? text
      : [countLabel, visibleText].filter((value) => value !== null && value !== '').join('\n\n')
  const showBubble = visibleText !== '' || rest.length > 0

  return (
    <div className={css.reviewMessageRow} data-time-hover-root="">
      <div className={css.reviewMessageStack}>
        {renderMessageImages({ images, align: 'end' })}
        <FileCards
          files={files}
          sessionId={sessionId}
          openAttachment={openAttachment}
          openParsedAttachment={openParsedAttachment}
          copyAttachment={copyAttachment}
        />
        {countLabel !== null && projection !== null && (
          <ReviewCommentPill
            comments={projection.comments.map((comment, index) => ({
              ...comment,
              key: index,
            }))}
            projectRoot={cwd}
            t={reviewT}
            placement="below-right"
            variant="message"
          />
        )}
        {showBubble && (
          <div className={css.reviewMessageBubble}>
            {projectPlainReferences(visibleText)}
            {rest.map((block, index) => (
              <ExtraBlock key={index} label={t('message.extraBlock')} value={block} />
            ))}
          </div>
        )}
      </div>
      <MessageActions text={copyText} time={time} t={t} />
    </div>
  )
}
