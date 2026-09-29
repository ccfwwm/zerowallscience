// Keep the resident editor/draft mounted, but make it inert outside Chat.
// Follow the direct shell/header/body hierarchy, excluding nested conversations.
export function adaptConversationClient(source) {
  if (source.includes('data-zerowall-conversation')) return source
  const replacements = [
    {
      before: ['ref: rootResizeRef,', '"data-phase": phase,'],
      after: before => before === 'ref: rootResizeRef,'
        ? `${before}\n"data-zerowall-conversation": "",`
        : `${before}\n"data-zerowall-conversation": "",`,
    },
    {
      before: ['role: "tablist",'],
      after: before => `${before}\n"data-conversation-view": active?.id ?? "chat",`,
    },
    {
      before: ['"aria-selected": viewTab.id === active?.id,'],
      after: before => `${before}\n"data-conversation-tab": viewTab.id,`,
    },
    {
      before: [
        'if (session.blank && conversationPhase(session, conversation) === "blank") return null;',
        'if (session.blank && conversationPhase(session, conversation) === \'blank\') return null;',
      ],
      after: before => before.replace(
        ') return null;',
        ' && (active === undefined || active.id === "chat")) return null;',
      ),
    },
  ]
  for (const { before, after } of replacements) {
    const match = before.find(candidate => source.includes(candidate))
    if (match === undefined) throw new Error(`Unrecognized Conversation client: ${before.join(' OR ')}`)
    source = source.replace(match, after(match))
  }
  const scope = '[data-zerowall-conversation]:has(>[data-slot="conversation.session.header"] [data-conversation-view]:not([data-conversation-view="chat"]))'
  const body = `${scope}>div:not([data-slot])`
  const scroll = `${body}>[data-conversation-scroll]`
  const css = `${scroll}>[data-composer-seat],${body}>[data-width-handle]{display:none!important}\n${scroll}{overflow:hidden!important;justify-content:flex-start!important}\n${scroll}>[data-slot="conversation.session"]{display:flex;flex:1;min-height:0}\n${scroll}>[data-slot="conversation.session"]>div{flex:1 1 0!important;min-height:0!important;overflow:hidden}`
  return source + `\n{const style=document.createElement('style');style.dataset.zerowallConversationViews='';style.textContent=${JSON.stringify(css)};document.head.appendChild(style);}\n`
}
