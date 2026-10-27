import Module, { registerHooks } from 'node:module'
import { delimiter, dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { initialize, resolve } from './runtime-esm-loader.mjs'

// Persist compiled Host modules outside the immutable runtime. Node validates
// source bytes and its V8 version before reuse; this never skips file integrity
// or plugin health checks. An unwritable/disabled cache is only an optimization
// failure, so it must not prevent the Host from starting.
if (process.env.ZEROWALL_USER_DATA_DIR) {
  try {
    Module.enableCompileCache(join(process.env.ZEROWALL_USER_DATA_DIR, 'cache', 'host-compile'))
    // Node writes the cache during normal shutdown. flushCompileCache() is
    // synchronous: flushing the complete packaged Host when the workbench
    // becomes ready blocks all RPCs, including permissions and session/create.
    // A forced shutdown may lose this optional cache; foreground requests must
    // never wait for it to be persisted.
  } catch { /* Compile cache support is optional for non-desktop runtimes. */ }
}

const profileAnchor = process.env.ZEROWALL_PROFILE_ANCHOR ?? (process.env.DSH_HOME ? pathToFileURL(resolvePath(process.env.DSH_HOME, 'profiles/web/package.json')).href : undefined)
const dependenciesAnchor = profileAnchor ? pathToFileURL(join(dirname(fileURLToPath(profileAnchor)), 'node_modules/.zerowall-dependencies/package.json')).href : undefined
// Offline archives are installation supply. Runtime resolution uses the
// fixed active profile and the installation-owned DSH runtime exclusively.
if (profileAnchor || process.env.ZEROWALL_RUNTIME_ANCHOR) {
  process.env.NODE_PATH = [...new Set([
    ...[profileAnchor, dependenciesAnchor, process.env.ZEROWALL_RUNTIME_ANCHOR].filter(Boolean).map(anchor => join(dirname(fileURLToPath(anchor)), 'node_modules')),
    ...(process.env.NODE_PATH ?? '').split(delimiter),
  ].filter(Boolean))].join(delimiter)
  Module._initPaths()
}
initialize({ anchor: process.env.ZEROWALL_RUNTIME_ANCHOR, profileAnchor, dependenciesAnchor })
registerHooks({ resolve })
