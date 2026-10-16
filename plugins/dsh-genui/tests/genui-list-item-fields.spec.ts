import { describe, expect, it } from 'vitest'
import { processGenuiSpec, validateGenuiSpec } from '../src/client/guard.ts'

describe('list item fields', () => {
  it('keeps list bodies written with common field names', () => {
    const value = { items: [{ type: 'list', items: [
      { title: '一', content: '正文一' },
      { title: '二', text: '正文二' },
      { title: '三', body: '正文三' },
      { title: '四', detail: '正文四' },
      { title: '五', description: '正文五' },
    ] }] }
    const processed = processGenuiSpec(value)

    expect(validateGenuiSpec(value).ok).toBe(true)
    expect(processed.errors).toEqual([])
    expect(processed.repaired?.items[0]).toEqual({ type: 'list', items: [
      { title: '一', desc: '正文一' },
      { title: '二', desc: '正文二' },
      { title: '三', desc: '正文三' },
      { title: '四', desc: '正文四' },
      { title: '五', desc: '正文五' },
    ] })
  })

  it('keeps record titles and promotes body-only records', () => {
    const processed = processGenuiSpec({ items: [{ type: 'list', items: [
      { label: '标签', description: '正文' },
      { name: '名称', detail: '说明' },
      { content: '只有正文' },
      { title: '正式标题', label: '备用标题', desc: '正式正文', body: '备用正文' },
    ] }] })

    expect(processed.errors).toEqual([])
    expect(processed.repaired?.items[0]).toEqual({ type: 'list', items: [
      { title: '标签', desc: '正文' },
      { title: '名称', desc: '说明' },
      { title: '只有正文' },
      { title: '正式标题', desc: '正式正文' },
    ] })
  })

  it('reports fields a list record cannot render and preserves typed children', () => {
    const processed = processGenuiSpec({ items: [{ type: 'list', items: [
      { title: '标题', desc: '正文', note: '额外说明' },
      { type: 'badge', title: '节点字段', label: '徽章' },
    ] }] })

    expect(processed.repaired?.items[0]).toEqual({ type: 'list', items: [
      { title: '标题', desc: '正文' },
      { type: 'badge', label: '徽章' },
    ] })
    expect(processed.warnings).toContainEqual(expect.objectContaining({
      kind: 'unknown-field', path: 'items[0].items[0].note', type: 'list', field: 'note',
    }))
    expect(processed.warnings).toContainEqual(expect.objectContaining({
      kind: 'unknown-field', path: 'items[0].items[1].title', type: 'badge', field: 'title',
    }))
  })
})
