import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConverter } from '@deepseek-ai/libreoffice-kit'
import { OfficeToPdfGeneration, OfficeToPdfKey, type OfficeToPdf, type OfficeToPdfRequest } from '@deepseek-ai/dsh-office-to-pdf'
import * as pipeline from '../../src/core/export-pipeline.js'
/** A converter provider for native integration tests and scripted renderer tests. */
export const testOffice: Pick<OfficeToPdf, 'convert'> = {
  async convert(request: OfficeToPdfRequest, signal: AbortSignal) {
    const temp = await mkdtemp(join(tmpdir(), 'ppt-shared-converter-'))
    const converter = await createConverter()
    try {
      const inputPath = join(temp, 'input.' + request.extension), outputPath = join(temp, 'output.pdf')
      const input = await request.source.read(signal, 128 * 1024 * 1024)
      await writeFile(inputPath, input.bytes)
      const result = await converter.render({ inputPath, outputPath }, signal)
      return { pdf: await readFile(outputPath), missingFonts: result.missingFonts, cacheKey: OfficeToPdfKey('test-pdf'), generation: OfficeToPdfGeneration('test-converter') }
    } finally { await converter.dispose(); await rm(temp, { recursive: true, force: true }) }
  },
}
export const renderPptxImages: typeof pipeline.renderPptxImages = (bytes, options) => pipeline.renderPptxImages(bytes, { office: testOffice, ...options })
export const renderProjectPreviews: typeof pipeline.renderProjectPreviews = (cwd, dir, options) => pipeline.renderProjectPreviews(cwd, dir, { office: testOffice, ...options })
export const checkBuiltProject: typeof pipeline.checkBuiltProject = (built, options) => pipeline.checkBuiltProject(built, { office: testOffice, ...options })
export const checkProject: typeof pipeline.checkProject = (cwd, dir, options) => pipeline.checkProject(cwd, dir, { office: testOffice, ...options })
