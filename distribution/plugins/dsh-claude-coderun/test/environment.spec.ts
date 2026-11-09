import { afterEach, describe, expect, it, vi } from 'vitest'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import { claudeEnvironmentOverlay } from '../src/host/environment.js'

afterEach(() => vi.unstubAllEnvs())

describe('private Claude environment across the Host subprocess seam', () => {
  it('removes inherited provider toggles, credential files and Node injection', () => {
    for (const [name, value] of Object.entries({
      NODE_OPTIONS: '--require=user-hook.js', NODE_PATH: '/user/modules',
      CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_USE_VERTEX: '1', CLAUDE_CODE_USE_FOUNDRY: '1',
      AWS_PROFILE: 'user-profile', GOOGLE_APPLICATION_CREDENTIALS: '/user/cloud.json',
    })) vi.stubEnv(name, value)
    const selected = { HOME: '/plugin/home', ANTHROPIC_API_KEY: 'temporary-route-key', ANTHROPIC_MODEL: 'selected-model' }
    const overlay = claudeEnvironmentOverlay(selected)
    const child = Object.fromEntries(Object.entries({ ...scrubbedParentEnv(), ...overlay }).filter(([, value]) => value !== undefined))
    expect(child).toEqual(selected)
    expect(overlay.NODE_OPTIONS).toBeUndefined()
    expect(Object.hasOwn(overlay, 'NODE_OPTIONS')).toBe(true)
  })

  it('retains Windows environment names with different casing', () => {
    if (process.platform !== 'win32') return
    vi.stubEnv('Path', 'parent-path')
    const overlay = claudeEnvironmentOverlay({ PATH: 'selected-path' })
    const entries = Object.entries(overlay).filter(([name]) => name.toUpperCase() === 'PATH')
    expect(entries).toEqual([['PATH', 'selected-path']])
  })
})
