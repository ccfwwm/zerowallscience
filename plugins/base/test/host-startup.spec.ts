import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { apply } from '../src/host/index.ts'

it('serves the brand route while fixed-root Workspace restoration is still pending', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-brand-start-'))
  const ctx = new Context()
  const routes: Array<{ path: string }> = []
  let finish!: () => void
  const restored = new Promise<void>(done => { finish = done })
  const create = vi.fn(async () => restored)
  vi.stubEnv('ZEROWALL_USER_DATA_DIR', root)
  vi.stubEnv('ZEROWALL_BRAND_ICON', join(root, 'icon.png'))
  try {
    await ctx.plugin(SystemPrompt, {})
    ctx.provide('webServer', { register: (route: { path: string }) => { routes.push(route) } } as never)
    ctx.provide('workspaceRegistry', { list: () => [], create } as never)
    const activating = apply(ctx)
    expect(routes.map(route => route.path)).toContain('/zerowall-icon.png')
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce())
    finish()
    await activating
  } finally {
    finish()
    vi.unstubAllEnvs()
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
