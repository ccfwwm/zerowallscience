/** Report export failure, recovery and source identity through the shared converter. */
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import OfficeToPdf, { OfficeToPdfError, OfficeToPdfKey } from '@deepseek-ai/dsh-office-to-pdf'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { executeIntegrityReport } from '../src/host/integrity-reports.ts'

const contexts: Context[] = [], roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})
async function setup(converter = true) {
  const ctx = new Context(); contexts.push(ctx)
  if (converter) await ctx.plugin(OfficeToPdf)
  const root = await mkdtemp(join(tmpdir(), 'integrity-export-')); roots.push(root)
  const directory = join(root, 'reports', 'revision-0001')
  await mkdir(directory, { recursive: true })
  const bytes = Buffer.from('frozen Word source')
  const hash = createHash('sha256').update(bytes).digest('hex')
  await writeFile(join(directory, 'report.docx'), bytes)
  await writeFile(join(directory, 'report.html'), '<p>frozen HTML</p>')
  await writeFile(join(directory, 'exports.json'), JSON.stringify({ schema_version: 1, data_sha256: 'data-one', artifacts: { 'report.docx': { sha256: hash, bytes: bytes.length } }, pdf: { status: 'pending' } }))
  await writeFile(join(root, 'reports', 'latest.json'), JSON.stringify({ directory: 'reports/revision-0001', summary: { priority_limit: 10 }, revision: 1, report_id: 'ri-example' }))
  const signal = new AbortController()
  const exec: ToolExecution = { callId: ToolCallId('report-export'), rootCallId: ToolCallId('report-export'), token: Symbol('test') as ToolExecution['token'], name: 'research_integrity', arguments: {}, signal: signal.signal }
  const run = (action = 'export') => executeIntegrityReport(ctx, { action, reportDir: 'reports' }, exec, root, undefined, 10)
  const receipt = async () => JSON.parse(await readFile(join(directory, 'exports.json'), 'utf8'))
  return { ctx, root, directory, bytes, hash, signal, run, receipt }
}

it('returns usable HTML and Word and records unavailable PDF without a converter', async () => {
  const fixture = await setup(false)
  expect(await fixture.run()).toMatchObject({ status: 'partial', html: expect.stringContaining('report.html'), docx: expect.stringContaining('report.docx'), pdf: { status: 'unavailable' } })
  expect((await fixture.receipt()).pdf.status).toBe('unavailable')
  expect(await readFile(join(fixture.directory, 'report.docx'))).toEqual(fixture.bytes)
})

it('retains a failed revision and retries PDF from exactly its recorded Word bytes', async () => {
  const fixture = await setup()
  const convert = vi.spyOn(fixture.ctx.officeToPdf, 'convert').mockRejectedValueOnce(new OfficeToPdfError('timeout', 'private engine detail'))
  expect(await fixture.run()).toMatchObject({ status: 'partial', pdf: { status: 'failed', code: 'timeout' } })
  expect(JSON.stringify((await fixture.receipt()).pdf)).not.toContain('private engine detail')
  convert.mockImplementationOnce(async (request, signal) => {
    const source = await request.source.read(signal!, fixture.bytes.length)
    expect(source).toEqual({ bytes: fixture.bytes, version: fixture.hash })
    expect(request.source.version).toBe(fixture.hash)
    return { pdf: Buffer.from('%PDF-1.7\n%%EOF'), missingFonts: ['Example'], cacheKey: OfficeToPdfKey('test'), generation: fixture.ctx.officeToPdf.generation }
  })
  expect(await fixture.run()).toMatchObject({ status: 'exported', pdf: { status: 'done', missingFonts: ['Example'] } })
  const receipt = await fixture.receipt()
  expect(receipt).toMatchObject({ data_sha256: 'data-one', pdf: { status: 'done' }, artifacts: { 'report.pdf': { bytes: 14 } } })
  expect(await readFile(join(fixture.directory, 'report.docx'))).toEqual(fixture.bytes)
})

it('rejects changed Word bytes before rendering them', async () => {
  const fixture = await setup()
  await writeFile(join(fixture.directory, 'report.docx'), 'changed')
  expect(await fixture.run()).toMatchObject({ status: 'partial', pdf: { status: 'failed', code: 'source-changed' } })
})

it('propagates cancellation and unknown converter defects without reporting success', async () => {
  const fixture = await setup()
  const error = new Error('unexpected defect')
  vi.spyOn(fixture.ctx.officeToPdf, 'convert').mockRejectedValue(error)
  await expect(fixture.run()).rejects.toBe(error)
  fixture.signal.abort(new Error('user stopped'))
  await expect(fixture.run()).rejects.toThrow('user stopped')
  expect((await fixture.receipt()).pdf.status).toBe('pending')
})

it('reads status without converting and refuses an output directory outside the workspace', async () => {
  const fixture = await setup()
  const convert = vi.spyOn(fixture.ctx.officeToPdf, 'convert')
  expect(await fixture.run('status')).toMatchObject({ status: 'compiled', report: { summary: { priority_limit: 10 } } })
  expect(convert).not.toHaveBeenCalled()
  await expect(executeIntegrityReport(fixture.ctx, { action: 'status', reportDir: '../outside' }, { signal: fixture.signal.signal } as ToolExecution, fixture.root, undefined, 10)).rejects.toMatchObject({ code: 'input' })
})
