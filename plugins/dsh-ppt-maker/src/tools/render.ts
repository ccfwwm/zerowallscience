/**
 * ppt_render — render project pages to PNG previews via libreoffice-kit:
 * { ok, images: [{ page, path }] }. Renders the engine-built
 * pptx bytes BEFORE font embedding (LibreOffice 会误用嵌入的子集 EOT 字体，
 * 预览必须走未嵌入字节，由系统字体承担渲染).
 */
import path from 'node:path'
import { renderProjectPreviews } from '../core/lazy-export-pipeline.js'
import { renderSummary, resultSchema, resolveSessionCwd, toolError, type PluginToolCtx } from './shared.js'

export function registerRenderTool(ctx: PluginToolCtx): (() => void) | undefined {
  const off = ctx.tools.register({
    name: 'ppt_render',
    description:
      '把工程渲染成每页 PNG 预览：经引擎构建最终 pptx 字节后由 libreoffice-kit 光栅化（96dpi）。' +
      '返回 { ok, images:[{page,path}] }，图片落在工程目录 .previews/ 下；用于人眼核对版面。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['dir'],
      properties: {
        dir: { type: 'string', minLength: 1, description: '工程目录（相对于会话 cwd）' },
        pages: {
          type: 'array',
          items: { type: 'integer', minimum: 1 },
          description: '只渲染这些页（1 起）；默认全部'
        },
        dpi: { type: 'integer', minimum: 24, maximum: 600, description: '渲染分辨率，默认 96' }
      }
    },
    output: {
      schema: resultSchema({
        revision: { type: 'integer' },
        images: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              page: { type: 'integer' },
              path: { type: 'string' },
              width: { type: 'integer' },
              height: { type: 'integer' }
            }
          }
        },
        missingFonts: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } }
      }),
      render: renderSummary((r) => {
        const images = (r.images as Array<{ page: number }> | undefined) ?? []
        return `已渲染 ${images.length} 页预览`
      })
    },
    execute: async (args, exec) => {
      try {
        const cwd = resolveSessionCwd(exec, ctx.sessions)
        const dir = args.dir as string
        const rendered = await renderProjectPreviews(cwd, dir, {
          pages: args.pages as number[] | undefined,
          dpi: (args.dpi as number | undefined) ?? 96
        })
        return {
          ok: true,
          revision: rendered.revision,
          images: rendered.images.map((image) => ({ ...image, path: path.relative(cwd, image.path).replace(/\\/g, '/') })),
          missingFonts: rendered.missingFonts,
          warnings: rendered.warnings
        }
      } catch (err) {
        return toolError(err)
      }
    }
  })
  return typeof off === 'function' ? (off as () => void) : undefined
}
