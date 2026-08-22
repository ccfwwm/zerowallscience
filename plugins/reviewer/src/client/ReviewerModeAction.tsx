import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './ReviewerModeAction.module.css'
import type { ReviewerMode, ReviewerModeData } from './definition.js'

type ReviewerModeActionProps = PropsRuntime<'conversation.session.header.actions'>

function latestMode(nodes: readonly { kind: string; anchorSeq?: number; data: unknown }[]): ReviewerMode {
  let mode: ReviewerMode = 'inherit'
  let seq = -1
  for (const node of nodes) {
    if (node.kind !== 'zerowall-reviewer-mode' || typeof node.anchorSeq !== 'number' || node.anchorSeq < seq) continue
    const data = node.data as Partial<ReviewerModeData>
    if (data.mode === 'inherit' || data.mode === 'on' || data.mode === 'off') {
      mode = data.mode
      seq = node.anchorSeq
    }
  }
  return mode
}

export function ReviewerModeAction({ useSession, inputActions }: ReviewerModeActionProps) {
  const mode = useSession(snapshot => latestMode(snapshot.chat.nodes as unknown as readonly { kind: string; anchorSeq?: number; data: unknown }[]))
  const choose = (next: ReviewerMode): void => {
    inputActions.setDraft(`/review ${next}`)
    inputActions.submit()
  }
  return (
    <div className={css.group} role="group" aria-label="Reviewer mode">
      {(['inherit', 'on', 'off'] as const).map(item => (
        <button key={item} type="button" className={css.button} data-active={mode === item ? 'true' : undefined} aria-pressed={mode === item} onClick={() => { choose(item) }}>
          {item}
        </button>
      ))}
    </div>
  )
}
