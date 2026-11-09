/** Public software distribution settings shared by packaging and publication. */
import { readFileSync } from 'node:fs'

const settings = JSON.parse(readFileSync(new URL('../config/zerowall-release.json', import.meta.url), 'utf8'))

/**
 * Resolve the isolated ZeroWall feed without loading storage credentials.
 * @param {NodeJS.ProcessEnv} env Release settings.
 * @param {NodeJS.Platform} platform Target platform.
 * @param {string} arch Target architecture.
 * @returns {object} Public generic-updater configuration and private setting names.
 */
export function resolveZeroWallReleaseConfig(env, platform, arch) {
  if (env.ZEROWALL_OFFICIAL_UNSIGNED === '1') {
    if (platform !== 'win32' || arch !== 'x64' || env.DSH_DESKTOP_APP_ID !== settings.stableAppId
      || env.DSH_DESKTOP_UPDATE_CHANNEL !== 'latest' || env.DSH_DESKTOP_AUTO_UPDATE_ENV !== 'production') throw new Error('ZeroWall stable release: explicit Windows x64 stable identity and channel are required')
    return { provider: 'qiniu', environment: 'production', channel: 'latest', target: 'win-x64', origin: settings.origin,
      keyPrefix: settings.stablePrefix, binaryKeyPrefix: `${settings.stablePrefix}/releases`, publicUrl: `${settings.origin}/${settings.stablePrefix}/`,
      bucket: env.QINIU_BUCKET || '', secretIdEnvName: 'QINIU_ACCESS_KEY', secretKeyEnvName: 'QINIU_SECRET_KEY' }
  }
  if (env.DSH_DESKTOP_APP_ID !== undefined && env.DSH_DESKTOP_APP_ID !== settings.appId) throw new Error('ZeroWall release: installation identity differs from newui')
  const target = `${platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : platform}-${arch}`
  if (!settings.targets.includes(target)) throw new Error('ZeroWall release: unsupported target')
  const channel = env.DSH_DESKTOP_UPDATE_CHANNEL || 'nightly'
  if (!['latest', 'nightly'].includes(channel)) throw new Error('ZeroWall release: invalid channel')
  const environment = env.DSH_DESKTOP_AUTO_UPDATE_ENV || (channel === 'latest' ? 'production' : 'test')
  if (!['test', 'production'].includes(environment)) throw new Error('ZeroWall release: invalid environment')
  if ((channel === 'latest') !== (environment === 'production')) throw new Error('ZeroWall release: channel and environment differ')
  const origin = new URL(env.ZEROWALL_DOWNLOAD_ORIGIN || settings.origin)
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
    || /(^|\.)deepseek\.com$/u.test(origin.hostname)) throw new Error('ZeroWall release: an isolated HTTPS origin is required')
  if (settings.prefix !== 'newui') throw new Error('ZeroWall release: the newui prefix is required')
  const keyPrefix = `${settings.prefix}/${channel === 'latest' ? 'stable' : 'preview'}/${target}`
  return {
    provider: 'qiniu', environment, channel, target, origin: origin.origin,
    keyPrefix, binaryKeyPrefix: `${settings.prefix}/releases`, publicUrl: `${origin.origin}/${keyPrefix}/`,
    bucket: env.QINIU_BUCKET || '', secretIdEnvName: 'QINIU_ACCESS_KEY', secretKeyEnvName: 'QINIU_SECRET_KEY',
  }
}
