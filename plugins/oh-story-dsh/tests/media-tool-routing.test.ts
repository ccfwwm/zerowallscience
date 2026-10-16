import { readFile } from 'node:fs/promises'
import { expect, it, vi } from 'vitest'
import { MEDIA_CONVERSATION_PROMPT, validateMediaToolIds } from '../src/media-contract.js'
import { createMediaSkillProvider } from '../src/media-skill.js'

const studio = vi.hoisted(() => ({ scope: vi.fn(async () => ({ sessionId: 's1', projectId: 'session-s1' })), generate: vi.fn(async (_session: string, input: any) => ({ id: input.id, state: 'queued' })), call: vi.fn(async () => '{}'), importSource: vi.fn(async () => ({})) }))
vi.mock('../src/media-studio.js', () => ({
  defaultMediaProjectId: (sessionId: string) => 'session-' + sessionId,
  MediaStudioService: class { constructor() { return studio } },
}))
import { apply } from '../src/index.js'

async function fixture() {
  vi.clearAllMocks()
  const tools = new Map<string, any>(), prompts: any[] = []
  const jobs = { list: vi.fn(async () => [{ id: 'actual-job-0001', projectId: 'session-s1' }]), refresh: vi.fn(async (_scope: unknown, id: string) => ({ id, state: 'queued' })) }
  const context: any = { skills: { registerProvider: vi.fn() }, effect: vi.fn(), inject: (_keys: unknown, install: any) => install({ systemPrompt: { context: (value: any) => prompts.push(value) } }), tools: { register: (tool: any) => tools.set(tool.name, tool) }, zerowallMediaJobs: jobs }
  await apply(context)
  const exec: any = { agent: { session: { id: 's1' } }, callId: 'call-1' }
  return { tools, jobs, prompts, exec }
}

it('publishes consistent discovery routes for deck illustrations and independent media', async () => {
  const f = await fixture()
  expect(f.prompts[0].text).toBe(MEDIA_CONVERSATION_PROMPT)
  expect(f.prompts[0].text).toContain('加载 gpt-image-generator')
  expect(f.prompts[0].text).toContain('用户明确要求独立媒体项目、视频、音乐或宣传片时')
  const provider = createMediaSkillProvider(new URL('../knowledge/media-create', import.meta.url).pathname)
  const candidates = await provider.list()
  expect(candidates[0]?.description).toContain('PPT/PPTX、文档和报告配图使用 gpt-image-generator')
  const skill = await readFile(new URL('../knowledge/media-create/SKILL.md', import.meta.url), 'utf8')
  expect(skill).toContain('不为配图建立媒体项目')
  for (const name of ['media_job', 'media_project', 'media_import']) expect(f.tools.get(name).description).toContain('PPT/PPTX')
})

it('rejects invented titles, paths and short task IDs before creating projects or jobs', async () => {
  const f = await fixture()
  await expect(f.tools.get('media_project').execute({ action: 'read', project_id: '汇报 PPT' }, f.exec)).rejects.toThrow('请省略该字段')
  await expect(f.tools.get('media_import').execute({ path: 'image.png', project_id: 'media-projects/deck' }, f.exec)).rejects.toThrow('MEDIA_PROJECT_ID_INVALID')
  await expect(f.tools.get('media_job').execute({ action: 'status', id: 'job-1' }, f.exec)).rejects.toThrow('先用 media_job status')
  expect(studio.call).not.toHaveBeenCalled(); expect(studio.scope).not.toHaveBeenCalled(); expect(studio.importSource).not.toHaveBeenCalled(); expect(studio.generate).not.toHaveBeenCalled()
  expect(f.jobs.refresh).not.toHaveBeenCalled()
  expect(() => validateMediaToolIds({ project_id: '', id: 'actual-job-0001' })).toThrow('MEDIA_PROJECT_ID_INVALID')
})

it('recovers real media tasks without generating a replacement and still supports explicit media creation', async () => {
  const f = await fixture(), tool = f.tools.get('media_job')
  const list = await tool.execute({ action: 'status' }, f.exec)
  expect(JSON.parse(list.result)[0].id).toBe('actual-job-0001')
  await tool.execute({ action: 'collect', id: 'actual-job-0001' }, f.exec)
  expect(f.jobs.refresh).toHaveBeenCalledWith({ sessionId: 's1', projectId: 'session-s1' }, 'actual-job-0001')
  expect(studio.generate).not.toHaveBeenCalled()
  await tool.execute({ action: 'generate', kind: 'video', prompt: '独立宣传视频' }, f.exec)
  expect(studio.generate).toHaveBeenCalledWith('s1', expect.objectContaining({ kind: 'video', projectId: 'session-s1', id: expect.stringMatching(/^chat-[a-f0-9]{64}$/) }))
})
