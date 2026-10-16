import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { packageRuntime, resolveCommandDshHome } from './package-runtime.mjs'
process.env.DSH_HOME = resolveCommandDshHome()
const packaged = existsSync(resolve(import.meta.dirname, '../app.asar'))
const root = packaged ? resolve(import.meta.dirname, '../app.asar') : resolve(import.meta.dirname, '../..')
const entry = packaged ? join(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js') : join(root, 'deepseek-harness/apps/cli/lib/bin.js')
if (!packaged) await import('../build/register-output-resolution.mjs')
else {
  process.env.ZEROWALL_RUNTIME_ANCHOR ??= pathToFileURL(join(root, 'package.json')).href
  await import(pathToFileURL(join(root, 'runtime/runtime-esm-register.mjs')).href)
}
const { runCli } = await import(pathToFileURL(entry).href)
await runCli({ manageDesktopProfile: true, packageManager: packageRuntime() })
