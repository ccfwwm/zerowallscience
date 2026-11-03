import { describe, expect, it } from 'vitest'
import { DEFAULT_DESKTOP_APP_USER_MODEL_ID, resolveDesktopAppUserModelId } from '../src/app-user-model-id.ts'

describe('desktop Windows shell identity', () => {
  it('uses the packaged desktop app id', () => {
    expect(resolveDesktopAppUserModelId({ dshDesktopAppId: 'com.example.zerowall' })).toBe('com.example.zerowall')
  })

  it('falls back to the ZeroWall app id for missing or invalid metadata', () => {
    expect(resolveDesktopAppUserModelId(undefined)).toBe(DEFAULT_DESKTOP_APP_USER_MODEL_ID)
    expect(resolveDesktopAppUserModelId({ dshDesktopAppId: '../electron' })).toBe(DEFAULT_DESKTOP_APP_USER_MODEL_ID)
  })
})
