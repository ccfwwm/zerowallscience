/** Shared rich text for GenUI labels and content. Data values stay unchanged. */
import { createElement, useLayoutEffect, useRef, type ReactNode } from 'react'
import katex from 'katex'
import css from './GenuiBlock.module.css'
import { safeHref } from './genui-runtime/value-utils.ts'

/** KaTeX owns this span's children; React owns the span and its lifecycle.
 * The host's ui-primitives already supplies KaTeX CSS/fonts, including embeds. */
function InlineMath({ source, display }: { source: string; display: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (ref.current === null) return
    katex.render(source, ref.current, {
      displayMode: display, throwOnError: false, trust: false,
      maxExpand: 1000, maxSize: 20, output: 'htmlAndMathml',
    })
  }, [source, display])
  return createElement('span', { ref, className: css.inlineMath })
}

// Code is literal. TeX tokens are opaque to emphasis/link parsing; the other
// rich-text tokens recurse so **$x$** and ==\\(x\\)== work without nested DOM roots.
// A real newline in the string is its own token rendered as <br>, so text
// fields express a line break via JSON "\n" — no HTML parsing, and the
// single-line (nowrap) chrome classes never contain one.
const INLINE = /(?<!`)`[^`\n]+`(?!`)|\\\\|\\\$|(?<![\\$])\$\$(?:\\.|[^\\])*?\$\$|\\\[(?:\\(?!\])[^]|[^\\])*?\\\]|\\\((?:\\(?!\))[^]|[^\\])*?\\\)|(?<![\\$])\$(?!\s|\$)(?:\\.|[^$\\\n])+(?<!\s)\$(?!\d|\$)|\*\*[\s\S]+?\*\*|==[\s\S]+?==|\[[^\]\n]+\]\([^)\s]+\)|\r?\n/g
const FENCE_MARKER = /`{3,}|~{3,}/g

export function hasInlineMarkup(text: string): boolean {
  return typeof text === 'string' && /[`*=$\\\n\r]|\[/.test(text)
}

/** Render safe phrasing content, usable in headings, buttons and labels too. */
export function renderInline(text: string, allowLinks = true, depth = 0): ReactNode {
  if (typeof text !== 'string' || text === '' || !hasInlineMarkup(text) || depth >= 8) return text
  const segments: ReactNode[] = []
  let fenceEnd = 0
  for (const opening of text.matchAll(FENCE_MARKER)) {
    const openingStart = opening.index ?? 0
    if (openingStart < fenceEnd) continue
    const marker = opening[0]
    const contentStart = openingStart + marker.length
    let closingEnd: number | undefined
    for (const candidate of text.slice(contentStart).matchAll(FENCE_MARKER)) {
      if (candidate[0][0] === marker[0] && candidate[0].length >= marker.length) {
        closingEnd = contentStart + (candidate.index ?? 0) + candidate[0].length
        break
      }
    }
    if (openingStart > fenceEnd) segments.push(renderInline(text.slice(fenceEnd, openingStart), allowLinks, depth))
    // 围栏及其中的代码、换行和行内标记都保持原文。
    fenceEnd = closingEnd ?? text.length
    segments.push(text.slice(openingStart, fenceEnd))
    if (closingEnd === undefined) break
  }
  if (segments.length > 0) {
    if (fenceEnd < text.length) segments.push(renderInline(text.slice(fenceEnd), allowLinks, depth))
    return segments
  }
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0
    const token = match[0]
    if (index > last) out.push(text.slice(last, index))
    if (token === '\n' || token === '\r\n') {
      out.push(createElement('br', { key: key++ }))
    } else if (token.startsWith('`')) {
      out.push(createElement('code', { key: key++, className: css.inlineCode }, token.slice(1, -1)))
    } else if (token === '\\$' || token === '\\\\') {
      // Escaped markers: the regex consumed the backslash to keep the literal
      // character from opening math/emphasis, so render it without the escape.
      out.push(token.slice(1))
    } else if (token.startsWith('$') || token.startsWith('\\(') || token.startsWith('\\[')) {
      const display = token.startsWith('$$') || token.startsWith('\\[')
      const width = token.startsWith('$') && !display ? 1 : 2
      out.push(createElement(InlineMath, { key: key++, source: token.slice(width, -width), display }))
    } else if (token.startsWith('**') || token.startsWith('==')) {
      const bold = token.startsWith('**')
      out.push(createElement(bold ? 'strong' : 'mark', {
        key: key++, className: bold ? css.inlineStrong : css.inlineMark,
      }, renderInline(token.slice(2, -2), allowLinks, depth + 1)))
    } else {
      const parts = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/.exec(token)
      if (parts === null) {
        out.push(token)
      } else {
        const href = safeHref(parts[2])
        out.push(href === undefined || !allowLinks ? renderInline(parts[1]!, false, depth + 1) : createElement('a', {
          key: key++, className: css.inlineLink, href, target: '_blank', rel: 'noreferrer noopener',
        }, renderInline(parts[1]!, false, depth + 1)))
      }
    }
    last = index + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out.length === 0 ? text : out
}
