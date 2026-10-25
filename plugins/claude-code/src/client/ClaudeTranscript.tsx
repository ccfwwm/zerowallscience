import { useEffect, useState } from 'react'
import { MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ClaudeTranscript as Transcript } from '../shared/types.js'
import { CLAUDE_MARKDOWN_SCOPE, ensureClaudeMarkdownTheme } from './upstream/markdown-theme.js'

interface TranscriptMarker { turn: number; step: number }
declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap { 'zerowall-claude-transcript': TranscriptMarker }
}

/** Same sidecar-backed node pattern as pinned dsh-claude conversation-sidecar. */
export const claudeTranscriptDefinition: ConversationNodeDefinition<TranscriptMarker & { seq: number }> = {
  kind: 'zerowall-claude-transcript', target: 'chat',
  match(event) {
    return event.type === 'zerowall-claude/turn' ? { id: `${event.data.turn}:${event.data.step}`, role: 'start' } : null
  },
  start(_context, match) {
    if (match.event.type !== 'zerowall-claude/turn') throw new Error('Claude transcript requires its turn marker.')
    return { ...match.event.data, seq: match.event.seq }
  },
  buildViewNode(context) {
    if (!context.state) return null
    return { key: context.key, kind: 'zerowall-claude-transcript', id: context.id, target: 'chat',
      anchorSeq: context.state.seq, location: context.start?.location ?? { kind: 'unresolved' }, visibility: 'visible',
      data: { turn: context.state.turn, step: context.state.step } }
  },
}

const labels: MarkdownLabels = {
  code: { copyLabel: '复制', copiedLabel: '已复制', toolbarLabels: { codeLabel: '代码', wrapLabel: '自动换行', unwrapLabel: '取消换行' } },
  footnotes: '注释',
}
export interface ClaudeTranscriptInjected { readTranscript(turn: number, step: number): Promise<Transcript | null> }
type Props = PropsRuntime<'conversation.chat.node', 'zerowall-claude-transcript'> & InjectFace<ClaudeTranscriptInjected>

export function ClaudeTranscriptNode({ node, readTranscript }: Props) {
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async () => {
      try {
        const next = await readTranscript(node.data.turn, node.data.step)
        if (!active) return
        setTranscript(next)
        if (next === null || next.running) timer = setTimeout(() => { void refresh() }, 120)
      } catch { if (active) timer = setTimeout(() => { void refresh() }, 1000) }
    }
    void refresh()
    return () => { active = false; if (timer) clearTimeout(timer) }
  }, [node.data.turn, node.data.step, readTranscript])
  if (!transcript || transcript.renderer !== 'plugin') return null
  ensureClaudeMarkdownTheme()
  return <section aria-label="Claude Code 过程" className={CLAUDE_MARKDOWN_SCOPE}>
    {transcript.activity.filter(block => !block.answer).map(block => block.kind === 'text'
      ? <MarkdownText key={block.index} text={block.text} streaming={!block.ended} labels={labels} />
      : <details key={block.index} open={!block.ended || undefined} style={{ margin: '8px 0', borderLeft: '2px solid var(--dsw-alias-border-l2)', paddingLeft: 12 }}>
        <summary>{block.kind === 'reasoning' ? '思考' : block.name ?? '工具'}{block.kind === 'tool-call' ? block.result === undefined ? ' · 执行中' : block.failed ? ' · 失败' : ' · 完成' : ''}</summary>
        {block.kind === 'reasoning' ? <MarkdownText text={block.text} streaming={!block.ended} labels={labels} />
          : <><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{block.text}</pre>{block.result !== undefined && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{block.result}</pre>}</>}
      </details>)}
    {transcript.running && transcript.activity.length === 0 && <p role="status">Claude Code 正在启动…</p>}
  </section>
}
