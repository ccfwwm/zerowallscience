import Module, { registerHooks } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { delimiter, dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { initialize, resolve } from './runtime-esm-loader.mjs'

const profileAnchor = process.env.ZEROWALL_PROFILE_ANCHOR ?? (process.env.DSH_HOME ? pathToFileURL(resolvePath(process.env.DSH_HOME, 'profiles/web/package.json')).href : undefined)
let generationAnchor
if (profileAnchor && process.env.DSH_HOME && existsSync(fileURLToPath(profileAnchor))) {
  const manifest = JSON.parse(readFileSync(fileURLToPath(profileAnchor), 'utf8'))
  const generation = manifest.zerowall?.offlineGeneration
  if (/^[a-f0-9]{64}$/u.test(generation ?? '')) {
    const profileHome = resolvePath(dirname(fileURLToPath(profileAnchor)), '../..')
    const archive = join(profileHome, 'resources/offline', generation, 'profile-runtime.asar')
    if (existsSync(archive)) {
      generationAnchor = pathToFileURL(join(archive, 'package.json')).href
      process.env.NODE_PATH = [join(dirname(fileURLToPath(profileAnchor)), 'node_modules'), join(archive, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(delimiter)
      Module._initPaths()
    }
  }
}
if (process.env.ZEROWALL_RUNTIME_ANCHOR) {
  process.env.NODE_PATH = [...new Set([join(dirname(fileURLToPath(process.env.ZEROWALL_RUNTIME_ANCHOR)), 'node_modules'), ...(process.env.NODE_PATH ?? '').split(delimiter)].filter(Boolean))].join(delimiter)
  Module._initPaths()
}
initialize({ anchor: process.env.ZEROWALL_RUNTIME_ANCHOR, profileAnchor, generationAnchor })
registerHooks({ resolve })
