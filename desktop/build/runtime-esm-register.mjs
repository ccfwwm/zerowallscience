import { registerHooks } from 'node:module'
import { resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { initialize, resolve } from './runtime-esm-loader.mjs'

initialize({ anchor: process.env.ZEROWALL_RUNTIME_ANCHOR,
  profileAnchor: process.env.ZEROWALL_PROFILE_ANCHOR ?? (process.env.DSH_HOME ? pathToFileURL(resolvePath(process.env.DSH_HOME, 'profiles/web/package.json')).href : undefined),
})
registerHooks({ resolve })
