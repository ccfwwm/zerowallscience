import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** Match the desktop's existing Roaming/new LocalAppData policy without creating directories. */
export function resolveCommandUserData(env = process.env, userHome = homedir()) {
  if (env.ZEROWALL_USER_DATA_DIR?.trim()) return resolve(env.ZEROWALL_USER_DATA_DIR)
  const name = env.ZEROWALL_RELEASE_CHANNEL === 'preview' ? 'zerowall-science-preview' : 'zerowall-science'
  const roaming = join(env.APPDATA || join(userHome, 'AppData', 'Roaming'), name)
  try { if (statSync(roaming).isDirectory()) return roaming } catch { /* optional old profile */ }
  return join(env.LOCALAPPDATA || join(userHome, 'AppData', 'Local'), name)
}
export function resolveCommandDshHome(env = process.env, userHome = homedir()) {
  return env.DSH_HOME?.trim() ? resolve(env.DSH_HOME) : join(resolveCommandUserData(env, userHome), 'harness')
}

/** Every launcher uses the installation-owned pnpm, independent of PATH/npm_execpath. */
export function packageRuntime({ commandRoot = import.meta.dirname, executable = process.execPath, runAsNode = Boolean(process.versions.electron) } = {}) {
  const bundled = join(commandRoot, 'pnpm/bin/pnpm.cjs')
  const development = resolve(commandRoot, '../../deepseek-harness/apps/desktop/node_modules/pnpm/bin/pnpm.cjs')
  const pnpm = existsSync(bundled) ? bundled : development
  if (!existsSync(pnpm)) throw new Error('The installation-owned pnpm runtime is unavailable')
  return {
    command: executable,
    args: ['--expose-internals', join(commandRoot, 'pnpm-executor.mjs'), pnpm],
    env: { ...(runAsNode ? { ELECTRON_RUN_AS_NODE: '1' } : {}), ZEROWALL_PNPM_NODE: executable },
  }
}
