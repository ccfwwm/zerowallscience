// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { renderGenuiFence } from '../src/client/fence-render.tsx'

/**
 * Test-double markdown renderer for the dsh-ui fence suites.
 *
 * These suites were originally gated behind `skipIf(!hasFenceRegistry)` on a
 * host extension point (`registerFenceRenderer`) that has never shipped in
 * any published `@deepseek-ai/dsh-client-ui-primitives` — see CHANGELOG — so
 * they never executed. The double renders prose plainly and delegates each
 * ```dsh-ui fence body to {@link renderGenuiFence}: the plugin's real fence
 * entry that both shipped channels (DOM observer and any future registry)
 * feed into. It does NOT cover host markdown integration; that stays with
 * `markdown-labels.tsx` (the real host primitive) and the DOM-channel suites.
 *
 * `streaming` wraps the output in `[data-streaming]`, the marker the fence
 * pipeline (and the host) uses to distinguish a still-growing reply from a
 * settled defect. Settled renders pass a stable synthetic source so tier-2
 * repair and the export affordance follow the same rules as production.
 */
const FENCE_OPEN = '```dsh-ui\n'

export function MarkdownText(props: { text: string; streaming?: boolean }): ReactNode {
  const parts: ReactNode[] = []
  let rest = props.text
  let fenceIndex = 0
  let key = 0
  while (rest.length > 0) {
    const open = rest.indexOf(FENCE_OPEN)
    if (open === -1) {
      parts.push(rest)
      break
    }
    if (open > 0) parts.push(rest.slice(0, open))
    const bodyStart = open + FENCE_OPEN.length
    const close = rest.indexOf('\n```', bodyStart)
    const body = close === -1 ? rest.slice(bodyStart) : rest.slice(bodyStart, close)
    parts.push(renderGenuiFence(body, `fence-${key++}`, props.streaming
      ? undefined
      : { source: { id: `genui-markdown:${fenceIndex}`, order: [0, fenceIndex, 0] } }))
    fenceIndex += 1
    rest = close === -1 ? '' : rest.slice(close + '\n```'.length)
  }
  const tree = <>{parts}</>
  return props.streaming === true ? <div data-streaming="">{tree}</div> : tree
}
