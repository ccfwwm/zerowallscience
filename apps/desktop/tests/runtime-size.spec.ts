import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { deduplicateRuntimeZod, runtimeSizeReport } from '../scripts/runtime-size.ts'

it('preserves Node resolution while removing identical same-version Zod copies', () => {
  const root = mkdtempSync(join(tmpdir(), 'runtime-dedupe-'))
  const modules = join(root, 'node_modules')
  const write = (directory: string, version: string, body = 'module.exports = {}') => {
    mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'zod', version, main: 'index.cjs' })); writeFileSync(join(directory, 'index.cjs'), body)
  }
  try {
    write(join(modules, 'zod'), '4.0.0')
    write(join(modules, 'same', 'node_modules', 'zod'), '4.0.0')
    write(join(modules, 'older', 'node_modules', 'zod'), '3.0.0')
    write(join(modules, 'modified', 'node_modules', 'zod'), '4.0.0', 'module.exports = { changed: true }')
    const removed = deduplicateRuntimeZod(modules)
    expect(removed).toHaveLength(1)
    expect(createRequire(join(modules, 'same', 'index.cjs')).resolve('zod')).toBe(join(modules, 'zod', 'index.cjs'))
    expect(existsSync(join(modules, 'older', 'node_modules', 'zod'))).toBe(true)
    expect(existsSync(join(modules, 'modified', 'node_modules', 'zod'))).toBe(true)
    const before = runtimeSizeReport(root)
    const path = join(modules, '@zerowall', 'dsh-pptcreate', 'scripts', 'models'); mkdirSync(path, { recursive: true }); writeFileSync(join(path, 'model.onnx'), 'forbidden payload')
    expect(() => runtimeSizeReport(root)).toThrow('must download after launch')
    expect(before.files).toBe(6)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
