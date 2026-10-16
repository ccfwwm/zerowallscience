import { describe, expect, it } from 'vitest'
import { analyzeGenuiPortability } from '../src/client/artifact/portability.ts'
import type { GenuiSpec } from '../src/client/spec.ts'

const report = (items: unknown[]) => analyzeGenuiPortability({ items } as GenuiSpec)

describe('GenUI standalone asset selection', () => {
  it('chooses engines only for nodes that require them', () => {
    expect(report([{ type: 'text', content: 'hello' }, { type: 'chart', data: [] }]).requiredAssets).toEqual([])
    expect(report([{ type: 'mermaid', code: 'graph TD; A-->B' }]).requiredAssets).toEqual(['mermaid'])
    expect(report([{ type: 'scene3d', meshes: [] }]).requiredAssets).toEqual(['three'])
    expect(report([{ type: 'echart', preset: 'bar' }]).requiredAssets).toEqual(['echarts-core'])
    expect(report([{ type: 'echart', preset: 'radar' }]).requiredAssets).toEqual(['echarts-full'])
    expect(report([{ type: 'mermaid', code: 'x' }, { type: 'echart', option: {} }]).requiredAssets).toEqual(['mermaid', 'echarts-full'])
  })

  it('finds nested engines and lists custom nodes, actions, and network media', () => {
    const nestedTable = { type: 'table', columns: [], rows: [], details: [[{ type: 'echart', option: {} }]] }
    const nested = { type: 'row', items: [{ type: 'card', items: [
      { type: 'tabs', tabs: [{ label: 'Graph', items: [{ type: 'accordion', items: [{ title: 'More', items: [nestedTable] }] }] }] },
      { type: 'list', items: [{ type: 'echart', preset: 'bar' }] },
      { type: 'weather', temp: 20 }, { type: 'button', label: 'Run', action: 'run' }, { type: 'image', src: 'https://example.com/image.png' },
    ] }] }
    const result = report([nested])
    expect(result.requiredAssets).toEqual(['echarts-core', 'echarts-full'])
    expect(result.customTypes).toEqual(['weather'])
    expect(result.externalMedia).toEqual(['https://example.com/image.png'])
    expect(result.hasModelActions).toBe(true)
  })

  it('lists relative media as external dependencies', () => {
    expect(report([{ type: 'image', src: '/attachments/foo.png' }, { type: 'video', src: 'media/demo.mp4', poster: 'media/poster.png' }]).externalMedia)
      .toEqual(['/attachments/foo.png', 'media/demo.mp4', 'media/poster.png'])
  })
})
