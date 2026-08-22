import { register } from 'node:module'

register(new URL('./runtime-esm-loader.mjs', import.meta.url), {
  data: { anchor: process.env.ZEROWALL_RUNTIME_ANCHOR },
})
