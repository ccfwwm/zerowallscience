// Regression for the "Tetris table" fence body (issue #192).
//
// Real session sample (insight 主题调研选型, 2026-09-16): the model closed the
// `columns` array after the header cells and then wrote the row matrix as a
// SIBLING array element that still carried the `"rows":` key —
//
//   "columns":["链路","用哪枚凭证","依据"],["rows":[[...],[...]]]
//
// Both sides of the body are bracket-BALANCED, so neither the closer-appending
// scan nor the client's partial parse can recover it: the whole fence stayed a
// raw code block. This test pins the shape rewrite that recovers it.
import { describe, expect, it } from 'vitest'
import { completeFenceJson, repairFenceJson } from '../src/shared/fence-repair.ts'
import { processGenuiSpec, isRenderableProcess, partialRepairGenuiSpec } from '../src/client/guard.ts'
import { parsePartialGenuiSpec } from '../src/client/parse-partial.ts'

/** The exact body captured from the session log. */
const TETRIS_TABLE = "{\"gap\":12,\"items\":[{\"type\":\"table\",\"columns\":[\"链路\",\"用哪枚凭证\",\"依据\"],[\"rows\":[[\"话题搜索 search/statuses\",\"既有 1083114296\",\"只有它能调（你确认）\"],[\"show_batch（正文 + 媒体）\",\"2807558683\",\"正文逐字相同 + url_objects，严格超集 → 一次拿全，不必两次请求\"],[\"queryid / count_sp / 话题对象\",\"保持既有\",\"两枚都通，缩小变更面\"],[\"图片 CDN / 视频 CDN\",\"不需要凭证，但需非空 Referer\",\"实测：我们域名作 Referer → 图片 200、视频 206\"]]]}]}"

describe('Tetris-shaped table columns (issue #192)', () => {
  it('is bracket-balanced yet does not parse — the reason the scan alone fails', () => {
    const count = (ch: string): number => TETRIS_TABLE.split(ch).length - 1
    expect(count('{')).toBe(count('}'))
    expect(count('[')).toBe(count(']'))
    expect(() => JSON.parse(TETRIS_TABLE)).toThrow()
  })

  it('is not healed by the quote/trailing-comma tier', () => {
    expect(repairFenceJson(TETRIS_TABLE)).toBeNull()
  })

  it('rewrites the sibling row matrix into a `rows` field', () => {
    const completed = completeFenceJson(TETRIS_TABLE)
    expect(completed).not.toBeNull()
    const value = JSON.parse(completed!.text) as { items: Array<Record<string, unknown>> }
    const table = value.items[0]!
    expect(table.type).toBe('table')
    expect(table.columns).toEqual(['链路', '用哪枚凭证', '依据'])
    expect(table.rows).toHaveLength(4)
    expect(table.rows?.[0]).toEqual(['话题搜索 search/statuses', '既有 1083114296', '只有它能调（你确认）'])
    // The rewrite must leave legal JSON for the whole body, so the shared
    // pipeline can render it instead of degrading to a code block.
    expect(partialRepairGenuiSpec(processGenuiSpec(parsePartialGenuiSpec(completed!.text)!))).not.toBeNull()
  })

  it('handles the bare-matrix spelling (no `rows` key inside the array)', () => {
    const bare = '{"items":[{"type":"table","columns":["a","b"],[["1","2"],["3","4"]]}]}'
    const completed = completeFenceJson(bare)
    expect(completed).not.toBeNull()
    expect(JSON.parse(completed!.text)).toEqual({
      items: [{ type: 'table', columns: ['a', 'b'], rows: [['1', '2'], ['3', '4']] }],
    })
  })

  it('preserves siblings after a keyed Tetris table', () => {
    const raw =
      '{"items":[' +
        '{"type":"table","columns":["a"],["rows":[["x"]]]},' +
        '{"type":"text","content":"tail"}' +
      ']}'

    const completed = completeFenceJson(raw)

    expect(completed).not.toBeNull()
    expect(JSON.parse(completed!.text)).toEqual({
      items: [
        {
          type: 'table',
          columns: ['a'],
          rows: [['x']],
        },
        {
          type: 'text',
          content: 'tail',
        },
      ],
    })
  })

  it('preserves siblings after a bare-matrix Tetris table', () => {
    const raw =
      '{"items":[' +
        '{"type":"table","columns":["a"],[["x"]]},' +
        '{"type":"text","content":"tail"}' +
      ']}'

    const completed = completeFenceJson(raw)

    expect(completed).not.toBeNull()
    expect(JSON.parse(completed!.text)).toEqual({
      items: [
        {
          type: 'table',
          columns: ['a'],
          rows: [['x']],
        },
        {
          type: 'text',
          content: 'tail',
        },
      ],
    })
  })

  it('returns null when a Tetris rewrite leaves an unrecoverable defect', () => {
    const raw = '{"items":[{"type":"table","columns":["a"],[["x"]],"broken":}]}'
    const completed = completeFenceJson(raw)

    expect(completed).toBeNull()
  })

  it('leaves a legal columns+rows body untouched', () => {
    const legal = '{"items":[{"type":"table","columns":["a"],"rows":[["1"]]}]}'
    expect(completeFenceJson(legal)).toBeNull()
  })
})
