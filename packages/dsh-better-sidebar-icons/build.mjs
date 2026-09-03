import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'

const require = createRequire(import.meta.url)
const tsdownDir = dirname(require.resolve('tsdown/package.json'))
const tsdownBin = join(tsdownDir, 'dist/run.mjs')
const typescriptBin = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc')

rmSync('lib', { recursive: true, force: true })
execSync(`node "${tsdownBin}"`, { stdio: 'inherit' })
execSync(`node "${typescriptBin}" -p tsconfig.build.json`, { stdio: 'inherit' })
