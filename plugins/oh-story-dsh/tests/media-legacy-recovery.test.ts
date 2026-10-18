import { Context } from '@deepseek-ai/cordis'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { MediaJobLedger } from '../../ai-cloud/src/host/media-jobs.js'
import { MediaStudioService, defaultMediaProjectId } from '../src/media-studio.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
it.each(['query', 'download'])('returns from legacy recovery during a hanging %s, permits another session and stops/resumes the original task', async phase => {
  const cwd = await mkdtemp(join(tmpdir(), 'media-legacy-')); roots.push(cwd)
  const ctx = new Context(), scope = { sessionId: 'legacy-session', cwd, projectId: defaultMediaProjectId('legacy-session') }
  ctx.provide('typert', { lookups: new Map([['agent', { resolve: async () => ({ session: { header: { cwd } }, ctx: { get: (key: string) => key === 'fs' ? { processPathFromHostPath: (path: string) => path } : { resolve: () => ({ mode: 'workspace-write' }) } } }) }]]) } as never)
  const history = { requestId: 'original-request-0001', taskId: 'mt_original', selection: { groupId: '99', profileId: 'old-profile', modelId: 'old-model', operation: 'video' }, status: 'completed', artifacts: [{ key: 'video1', mediaType: 'video/mp4' }] }
  const bytes = Buffer.from('unchanged original bytes')
  const media = { list: vi.fn(async () => [history]), query: vi.fn(async () => history), download: vi.fn(async () => ({ bytes, mediaType: 'video/mp4', sha256: createHash('sha256').update(bytes).digest('hex') })), submit: vi.fn(), estimate: vi.fn() }
  if (phase === 'query') media.query.mockImplementationOnce(() => new Promise(() => {}))
  else media.download.mockImplementationOnce(() => new Promise(() => {}))
  const ledger = new MediaJobLedger(media as any, async () => 'trusted-account', join(cwd, 'ledger'),{autoCollect:false})
  ctx.provide('zerowallMedia', media as never); ctx.provide('zerowallMediaJobs', ledger as never)
  const studio = new MediaStudioService(ctx)
  const call = async (sessionId: string, action: string, input: unknown = {}) => JSON.parse(await studio.call(sessionId, action, JSON.stringify(input)))
  try {
    const input = { requestId: history.requestId, taskId: 'mt_forged', selection: { modelId: 'forged' }, owner: 'forged', url: 'https://untrusted.test/task' }
    const recovered = await call(scope.sessionId, 'legacy-recover', input)
    expect(recovered).toMatchObject({ requestId: history.requestId, taskId: history.taskId, selection: history.selection })
    await vi.waitFor(() => expect(phase === 'query' ? media.query : media.download).toHaveBeenCalled())
    expect((await call('another-session', 'create')).sessionId).toBe('another-session')
    await expect(call('another-session', 'pause', { projectId: scope.projectId, id: recovered.id })).rejects.toThrow('OWNER_MISMATCH')
    expect((await call(scope.sessionId, 'pause', { id: recovered.id })).collection).toBe('paused')
    const pausedQueries = media.query.mock.calls.length
    expect((await call(scope.sessionId, 'refresh', { id: recovered.id, automatic: true })).collection).toBe('paused')
    expect(media.query).toHaveBeenCalledTimes(pausedQueries)
    const resumed = await call(scope.sessionId, 'legacy-recover', { requestId: history.requestId })
    expect(resumed.id).toBe(recovered.id)
    await vi.waitFor(async () => expect((await call(scope.sessionId, 'list')).jobs[0]?.collection).toBe('ready'))
    const final = (await call(scope.sessionId, 'list')).jobs[0]
    expect(await readFile(join(cwd, final.assets[0].path))).toEqual(bytes)
    expect(final).toMatchObject({ requestId: history.requestId, taskId: history.taskId })
    expect(await call(scope.sessionId, 'list')).toMatchObject({ jobs: [expect.objectContaining({ id: recovered.id })] })
    expect(media.submit).not.toHaveBeenCalled(); expect(media.estimate).not.toHaveBeenCalled()
  } finally { await ctx.fiber.dispose() }
})
