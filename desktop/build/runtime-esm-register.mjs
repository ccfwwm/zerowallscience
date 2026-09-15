import { registerHooks } from 'node:module'
import { initialize, resolve } from './runtime-esm-loader.mjs'

initialize({ anchor: process.env.ZEROWALL_RUNTIME_ANCHOR })
registerHooks({ resolve })
