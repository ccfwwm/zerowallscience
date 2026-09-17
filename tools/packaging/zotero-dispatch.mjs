// Shared by the packaged client and replay tests. Old dispatcher logs retained
// only rendered tool text; recover only the search rows its documented format
// identifies, never bibliography prose from an assistant message.
export function zoteroDispatch(block) {
  const settled = 'kind' in block
  const name = settled ? block.call?.name : block.name
  let args
  try { args = JSON.parse((settled ? block.call?.argsRaw : block.argsRaw) ?? '{}') } catch { return null }
  const harvestName = name === 'tool_dispatch' ? (block.meta?.tool ?? args.name) : name
  if (settled && !block.isError && ['lit_save', 'lit_review_run'].includes(harvestName)) {
    for (const part of block.content ?? []) {
      if (part.type !== 'text') continue
      try {
        const result = JSON.parse(part.text)
        const saved = harvestName === 'lit_review_run' ? result.save : result
        const items = saved?.resolvedMode === 'zotero-api' ? saved.zoteroItems?.filter(row => typeof row.ref === 'string' && typeof row.title === 'string') : []
        if (items?.length) return { name: 'zotero_search', args: {}, meta: { items: items.map(row => ({ ...row, creatorSummary: row.creatorSummary ?? '' })) } }
      } catch {}
    }
    return null
  }
  if (name !== 'tool_dispatch' && block.meta?.protocol !== 'dsh-progressive-tools/dispatch-v1') return null
  const tool = block.meta?.tool ?? args.name
  if (typeof tool !== 'string' || !tool.startsWith('zotero_')) return null
  let targetArgs = args.arguments
  if (typeof targetArgs === 'string') {
    try { targetArgs = JSON.parse(targetArgs) } catch { targetArgs = {} }
  }
  let meta = block.meta?.targetMeta
  if (meta === undefined && settled && !block.isError && tool === 'zotero_search') {
    const items = []
    for (const part of block.content ?? []) {
      if (part.type !== 'text') continue
      for (const line of part.text.split(/\r?\n/u)) {
        const match = /^\d+\. (zotero:\/\/(?:user|group)\/\d+\/item\/[A-Z0-9]+(?:\?[^\s]+)?) — (.+) \[([^\]]+)\] — (.+)$/u.exec(line)
        if (match === null) continue
        let title = match[2]
        const yearMatch = / \((\d{4})\)$/u.exec(title)
        if (yearMatch) title = title.slice(0, yearMatch.index)
        items.push({ ref: match[1], title, creatorSummary: match[4].replace(/ — PDF$/u, ''), ...(yearMatch ? { year: Number(yearMatch[1]) } : {}) })
      }
    }
    if (items.length > 0) meta = { items }
  }
  return { name: tool, args: targetArgs && typeof targetArgs === 'object' ? targetArgs : {}, meta: meta ?? null }
}
