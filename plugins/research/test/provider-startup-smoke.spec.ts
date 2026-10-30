import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as Research from '../src/host/index.js'
import Pubmed from '../../pubmed/src/host/index.js'
import Mineru from '../../mineru/src/host/index.js'

let cleanup: (() => Promise<void>) | undefined
afterEach(async () => { await cleanup?.(); cleanup = undefined; vi.unstubAllEnvs() })

it('activates Research before its PubMed and MinerU consumers in a Headless Host', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-provider-startup-'))
  const workspace = join(root, 'workspace')
  await mkdir(workspace)
  vi.stubEnv('ZEROWALL_RESEARCH_DB', join(root, 'research.sqlite'))
  vi.stubEnv('DSH_HOME', join(root, 'dsh'))
  const ctx = new Context()
  cleanup = async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
  ctx.provide('settings', { describe: () => [], replace: async () => undefined } as any)
  ctx.provide('sessions', { get: () => undefined } as any)
  ctx.provide('attachments', {} as any)
  ctx.provide('zerowallFiles', {} as any)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(Research)
  expect(ctx.zerowallResearch).toBeDefined()
  await ctx.plugin(Pubmed)
  await ctx.plugin(Mineru)
  expect(ctx.zerowallPubmed).toBeDefined()
  expect(ctx.zerowallMineru).toBeDefined()
  expect(ctx.tools.get('research_study')).toBeUndefined()
  expect(ctx.tools.get('science_viewer')).toBeDefined()
  expect(ctx.tools.get('pubmed_search_papers')).toBeDefined()
  for (const name of ['mineru_activate', 'mineru_parse', 'mineru_batch_parse', 'mineru_task']) expect(ctx.tools.get(name)).toBeDefined()
})
