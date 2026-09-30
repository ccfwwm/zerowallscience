import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const packaged = existsSync(resolve(import.meta.dirname, '../app.asar'))
const root = packaged ? resolve(import.meta.dirname, '../app.asar') : resolve(import.meta.dirname, '../..')
const entry = packaged ? join(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js') : join(root, 'deepseek-harness/apps/cli/lib/bin.js')
if (!packaged) await import('../build/register-output-resolution.mjs')
const { runCli } = await import(pathToFileURL(entry).href)
await runCli({ manageDesktopProfile: true, ...(packaged ? { packageManager: {
  command: process.execPath,
  args: ['--expose-internals', join(import.meta.dirname, 'pnpm/bin/pnpm.cjs')],
  env: { ELECTRON_RUN_AS_NODE: '1' },
} } : {}) })
