import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { apiFor, extractZip, validateConfig } from './index.js'

const base = {
  apiBaseUrl: 'https://mineru.net', tokenCredential: 'MINERU_API_TOKEN', mode: 'auto' as const,
  modelVersion: 'vlm' as const, language: 'ch', enableTable: true, enableFormula: true, isOcr: false,
  extraFormats: [] as never[], timeoutMs: 600000, pollIntervalMs: 3000, pollJitterMs: 500,
  submitRatePerMinute: 40, dailyLimit: 5000, inlineMarkdownBytes: 12000, artifactRootName: '.dsh-mineru',
}

describe('MinerU safety and mode selection', () => {
  it('selects precision only when a token exists', () => {
    expect(apiFor('auto', undefined)).toBe('local')
    expect(apiFor('auto', 'secret')).toBe('precision')
    expect(apiFor('precision', undefined)).toBe('local')
    expect(apiFor('agent', 'secret')).toBe('agent')
  })

  it('rejects the token-management page as an API endpoint', () => {
    expect(() => validateConfig({ ...base, apiBaseUrl: 'https://mineru.net/apiManage/token' })).toThrow(/管理页面/iu)
    expect(() => validateConfig({ ...base, apiBaseUrl: 'file:///tmp/mineru' })).toThrow(/http/iu)
  })

  it('rejects traversal in result archives', async () => {
    const zip = new JSZip()
    zip.file('../escape.txt', 'blocked')
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' })
    const dir = await mkdtemp(join(tmpdir(), 'mineru-test-'))
    await extractZip(bytes, dir)
    await expect(readFile(join(dir, '..', 'escape.txt'), 'utf8')).rejects.toThrow()
    await rm(dir, { recursive: true, force: true })
  })

  it('keeps local mode when no token value is supplied', async () => {
    const previous = process.env.MINERU_API_TOKEN
    process.env.MINERU_API_TOKEN = 'must-not-be-read'
    try {
      expect(apiFor('auto', undefined)).toBe('local')
    } finally {
      if (previous === undefined) delete process.env.MINERU_API_TOKEN
      else process.env.MINERU_API_TOKEN = previous
    }
  })

  it('extracts ordinary result files and preserves bytes', async () => {
    const zip = new JSZip()
    zip.file('full.md', '# result')
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' })
    const dir = await mkdtemp(join(tmpdir(), 'mineru-test-'))
    await extractZip(bytes, dir)
    await expect(readFile(join(dir, 'full.md'), 'utf8')).resolves.toBe('# result')
    await rm(dir, { recursive: true, force: true })
  })
})
