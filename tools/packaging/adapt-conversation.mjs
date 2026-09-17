// Keep the resident editor/draft mounted, but make it inert outside Chat.
// Follow the direct shell/header/body hierarchy, excluding nested conversations.
export function adaptConversationClient(source) {
  if (source.includes('data-zerowall-conversation')) return source
  const replacements = [
    ['ref: rootResizeRef,', 'ref: rootResizeRef,\n"data-zerowall-conversation": "",'],
    ['role: "tablist",', 'role: "tablist",\n"data-conversation-view": active?.id ?? "chat",'],
    ['"aria-selected": viewTab.id === active?.id,', '"aria-selected": viewTab.id === active?.id,\n"data-conversation-tab": viewTab.id,'],
    ['if (session.blank && conversationPhase(session, conversation) === "blank") return null;', 'if (session.blank && conversationPhase(session, conversation) === "blank" && (active === undefined || active.id === "chat")) return null;'],
  ]
  for (const [before, after] of replacements) {
    if (!source.includes(before)) throw new Error(`Unrecognized Conversation client: ${before}`)
    source = source.replace(before, after)
  }
  const scope = '[data-zerowall-conversation]:has(>[data-slot="conversation.session.header"] [data-conversation-view]:not([data-conversation-view="chat"]))'
  const body = `${scope}>div:not([data-slot])`
  const scroll = `${body}>[data-conversation-scroll]`
  const css = `${scroll}>[data-composer-seat],${body}>[data-width-handle]{display:none!important}\n${scroll}{overflow:hidden!important;justify-content:flex-start!important}\n${scroll}>[data-slot="conversation.session"]{display:flex;flex:1;min-height:0}\n${scroll}>[data-slot="conversation.session"]>div{flex:1 1 0!important;min-height:0!important;overflow:hidden}`
  return source + `\n{const style=document.createElement('style');style.dataset.zerowallConversationViews='';style.textContent=${JSON.stringify(css)};document.head.appendChild(style);}\n`
}
