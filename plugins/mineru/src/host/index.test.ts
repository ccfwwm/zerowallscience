import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { apiFor, extractZip, resolveMineruSource, validateConfig } from './index.js'

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

  it('admits readable absolute files outside the workspace while containing relative paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mineru-source-'))
    const workspace = join(root, 'workspace')
    const external = join(root, 'external.pdf')
    const local = join(workspace, 'local.txt')
    await mkdir(workspace)
    await writeFile(external, 'outside')
    await writeFile(local, 'inside')
    const ctx = { get: (name: string) => name === 'sessions' ? { get: () => ({ header: { cwd: workspace } }) } : undefined } as unknown as Context
    try {
      expect(await resolveMineruSource(ctx, randomUUID(), external)).toMatchObject({ filePath: external, sourceName: 'external.pdf' })
      expect(await resolveMineruSource(ctx, randomUUID(), 'local.txt')).toMatchObject({ filePath: local, sourceName: 'local.txt' })
      await expect(resolveMineruSource(ctx, randomUUID(), '../external.pdf')).rejects.toThrow(/工作区/)
      await expect(resolveMineruSource(ctx, randomUUID(), workspace)).rejects.toThrow(/普通文件/)
      expect(await resolveMineruSource(ctx, randomUUID(), 'https://example.test/document.pdf')).toEqual({ url: 'https://example.test/document.pdf', sourceName: 'https://example.test/document.pdf' })
      const legacyId = `file-sha256:${createHash('sha256').update('outside').digest('hex')}`
      const legacyCtx = { get: (name: string) => name === 'zerowallFiles'
        ? { materialize: async () => ({ path: external, name: 'external.pdf' }) } : undefined } as unknown as Context
      expect(await resolveMineruSource(legacyCtx, randomUUID(), legacyId)).toMatchObject({ filePath: external, sourceName: 'external.pdf' })
      await expect(resolveMineruSource(legacyCtx, randomUUID(), 'local.txt')).rejects.toThrow(/没有工作区/)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('accepts only verified native file references from the current session', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mineru-attachment-'))
    const path = join(root, 'uploaded.pdf')
    const data = Buffer.from('native attachment')
    await writeFile(path, data)
    const attachmentId = `sha256:${createHash('sha256').update(data).digest('hex')}`
    const ref = { attachmentId, name: 'uploaded.pdf', bytes: data.length }
    const sessionId = randomUUID()
    const events = [{ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'file', attachment: ref }] } }]
    const ctx = { get: (name: string) => name === 'sessions'
      ? { get: (id: string) => id === sessionId ? { header: { cwd: root }, snapshotEvents: () => events } : undefined }
      : name === 'attachments' ? { fileHostPath: () => path } : undefined } as unknown as Context
    try {
      expect(await resolveMineruSource(ctx, sessionId, attachmentId)).toMatchObject({ filePath: path, sourceName: 'uploaded.pdf' })
      await expect(resolveMineruSource(ctx, randomUUID(), attachmentId)).rejects.toThrow(/当前会话/)
      ref.bytes += 1
      await expect(resolveMineruSource(ctx, sessionId, attachmentId)).rejects.toThrow(/完整性/)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
