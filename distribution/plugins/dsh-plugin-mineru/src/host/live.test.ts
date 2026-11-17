import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { MineruEngine } from './engine.ts'
import { DEFAULTS } from './config.ts'

it.skipIf(process.env.MINERU_LIVE !== '1' && process.env.MINERU_PRECISION_LIVE !== '1')('parses a synthetic one-page PDF through the selected real API', async () => {
  const root = resolve(import.meta.dirname, '../../../../../.artifacts/mineru-live')
  await mkdir(root, { recursive: true })
  const cwd = await mkdtemp(resolve(root, 'sample-'))
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  pdf.addPage().drawText('ZeroWall MinerU integration sample. Total: 42.', { x: 50, y: 700, size: 16, font })
  await writeFile(resolve(cwd, 'sample.pdf'), await pdf.save())
  const ctx = new Context()
  ctx.provide('sessions', { get: () => ({ header: { cwd }, snapshotEvents: () => [] }) } as never)
  const stop = new AbortController()
  const precision = process.env.MINERU_PRECISION_LIVE === '1'
  if (precision && !process.env.MINERU_API_TOKEN?.trim()) throw new Error('Precision live test requires MINERU_API_TOKEN')
  const engine = new MineruEngine(ctx, () => ({ ...DEFAULTS, timeoutMs: 180000, pollIntervalMs: 2000 }), async () => precision ? process.env.MINERU_API_TOKEN : undefined, stop.signal)
  try {
    const result = await engine.parse({ sessionId: 'live', source: 'sample.pdf', mode: precision ? 'precision' : 'agent', overrides: { isOcr: true, anchor: true } })
    expect(result.api).toBe(precision ? 'precision' : 'agent')
    if (precision) expect(result.artifacts.some(item => item.name === 'content-list.normalized.json')).toBe(true)
    expect(result.preview.markdown).toContain('42')
    await writeFile(resolve(cwd, 'verification.json'), JSON.stringify({ api: result.api, taskId: result.taskId, runDir: result.runDir, artifacts: result.artifacts.length, containsExpectedText: true }, null, 2) + '\n')
  } finally { stop.abort(); await engine.drain(); await ctx.fiber.dispose() }
}, 200000)
