/** Convert both official content-list formats without discarding original artifacts. */
export type ContentRow = Record<string, unknown>
type Row = ContentRow
function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(text).join(' ')
  if (value && typeof value === 'object') return text((value as Row).content ?? (value as Row).item_content)
  return ''
}
/** Normalize external flat or page-grouped content. @param value - MinerU JSON. @returns Preserved blocks with common text, image and page fields. */
export function normalizeContent(value: unknown): Row[] {
  if (!Array.isArray(value)) throw new Error('MinerU content list must be an array')
  const pages = value.some(Array.isArray)
  if (pages && value.some(page => !Array.isArray(page))) throw new Error('Mixed MinerU content list formats')
  return value.flatMap((page: unknown, index) => (pages && Array.isArray(page) ? page : [page]).map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid MinerU content block')
    const row = item as Row
    const content = row.content && typeof row.content === 'object' ? row.content as Row : {}
    const result: Row = { ...row, page_idx: row.page_idx ?? (pages ? index : -1), bbox: row.bbox ?? null, bbox_format: 'normalized-1000' }
    if (pages) {
      result.text = text(content[`${row.type}_content`] ?? content.text ?? content.content ?? (typeof content === 'string' ? content : undefined))
      if (row.type === 'list') result.text = text(content.list_items ?? content.list_content ?? content)
      const image = content.image_source && typeof content.image_source === 'object' ? content.image_source as Row : {}
      result.img_path = image.path ?? content.img_path ?? content.image_path ?? row.img_path
      result.table_body = content.html ?? row.table_body
      result.image_caption = text(content.image_caption ?? content.chart_caption)
      result.table_caption = text(content.table_caption)
    }
    return result
  }))
}
