/** Optional local acceptance against a user-owned report; makes no network requests. */
import { Context } from '@deepseek-ai/cordis'
import OfficeKit from '@deepseek-ai/dsh-office-kit'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { executeIntegrityReport } from '../src/host/integrity-reports.ts'

const workspace = process.env.DSH_INTEGRITY_ACCEPTANCE_WORKSPACE
const reportDir = process.env.DSH_INTEGRITY_ACCEPTANCE_REPORT_DIR
it.skipIf(!workspace || !reportDir)('exports the selected report through the production Office provider', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(OfficeKit, { timeoutMs: 120000 })
    const callId = ToolCallId('local-integrity-acceptance')
    const exec: ToolExecution = { callId, rootCallId: callId, token: Symbol('test') as ToolExecution['token'], name: 'research_integrity', arguments: {}, signal: new AbortController().signal }
    const result = await executeIntegrityReport(ctx, { action: 'export', reportDir }, exec, workspace!, undefined, 10)
    expect(result).toMatchObject({ status: 'exported', pdf: { status: 'done' } })
    const latest = JSON.parse(await readFile(join(workspace!, reportDir!, 'latest.json'), 'utf8'))
    const bytes = await readFile(join(workspace!, latest.directory, 'report.pdf'))
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  } finally { await ctx.fiber.dispose() }
}, 180000)
