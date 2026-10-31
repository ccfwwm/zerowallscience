/**
 * ppt_export — build the project and write a .pptx:
 * { ok, path, revision, check: { pass, blockerCount } | { skipped: true } }.
 *
 * Existing rule/image reviews are advisory. Export never waits for new QA.
 * On success the receipt lands in manifest.exportReport.
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildProjectDeck, saveProjectPptx } from '../core/lazy-export-pipeline.js'
import { loadProject, ProjectError, writeExportReport } from '../core/project/store.js'
import { renderSummary, resultSchema, resolveSessionCwd, toolError, type PluginToolCtx } from './shared.js'

export function registerExportTool(ctx: PluginToolCtx): (() => void) | undefined {
  const off = ctx.tools.register({
    name: 'ppt_export',
    description: '立即导出当前工程为 .pptx。来源账本、审阅与规则检查均为质量提示，不阻止导出，也不等待后台生图或检查。实际序列化或素材读取失败会返回明确错误。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['dir', 'out'],
      properties: {
        dir: { type: 'string', minLength: 1, description: '工程目录（相对于会话 cwd）' },
        out: { type: 'string', minLength: 1, description: '导出文件路径（相对于会话 cwd，.pptx）' },
        skipCheck: { type: 'boolean', description: '兼容旧调用。导出始终使用已有质量提示，不触发新的检查。' }
      }
    },
    output: {
      schema: resultSchema({
        path: { type: 'string' },
        revision: { type: 'integer' },
        snapshotHash: { type: 'string' },
        qualityIssues: { type: 'array', items: { type: 'string' } },
        bytes: { type: 'integer' },
        fontsUsed: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } },
        fontEmbed: { type: 'object', additionalProperties: true },
        check: {
          type: 'object',
          additionalProperties: true,
          properties: {
            pass: { type: 'boolean' },
            blockerCount: { type: 'integer' },
            skipped: { type: 'boolean' }
          }
        }
      }),
      render: renderSummary((r) => {
        const p = r.path as string | undefined
        const check = r.check as { pass?: boolean; blockerCount?: number; skipped?: boolean } | undefined
        const verdict =
          check?.skipped === true
            ? '未质检'
            : `质检 ${check?.pass === true ? '通过' : `提示 ${check?.blockerCount ?? 0} 项`}`
        return `已导出 ${p ?? ''}（${verdict}）`
      })
    },
    execute: async (args, exec) => {
      try {
        const cwd = resolveSessionCwd(exec, ctx.sessions)
        const dir = args.dir as string
        const out = args.out as string
        const pipeline = await buildProjectDeck(cwd, dir)

        // Export uses available QA evidence and never waits for a new check/render.
        const loaded = await loadProject(cwd, dir)
        const checkSummary = (loaded.manifest.qaReport ?? null) as { pass: boolean; blockerCount: number } | null

        const saved = await saveProjectPptx(pipeline)
        const bytes = saved.bytes

        const absOut = path.resolve(cwd, out)
        const rel = path.relative(cwd, absOut)
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          throw new ProjectError('PathOutsideCwd', `导出路径必须位于会话 cwd 内：${out}`, { status: 400 })
        }
        await writeFile(absOut, bytes)

        const report = {
          revision: pipeline.revision,
          snapshotHash: pipeline.snapshotHash,
          qualityIssues: pipeline.qualityIssues,
          exportedAt: new Date().toISOString(),
          out: path.relative(cwd, absOut).replace(/\\/g, '/'),
          bytes: bytes.byteLength,
          fontsUsed: pipeline.fontsUsed,
          transition: loaded.deck.export?.transition ?? 'fade',
          animations: loaded.deck.export?.animations ?? 'auto',
          fontEmbed: saved.fontEmbed
            ? {
                mode: saved.fontEmbed.mode,
                facesEmbedded: saved.fontEmbed.facesEmbedded.length,
                skipped: saved.fontEmbed.skipped.length,
                rawBytes: saved.fontEmbed.rawBytes,
                finalBytes: saved.fontEmbed.finalBytes,
                warnings: saved.fontEmbed.warnings,
                subset: saved.fontEmbed.subset,
                skippedDetail: saved.fontEmbed.skipped
              }
            : { mode: 'off' as const },
          buildWarnings: pipeline.buildWarnings,
          /** 已有质检摘要，仅供提示。 */
          check: checkSummary
        }
        await writeExportReport(cwd, dir, report)

        return {
          ok: true,
          path: report.out,
          revision: pipeline.revision,
          bytes: bytes.byteLength,
          snapshotHash: pipeline.snapshotHash,
          qualityIssues: pipeline.qualityIssues,
          fontsUsed: pipeline.fontsUsed,
          warnings: [...pipeline.buildWarnings, ...pipeline.qualityIssues],
          fontEmbed: saved.fontEmbed
            ? {
                mode: saved.fontEmbed.mode,
                facesEmbedded: saved.fontEmbed.facesEmbedded,
                facesEmbeddedCount: saved.fontEmbed.facesEmbedded.length,
                skipped: saved.fontEmbed.skipped,
                skippedCount: saved.fontEmbed.skipped.length,
                rawBytes: saved.fontEmbed.rawBytes,
                finalBytes: saved.fontEmbed.finalBytes,
                subset: saved.fontEmbed.subset,
                warnings: saved.fontEmbed.warnings
              }
            : { mode: 'off' as const, facesEmbedded: [], facesEmbeddedCount: 0, skipped: [], skippedCount: 0, rawBytes: bytes.byteLength, finalBytes: bytes.byteLength, warnings: [] },
          check: checkSummary ?? { skipped: true }
        }
      } catch (err) {
        return toolError(err)
      }
    }
  })
  return typeof off === 'function' ? (off as () => void) : undefined
}
