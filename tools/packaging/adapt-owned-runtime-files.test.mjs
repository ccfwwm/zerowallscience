import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { ownedRuntimeEntries } from './adapt-owned-runtime-files.mjs'

test('runtime payload preserves declared workers without copying adjacent local models or tests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-declared-runtime-'))
  try {
    const source = join(root, 'source'), output = join(root, 'runtime')
    const files = { 'lib/index.js': 'export const ready = true', 'scripts/worker.py': 'print("ready")', 'scripts/helper.py': '# helper', 'scripts/models/candidate.onnx': 'local experiment', 'scripts/test_worker.py': '# test only' }
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(source, path)), { recursive: true })
      await writeFile(join(source, path), content)
    }
    for (const entry of ownedRuntimeEntries(['lib', 'scripts/worker.py', 'scripts/helper.py'])) {
      await mkdir(dirname(join(output, entry)), { recursive: true })
      await cp(join(source, entry), join(output, entry), { recursive: true })
    }
    assert.deepEqual((await readdir(join(output, 'scripts'))).sort(), ['helper.py', 'worker.py'])
    assert.equal(await readFile(join(output, 'lib/index.js'), 'utf8'), files['lib/index.js'])
    assert.equal(await readFile(join(source, 'scripts/models/candidate.onnx'), 'utf8'), 'local experiment')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('runtime selection retains directory patterns and rejects paths outside the package', () => {
  assert.deepEqual(ownedRuntimeEntries(['lib/**/*.js', 'lib', 'README.md', '!tests/**']), ['lib', 'README.md'])
  for (const path of ['../outside.py', 'scripts/../../outside.py', '/outside.py', 'C:\\outside.py']) assert.throws(() => ownedRuntimeEntries([path]), /Invalid runtime package path/u)
})
