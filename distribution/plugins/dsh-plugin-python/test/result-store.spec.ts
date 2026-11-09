import { mkdtemp, rm, symlink, mkdir, writeFile } from 'node:fs/promises'
import { finished } from 'node:stream/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createPythonResult, readPythonResult } from '../src/host/result-store.js'
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
it('retains more than 1 MiB of complete output and pages Chinese without splitting UTF-8', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-output-')); roots.push(root)
  const store = await createPythonResult(root)
  const source = '头' + 'x'.repeat(1024 * 1024 + 40) + '完整结果'
  store.stdout.end(source); store.stderr.end('错误详情')
  await Promise.all([finished(store.stdout), finished(store.stderr)])
  await store.complete({ exitCode: 0, timedOut: false, python: 'Python/python.exe' })
  expect(await readPythonResult(root, store.id, 'stdout', 0, 2)).toMatchObject({ text: '头', next_offset: 3, total: Buffer.byteLength(source) })
  expect(await readPythonResult(root, store.id, 'stdout', Buffer.byteLength(source) - 12, 12)).toMatchObject({ text: '完整结果', next_offset: null })
  expect(await readPythonResult(root, store.id, 'stderr')).toMatchObject({ text: '错误详情' })
})
it('rejects a junction that redirects results outside the workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-output-')); const outside = await mkdtemp(join(tmpdir(), 'python-outside-')); roots.push(root, outside)
  await mkdir(join(root, '.zerowall'))
  await symlink(outside, join(root, '.zerowall/python-results'), process.platform === 'win32' ? 'junction' : 'dir')
  await expect(createPythonResult(root)).rejects.toThrow('PYTHON_RESULT_PATH')
})
