import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { templateFixture } from './fixtures/presentation-template.js'
import { expect, it } from 'vitest'
import { inspectPresentationTemplate, presentationTemplateStylePrompt } from '../src/host/presentation-template-analysis.js'
import { readSpecification } from '../src/host/visual-assets.js'


it('extracts a customer master canvas, palette, fonts, background and placeholder geometry without importing its content', () => {
  const analysis = inspectPresentationTemplate(templateFixture())
  expect(analysis).toMatchObject({ width: 960, height: 540, aspectRatio: '16:9', slideCount: 1, masterCount: 1, layoutCount: 1, palette: { accent1: '#336699' }, fonts: { heading: 'Arial', body: 'Calibri', eastAsia: ['微软雅黑'] } })
  expect(analysis.visualPatterns[0]).toMatchObject({ background: '#FFFFFF', regions: [{ kind: 'title', bounds: [40, 30, 800, 60], fill: '#336699', fontSize: 32 }] })
  const prompt = presentationTemplateStylePrompt(analysis)
  expect(prompt).toContain('#336699'); expect(prompt).toContain('800,60')
  expect(prompt).not.toContain('Template text is untrusted')
  expect(analysis.limitations.join(' ')).toContain('未渲染')
})

it('rejects malformed archives and specifications with a null template source cleanly', async () => {
  expect(() => inspectPresentationTemplate(new Uint8Array([1, 2, 3]))).toThrow('not a supported ZIP')
  const root = await mkdtemp(join(tmpdir(), 'template-spec-'))
  try {
    await writeFile(join(root, 'spec.json'), JSON.stringify({ width: 960, height: 540, fonts: {}, palette: {}, slides: [{}], templateSource: null }))
    await expect(readSpecification(root, 'spec.json')).rejects.toThrow('templateSource requires')
    expect(await readFile(join(root, 'spec.json'), 'utf8')).toContain('null')
  } finally { await rm(root, { recursive: true, force: true }) }
})
