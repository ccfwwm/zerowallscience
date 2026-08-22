import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { materializeUploadedFile, prepareUploadedFile, readUploadedFile } from '../src/host/index.js'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('uploaded file preparation', () => {
  it('stores a content-addressed text file and supports bounded reads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-files-'))
    roots.push(root)
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = root
    try {
      const data = Buffer.from('alpha\nbeta\ngamma', 'utf8').toString('base64')
      const prepared = await prepareUploadedFile({ name: 'notes.txt', mediaType: 'text/plain', data })
      expect(prepared).toMatchObject({ name: 'notes.txt', parser: 'text', status: 'parsed', textChars: 16 })
      expect(prepared.sha256).toMatch(/^[a-f0-9]{64}$/u)
      expect(prepared.preview).toBe('alpha\nbeta\ngamma')
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
      await expect(prepareUploadedFile({ name: 'broken.json', data: Buffer.from('{').toString('base64') })).resolves.toMatchObject({ parser: 'text-auto', status: 'parsed' })
      const generic = await prepareUploadedFile({ name: 'sample.custom', data: Buffer.from([0, 1, 2, 255]).toString('base64') })
      expect(generic).toMatchObject({ parser: 'raw', status: 'stored', preview: '', textChars: 0 })
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

  it('extracts text from a real PDF payload using the bundled PDF.js runtime', async () => {
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
      expect(prepared).toMatchObject({ parser: 'pdfjs', status: 'parsed', pageCount: 1 })
      expect(prepared.preview).toContain('PDF upload extraction works')
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
