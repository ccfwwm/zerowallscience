/** Convert both official content-list formats without discarding original artifacts. */
type Row = Record<string, any>
function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(text).join(' ')
  if (value && typeof value === 'object') return text((value as Row).content ?? (value as Row).item_content)
  return ''
}
export function normalizeContent(value: unknown): Row[] {
  if (!Array.isArray(value)) throw new Error('MinerU content list must be an array')
  const pages = value.some(Array.isArray)
  return value.flatMap((page, index) => (pages ? page : [page]).map((row: Row) => {
    if (!row || typeof row !== 'object') throw new Error('Invalid MinerU content block')
    const content = row.content ?? {}
    const result: Row = { ...row, page_idx: row.page_idx ?? (pages ? index : -1), bbox: row.bbox ?? null, bbox_format: 'normalized-1000' }
    if (pages) {
      result.text = text(content[`${row.type}_content`] ?? content.text ?? content.content ?? (typeof content === 'string' ? content : undefined))
      if (row.type === 'list') result.text = text(content.list_items ?? content.list_content ?? content)
      result.img_path = content.image_source?.path ?? content.img_path ?? content.image_path ?? row.img_path
      result.table_body = content.html ?? row.table_body
      result.image_caption = text(content.image_caption ?? content.chart_caption)
      result.table_caption = text(content.table_caption)
    }
    return result
  }))
}
