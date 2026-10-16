import { describe, expect, it } from 'vitest'
import { completeFenceJson, repairFenceJson } from '../src/shared/fence-repair.ts'
import { resolveFence } from '../src/shared/fence-resolve.ts'
import { createValidateDshUiTool } from '../src/plugin/tool.ts'

describe('valueless object keys (issues #290 and #291)', () => {
  it.each([
    ['root', '{"title","content":"hello"}', { content: 'hello' }],
    ['nested', '{"items":[{"type":"text","title","content":"hello"}]}', { items: [{ type: 'text', content: 'hello' }] }],
    ['consecutive', '{"unused","title","content":"hello"}', { content: 'hello' }],
    ['escaped key', String.raw`{"unused\"key", "content":"hello"}`, { content: 'hello' }],
    ['punctuation inside a key', '{"unused,}:key","content":"hello"}', { content: 'hello' }],
    ['mixed repairs', '{"title","content":"say "hello"",}', { content: 'say "hello"' }],
    ['quoted value before a bare key', '{"content":"say "hello"","title","value":1}', { content: 'say "hello"', value: 1 }],
  ] as const)('preserves the following field in both tiers: %s', (_name, raw, expected) => {
    for (const repair of [repairFenceJson, completeFenceJson]) {
      const result = repair(raw)
      expect(result).not.toBeNull()
      expect(JSON.parse(result!.text)).toEqual(expected)
    }
  })

  it('leaves valid keys, array strings and quoted examples untouched', () => {
    const raw = JSON.stringify({ title: null, items: ['title', 'content'], content: '{"title","content":"hello"}' })
    expect(repairFenceJson(raw)).toBeNull()
    expect(completeFenceJson(raw)).toBeNull()
  })

  it('does not consume a partial streaming field; only settled completion fills missing closers', () => {
    expect(repairFenceJson('{"title","content":"hel')).toBeNull()
    expect(repairFenceJson('{"title","con')).toBeNull()
    const result = completeFenceJson('{"title","content":"hello"')
    expect(result).not.toBeNull()
    expect(JSON.parse(result!.text)).toEqual({ content: 'hello' })
  })

  it('retains text through the shared renderer and pre-emission validator', async () => {
    const raw = '{"items":[{"type":"text","title","content":"hello"}]}'
    for (const settled of [false, true]) {
      expect(resolveFence(raw, { settled }).spec?.items).toEqual([{ type: 'text', content: 'hello' }])
    }
    const validation = await createValidateDshUiTool().execute({ spec: raw })
    expect(validation).toContain('repair=applied')
    expect(validation).toContain('"content":"hello"')
  })
})
