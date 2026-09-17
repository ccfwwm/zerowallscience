import { defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { standardDecoratorPlugin, vitestExecArgv } from '../../deepseek-harness/vitest.shared.ts'

// In this monorepo the built client packages are ModuleLoader scripts. Tests
// must use their source exports, matching the Harness's own source test lane.
const harness = resolve(import.meta.dirname, '../../deepseek-harness')
const config = ts.parseConfigFileTextToJson('tsconfig.base.json', readFileSync(resolve(harness, 'tsconfig.base.json'), 'utf8')).config
const alias = Object.entries(config.compilerOptions.paths as Record<string, string[]>)
  .filter(([name]) => !name.includes('*'))
  .map(([name, paths]) => ({ find: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), replacement: resolve(harness, paths[0]!) }))
export default defineConfig({
  plugins: [standardDecoratorPlugin()],
  resolve: { alias, dedupe: ['react', 'react-dom'] },
  test: { include: ['tests/attachments.client.spec.tsx'], execArgv: vitestExecArgv },
})
