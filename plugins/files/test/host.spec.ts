import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { materializeUploadedFile, prepareUploadedFile, readUploadedFile, ZeroWallFilesService } from '../src/host/index.js'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('uploaded file preparation', () => {
  it.each([false, true])('parses native PDF receipts automatically (MinerU configured: %s)', async configured => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-native-pdf-')); roots.push(root)
    const previous = process.env.DSH_HOME; process.env.DSH_HOME = root
    try {
      const document = await PDFDocument.create()
      document.addPage().drawText('Native PDF local extraction', { x: 72, y: 720, font: await document.embedFont(StandardFonts.Helvetica) })
      const bytes = Buffer.from(await document.save())
      const sha = createHash('sha256').update(bytes).digest('hex')
      const path = join(root, 'native.pdf'); await writeFile(path, bytes)
      const parsedPath = join(root, 'full.md'); await writeFile(parsedPath, '# MinerU parsed PDF')
      const ref = { attachmentId: `sha256:${sha}`, name: 'native.pdf', bytes: bytes.length }
      const agent = {}
      const parse = vi.fn().mockResolvedValue({ artifacts: [{ name: 'full.md', path: parsedPath }] })
      const services = {
        agents: { get: (id: string) => id === 'session-1' ? agent : undefined },
        fileUploads: { resolve: (owner: unknown, receipt: string) => owner === agent && receipt === 'receipt-1' ? ref : undefined },
        attachments: { fileHostPath: () => path },
        zerowallMineru: { getConfigStatus: async () => ({ tokenConfigured: configured }), parse },
      }
      const service = Object.create(ZeroWallFilesService.prototype) as ZeroWallFilesService
      Object.defineProperty(service, 'ctx', { value: { get: (name: keyof typeof services) => services[name], sessions: { get: () => ({}) } } })
      const prepared = await service.prepareNative({ sessionId: 'session-1', receiptId: 'receipt-1' })
      expect(prepared.content).toContain(configured ? 'MinerU parsed PDF' : 'Native PDF local extraction')
      expect(parse).toHaveBeenCalledTimes(configured ? 1 : 0)
      const enriched = await service.enrichNative('session-1', ref as never)
      expect(enriched).toMatchObject({ attachmentId: ref.attachmentId, content: prepared.content, status: 'parsed' })
      await expect(service.downloadOriginal({ sessionId: 'session-1', attachmentId: ref.attachmentId })).resolves.toMatchObject({ data: bytes.toString('base64') })
      await expect(service.prepareNative({ sessionId: 'other-session', receiptId: 'receipt-1' })).rejects.toThrow('not uploaded for this session')
    } finally { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous }
  })
  it('stores a content-addressed text file and supports bounded reads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-files-'))
    roots.push(root)
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = root
    try {
      const data = Buffer.from('alpha\nbeta\ngamma', 'utf8').toString('base64')
      const prepared = await prepareUploadedFile({ name: 'notes.txt', mediaType: 'text/plain', data })
      expect(prepared).toMatchObject({ name: 'notes.txt', storageStatus: 'stored', bytes: 16 })
      expect(prepared.sha256).toMatch(/^[a-f0-9]{64}$/u)
      expect(prepared).not.toHaveProperty('preview')
      const first = await readUploadedFile(prepared.attachmentId, 0, 6)
      expect(first.text).toBe('alpha\n')
      expect(first.hasMore).toBe(true)
      const second = await readUploadedFile(prepared.attachmentId, first.nextOffset, 64)
      expect(second.text).toBe('beta\ngamma')
      expect(await readFile(join(root, 'attachments', 'files', 'v1', 'objects', prepared.sha256.slice(0, 2), `${prepared.sha256}.bin`), 'utf8')).toBe('alpha\nbeta\ngamma')
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    }
  })

  it('rejects empty files but stores unknown and malformed formats for Agent inspection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-files-generic-'))
    roots.push(root)
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = root
    try {
    await expect(prepareUploadedFile({ name: 'empty.txt', data: '' })).rejects.toThrow('empty')
      await expect(prepareUploadedFile({ name: 'broken.json', data: Buffer.from('{').toString('base64') })).resolves.toMatchObject({ storageStatus: 'stored' })
      const generic = await prepareUploadedFile({ name: 'sample.custom', data: Buffer.from([0, 1, 2, 255]).toString('base64') })
      expect(generic).toMatchObject({ storageStatus: 'stored', bytes: 4 })
      const workspace = await mkdtemp(join(tmpdir(), 'zerowall-files-workspace-'))
      roots.push(workspace)
      const materialized = await materializeUploadedFile(generic.attachmentId, workspace)
      expect(materialized.path).toBe(join(workspace, '.zerowall', 'uploads', generic.sha256, 'sample.custom'))
      expect(await readFile(materialized.path)).toEqual(Buffer.from([0, 1, 2, 255]))
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    }
  })

  it('stores a PDF immediately and extracts it only on first read', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-files-pdf-'))
    roots.push(root)
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = root
    try {
      const document = await PDFDocument.create()
      const page = document.addPage()
      page.drawText('PDF upload extraction works', { x: 72, y: 720, font: await document.embedFont(StandardFonts.Helvetica) })
      const prepared = await prepareUploadedFile({
        name: 'paper.pdf',
        mediaType: 'application/pdf',
        data: Buffer.from(await document.save()).toString('base64'),
      })
      expect(prepared).toMatchObject({ storageStatus: 'stored', mediaType: 'application/pdf' })
      expect(prepared).not.toHaveProperty('parser')
      await expect(readUploadedFile(prepared.attachmentId)).resolves.toMatchObject({ text: expect.stringContaining('PDF upload extraction works') })
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    }
  })

  it('rejects linked upload destinations before writing outside the workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-files-link-'))
    const workspace = await mkdtemp(join(tmpdir(), 'zerowall-files-link-workspace-'))
    const outside = await mkdtemp(join(tmpdir(), 'zerowall-files-link-outside-'))
    roots.push(root, workspace, outside)
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = root
    try {
      const prepared = await prepareUploadedFile({ name: 'sample.bin', data: Buffer.from([0, 1]).toString('base64') })
      await mkdir(join(workspace, '.zerowall'))
      await symlink(outside, join(workspace, '.zerowall', 'uploads'), process.platform === 'win32' ? 'junction' : 'dir')
      await expect(materializeUploadedFile(prepared.attachmentId, workspace)).rejects.toThrow('link or non-directory')
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    }
  })
})
