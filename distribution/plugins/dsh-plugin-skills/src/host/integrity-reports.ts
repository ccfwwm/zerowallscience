/** Workspace-owned integrity report compilation and shared Office PDF conversion. */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {} from '@zerowall/dsh-plugin-python'
import { OfficeSourceKey, OfficeKitError } from '@deepseek-ai/dsh-office-kit'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { createHash } from 'node:crypto'
import { open, readFile, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const reportArgs = z.object({
  action: z.enum(['report', 'resume', 'status', 'export']),
  reportSpec: z.string().min(1).optional(), reportDir: z.string().min(1),
  priorityLimit: z.number().int().min(1).max(100).optional(),
  exportFormats: z.array(z.enum(['html', 'docx', 'pdf'])).min(1).optional(),
})
const buildResult = z.object({ ok: z.literal(true), directory: z.string(), exports: z.string(), html: z.string(), docx: z.string().optional() }).passthrough()
const exportsRecord = z.object({ schema_version: z.literal(1), data_sha256: z.string(), artifacts: z.record(z.string(), z.object({ sha256: z.string(), bytes: z.number() })), pdf: z.object({ status: z.string() }).passthrough() })
const latestRecord = z.object({ directory: z.string(), summary: z.json(), revision: z.number(), report_id: z.string() }).passthrough()

/** An operation code and safe message; failed exports never remove existing reports. */
export class IntegrityReportError extends Error {
  /** @param code - Stable handling discriminator. @param message - Actionable report diagnostic. @param options - Original failure. */
  constructor(readonly code: 'unavailable' | 'input' | 'compile' | 'source-changed' | 'busy', message: string, options?: ErrorOptions) { super(message, options) }
}

function contained(root: string, path: string): boolean {
  const delta = relative(root, path)
  return delta !== '..' && !delta.startsWith('../') && !delta.startsWith('..\\') && !isAbsolute(delta)
}

/** Authorize a physical workspace file, including links. @param cwd - Workspace root. @param input - Existing local file. @returns Canonical file path. */
export async function integrityFile(cwd: string, input: string): Promise<string> {
  const root = await realpath(cwd)
  const path = await realpath(resolve(cwd, input))
  if (!contained(root, path)) throw new IntegrityReportError('input', '报告输入和证据必须位于当前工作目录。')
  return path
}

async function convertPdf(ctx: Context, cwd: string, directory: string, signal: AbortSignal): Promise<Record<string, JsonValue>> {
  const converter = ctx.get('officeKit')
  const manifestPath = await integrityFile(cwd, join(directory, 'exports.json'))
  const sourcePath = await integrityFile(cwd, join(directory, 'report.docx'))
  return withFileLock(manifestPath, async () => {
    const manifest = exportsRecord.parse(JSON.parse(await readFile(manifestPath, 'utf8')))
    const saveReceipt = async (): Promise<void> => writeFileAtomic(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
    if (!converter) {
      const result = { status: 'unavailable', message: 'Word 和 HTML 已保留；启用 Office PDF 转换服务后重试 export。' }
      manifest.pdf = result
      await saveReceipt()
      return result
    }
    const sourceHash = manifest.artifacts['report.docx']?.sha256
    if (!sourceHash) throw new IntegrityReportError('input', '本修订没有 Word 导出记录，请先生成报告。')
    let pdf
    try {
      pdf = await converter.convert({ extension: 'docx', priority: 'foreground', source: {
      key: OfficeSourceKey(JSON.stringify([cwd, sourcePath])), version: sourceHash, bytes: (await stat(sourcePath)).size,
      async read(readSignal, maxBytes) {
        readSignal.throwIfAborted()
        const file = await open(sourcePath, 'r')
        try {
          const bytes = Buffer.alloc(Math.min((await file.stat()).size, maxBytes + 1))
          let offset = 0
          while (offset < bytes.length) {
            readSignal.throwIfAborted()
            const read = await file.read(bytes, offset, bytes.length - offset, offset)
            if (!read.bytesRead) break
            offset += read.bytesRead
          }
          const content = bytes.subarray(0, offset)
          return { bytes: content, version: createHash('sha256').update(content).digest('hex') }
        } finally { await file.close() }
      },
      } }, signal)
    } catch (error) {
      signal.throwIfAborted()
      if (!(error instanceof OfficeKitError)) throw error
      const result = { status: 'failed', code: error.code, message: 'PDF 转换未完成，Word 和 HTML 已保留。修复转换服务后用 export 重试。' }
      manifest.pdf = result
      await saveReceipt()
      return result
    }
    signal.throwIfAborted()
    const target = join(dirname(sourcePath), 'report.pdf')
    await writeFileAtomic(target, pdf.pdf, { mode: 0o600 })
    manifest.pdf = { status: 'done', missingFonts: pdf.missingFonts, engine: 'officeToPdf' }
    manifest.artifacts['report.pdf'] = { sha256: createHash('sha256').update(pdf.pdf).digest('hex'), bytes: pdf.pdf.byteLength }
    await saveReceipt()
    return { status: 'done', path: relative(cwd, target), missingFonts: pdf.missingFonts }
  }, { signal })
}

/** Compile or export a frozen report using managed dependencies, never a shell command. @param ctx - Host services. @param input - Tool JSON. @param exec - Current logged tool execution. @param cwd - Authorized workspace. @param resources - Optional resource override. @param priorityLimit - Resolved deployment default. @returns Report identity, summary and real artifact paths. */
export async function executeIntegrityReport(ctx: Context, input: unknown, exec: ToolExecution, cwd: string, resources: string | undefined, priorityLimit: number): Promise<Record<string, JsonValue>> {
  const args = reportArgs.parse(input)
  const root = await realpath(cwd)
  const output = resolve(root, args.reportDir)
  if (!contained(root, output)) throw new IntegrityReportError('input', '报告目录必须位于当前工作目录。')
  if (args.action === 'status' || args.action === 'export') {
    const latestPath = await integrityFile(root, join(output, 'latest.json'))
    const latest = latestRecord.parse(JSON.parse(await readFile(latestPath, 'utf8')))
    const receiptPath = await integrityFile(root, join(latest.directory, 'exports.json'))
    const receipt = exportsRecord.parse(JSON.parse(await readFile(receiptPath, 'utf8')))
    if (args.action === 'status') return { status: 'compiled', report: z.json().parse(latest), exports: z.json().parse(receipt) }
    const pdf = await convertPdf(ctx, root, latest.directory, exec.signal)
    return { status: pdf.status === 'done' ? 'exported' : 'partial', report: z.json().parse(latest),
      html: join(latest.directory, 'report.html'), docx: join(latest.directory, 'report.docx'), pdf }
  }
  if (!args.reportSpec) throw new IntegrityReportError('input', 'report 和 resume 需要 reportSpec 证据清单。')
  const spec = await integrityFile(root, args.reportSpec)
  const python = ctx.get('zerowallPython')
  const manager = ctx.get('zerowallPythonManagement')
  if (!python || !manager) throw new IntegrityReportError('unavailable', '启用托管 Python 服务后重试；尚未生成报告。')
  const formats = args.exportFormats ?? ['html', 'docx', 'pdf']
  if (formats.includes('docx') || formats.includes('pdf')) await manager.ensureCapability('skill-integrity-report')
  const own = fileURLToPath(import.meta.url).replace(/\.asar([\\/])/u, '.asar.unpacked$1')
  const resourceRoot = resources ?? resolve(dirname(own), own.endsWith('.ts') ? '../..' : '..', 'resources')
  const scripts = join(resourceRoot, 'skills/zerowall-image-dup/scripts')
  const request = JSON.stringify({ workspace: root, spec_path: spec, output, priority_limit: args.priorityLimit ?? priorityLimit, formats })
  const code = `import sys,json\nsys.path.insert(0,${JSON.stringify(scripts)})\nfrom integrity_report import publish\nargs=json.loads(${JSON.stringify(request)})\nprint(json.dumps(publish(**args),ensure_ascii=False))`
  const result = await python.run({ code, description: '生成带内嵌证据的论文核验结论报告', timeoutMs: 600000, workdir: root,
    ...(formats.includes('docx') || formats.includes('pdf') ? { capability_id: 'skill-integrity-report' } : {}) }, exec)
  if (result.exitCode !== 0 || result.timedOut || result.cancelled) throw new IntegrityReportError('compile', '报告生成未完成，旧报告已保留。检查证据路径、文件哈希和托管 Python 依赖后重试。')
  const report = buildResult.parse(JSON.parse(result.stdout.trim()))
  const pdf = formats.includes('pdf') ? await convertPdf(ctx, root, report.directory, exec.signal) : { status: 'not_requested' }
  return { status: formats.includes('pdf') && pdf.status !== 'done' ? 'partial' : 'compiled', report: z.json().parse(report), pdf }
}
