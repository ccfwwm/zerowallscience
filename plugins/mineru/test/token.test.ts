import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULTS, ZeroWallMineruService } from '../src/host/index.js'

const environmentToken = process.env.MINERU_API_TOKEN

afterEach(() => {
  if (environmentToken === undefined) delete process.env.MINERU_API_TOKEN
  else process.env.MINERU_API_TOKEN = environmentToken
})

describe('MinerU credential resolution', () => {
  it('uses the hydrated MINERU_API_TOKEN when the secret vault has no value', async () => {
    process.env.MINERU_API_TOKEN = 'synthetic-official-token'
    const service = {
      config: () => DEFAULTS,
      secrets: { get: vi.fn(async () => undefined) },
    }

    await expect((ZeroWallMineruService.prototype as any).token.call(service)).resolves.toBe('synthetic-official-token')
  })

  it('prefers the local secret vault over the hydrated environment value', async () => {
    process.env.MINERU_API_TOKEN = 'synthetic-official-token'
    const service = {
      config: () => DEFAULTS,
      secrets: { get: vi.fn(async () => 'local-token') },
    }

    await expect((ZeroWallMineruService.prototype as any).token.call(service)).resolves.toBe('local-token')
  })
})
