import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { refreshTypertWorkspace } from './typert-workspace.mjs'

test('Typert aggregate discovers an independent plugin Host face without desktop registration', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-typert-workspace-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const put = async (path, value) => {
    const file = join(root, path)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(value))
  }
  await put('deepseek-harness/tsconfig.base.json', { compilerOptions: { paths: { '@deepseek-ai/example': ['packages/example/src/index.ts'] } } })
  await put('deepseek-harness/tsconfig.host.json', { references: [{ path: './packages/example' }] })
  await put('tsconfig.host.json', {
    compilerOptions: { paths: { '@zerowallscience/plugin-*': ['plugins/*/src/host/index.ts'] } },
    references: [{ path: './plugins/existing/tsconfig.host.json' }],
  })
  for (const [directory, name, exports] of [
    ['claude-code', '@zerowallscience/plugin-claude-code', { './typert': { default: './lib/typert.host.js' } }],
    ['no-remote', '@zerowallscience/plugin-no-remote', { '.': './src/index.ts' }],
    ['standalone', 'third-party-plugin', { './typert': { default: './lib/typert.host.js' } }],
  ]) {
    await put(`plugins/${directory}/package.json`, { name, exports })
    await put(`plugins/${directory}/tsconfig.host.json`, { files: [] })
  }
  await refreshTypertWorkspace(root)
  const first = await readFile(join(root, 'tsconfig.host.json'), 'utf8')
  const aggregate = JSON.parse(first)
  assert.deepEqual(aggregate.references, [
    { path: './deepseek-harness/packages/example' },
    { path: './plugins/existing/tsconfig.host.json' },
    { path: './plugins/claude-code/tsconfig.host.json' },
  ])
  assert.deepEqual(aggregate.compilerOptions.paths, {
    '@deepseek-ai/example': ['deepseek-harness/packages/example/src/index.ts'],
    '@zerowallscience/plugin-*': ['plugins/*/src/host/index.ts'],
  })
  await refreshTypertWorkspace(root)
  assert.equal(await readFile(join(root, 'tsconfig.host.json'), 'utf8'), first)
})
