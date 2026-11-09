/** Source and materialized installations must expose the same explicit business update policy. */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { ZEROWALL_PROFILE_OVERRIDES } from '../src/default-plugins.ts'

it('matches the Desktop Host policy to the Science composition and excludes shared runtimes', () => {
  const host = JSON.parse(readFileSync(new URL('../../desktop-host/package.json', import.meta.url), 'utf8')) as { dsh: { installation: { profileOverrides: string[] } } }
  expect(host.dsh.installation.profileOverrides).toEqual(ZEROWALL_PROFILE_OVERRIDES)
  expect(ZEROWALL_PROFILE_OVERRIDES.every(name => name.startsWith('@zerowall/'))).toBe(true)
})
