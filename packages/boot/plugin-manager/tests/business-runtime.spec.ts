/** Candidate graphs must use the installation's one runtime, even through nested packages. */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { configureBusinessRuntime, validateBusinessRuntime } from '../src/business-runtime.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture(dependencies: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'business-runtime-')); roots.push(root)
  const pkg = join(root, 'node_modules/feature'); mkdirSync(pkg, { recursive: true })
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ dependencies }))
  return { root, pkg }
}
const runtime = [{ name: 'react', version: '18.3.1', packageDir: '/runtime/react', declarer: '/runtime/package.json', scope: 'installation' as const }]
it('removes shared packages from candidate installation and accepts compatible original requirements', () => {
  const { root } = fixture({ react: '^18.2.0' })
  configureBusinessRuntime(root, runtime)
  expect(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')).toContain('"react":"-"')
  expect(() =>{  validateBusinessRuntime(root, runtime) }).not.toThrow()
})
it('requires a desktop upgrade before activating incompatible runtime dependencies', () => {
  const { root } = fixture({ react: '^19.0.0' })
  expect(() =>{  validateBusinessRuntime(root, runtime) }).toThrow('Upgrade the desktop application first')
})
it('refuses a protected dependency nested below another business dependency', () => {
  const { root, pkg } = fixture()
  mkdirSync(join(pkg, 'node_modules/react'), { recursive: true })
  expect(() =>{  validateBusinessRuntime(root, runtime) }).toThrow('protected runtime dependency: react')
})
