import { Context } from '@deepseek-ai/cordis'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { resolveMineruSource } from './index.js'

it('restricts local files to the session workspace and verifies native session attachments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-mineru-source-'))
  const workspace = join(root, 'workspace')
  await mkdir(workspace)
  const external = join(root, 'external.pdf')
  const local = join(workspace, 'source.pdf')
  const data = Buffer.from('synthetic native attachment')
  await writeFile(external, data)
  await writeFile(local, 'workspace document')
  const attachmentId = 'sha256:' + createHash('sha256').update(data).digest('hex')
  const ref = { attachmentId, name: 'external.pdf', bytes: data.length }
  const ctx = new Context()
  ctx.provide('sessions', { get: (id: string) => ({ header: { cwd: workspace }, snapshotEvents: () => id === 'owner' ? [{ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'file', attachment: ref }] } }] : [] }) } as never)
  ctx.provide('attachments', { fileHostPath: () => external } as never)
  try {
    expect(await resolveMineruSource(ctx, 'owner', 'source.pdf')).toMatchObject({ filePath: local })
    await expect(resolveMineruSource(ctx, 'owner', external)).rejects.toThrow('工作区')
    await expect(resolveMineruSource(ctx, 'owner', '../external.pdf')).rejects.toThrow('工作区')
    expect(await resolveMineruSource(ctx, 'owner', attachmentId)).toMatchObject({ filePath: external })
    await expect(resolveMineruSource(ctx, 'other', attachmentId)).rejects.toThrow('当前会话')
    ref.bytes++
    await expect(resolveMineruSource(ctx, 'owner', attachmentId)).rejects.toThrow('完整性')
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
