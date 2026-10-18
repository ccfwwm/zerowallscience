import { describe, expect, it } from 'vitest'
import type { PresentationData } from '@office-kit/pptx'
import { createOfficeKitEngine } from '../src/core/engine/officekit.js'
import { reviewDeck } from '../src/core/review/index.js'
import type { ElementBase } from '../src/core/pptd/schema.js'

const shape = (id: string, bounds: [number, number, number, number]): ElementBase => ({ elementId: id, elementType: 'shape', shapeName: 'rect', bounds, fill: { type: 'solid', color: '#eeeeee' } })
const text = (id: string, bounds: [number, number, number, number]): ElementBase => ({ elementId: id, elementType: 'text', bounds, content: { text: 'Readable content', fontSize: 14 } })
async function overlaps(elements: ElementBase[]) {
  const built = await createOfficeKitEngine().buildDeck({ deck: { profile: 'generate', size: [960, 540], pages: ['pages/01.page'] }, pages: [{ elements }] }, { projectDir: '/fixture', warnings: [], loadMedia: async () => { throw new Error('No external media') } })
  return reviewDeck(built.native as PresentationData).issues.filter((issue) => issue.category === 'overlap')
}

describe('intentional backdrop containment versus real collisions', () => {
  it('does not flood the report for text and cards fully inside an earlier backdrop', async () => {
    expect(await overlaps([shape('background', [0, 0, 960, 540]), shape('card', [20, 20, 400, 200]), text('inside', [30, 30, 350, 60])])).toEqual([])
  })
  it('retains partial collisions, equal-size overlays and overlapping text', async () => {
    expect(await overlaps([shape('a', [20, 20, 100, 100]), shape('b', [70, 70, 100, 100])])).toHaveLength(1)
    expect(await overlaps([shape('a', [20, 20, 100, 100]), shape('b', [20, 20, 100, 100])])).toHaveLength(1)
    expect(await overlaps([text('a', [20, 20, 300, 100]), text('b', [30, 30, 100, 60])])).toHaveLength(1)
  })
  it('retains a later rectangle covering existing text', async () => {
    expect(await overlaps([text('covered', [30, 30, 300, 60]), shape('cover', [20, 20, 400, 200])])).toHaveLength(1)
  })
  it('retains rotated and non-rectangular shape containment', async () => {
    expect(await overlaps([{ ...shape('rotated', [20, 20, 400, 200]), rotation: 5 }, text('text', [30, 30, 300, 60])])).toHaveLength(1)
    expect(await overlaps([{ ...shape('ellipse', [20, 20, 400, 200]), shapeName: 'ellipse' }, text('text', [30, 30, 300, 60])])).toHaveLength(1)
  })
})
