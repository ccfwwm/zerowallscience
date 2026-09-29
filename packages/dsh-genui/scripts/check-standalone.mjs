import { readFile, stat } from 'node:fs/promises'

const bundlePath = new URL('../lib/assets/standalone-runtime.js', import.meta.url)
await stat(bundlePath)
const bundle = await readFile(bundlePath, 'utf8')
const required = ['genuiStandaloneKatex', 'data:font/woff2;base64,', '__GenuiStandalone__']
const missing = required.filter(value => !bundle.includes(value))
if (missing.length > 0) throw new Error(`standalone runtime is missing required content: ${missing.join(', ')}`)
const fontFallbacks = ['data:font/woff;base64,', 'data:font/ttf;base64,']
const embeddedFallbacks = fontFallbacks.filter(value => bundle.includes(value))
if (embeddedFallbacks.length > 0) throw new Error(`standalone runtime contains redundant font formats: ${embeddedFallbacks.join(', ')}`)
const forbidden = [
  'window.__ModuleLoader__',
  '/plugins/@changfenhuang/dsh-genui',
  'conversation.send',
  '@deepseek-ai/dsh-client-ui-primitives',
]
const found = forbidden.filter(value => bundle.includes(value))
if (found.length > 0) throw new Error(`standalone runtime contains forbidden host references: ${found.join(', ')}`)
console.log('standalone runtime bundle check passed')
