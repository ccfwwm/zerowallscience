import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { verifyRuntimeFreshness } from './verify-runtime-freshness.mjs'
import { writeRuntimeIntegrity } from './runtime-integrity.mjs'

test('rejects stale plugin bytes and a different Harness build even when versions match', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-freshness-'))
  const put = async (path, value) => {
    const file = join(root, path)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value))
  }
  try {
    await mkdir(join(root, 'deepseek-harness'))
    const git = args => execFileSync('git', args, { cwd: join(root, 'deepseek-harness'), encoding: 'utf8' }).trim()
    git(['init', '-q'])
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'fixture'])
    const commit = git(['rev-parse', 'HEAD'])
    const receipt = { commit, version: '0.1.5-rc.2', applicationVersion: '6.7.0', builtAt: '2026-09-20' }
    await put('package.json', { version: '6.7.0' })
    await put('config/deepseek-harness/upstream.json', { commit, version: receipt.version })
    await put('artifacts/stage/6.7.0/6.7.0-dev/dsh/build-receipt.json', receipt)
    await put('artifacts/stage/6.7.0/6.7.0-dev/runtime/build-receipt.json', receipt)
    await put('plugins/retired/lib/client.js', 'ignored retired plugin without manifest')
    for (const base of ['plugins/mcp', 'artifacts/stage/6.7.0/6.7.0-dev/runtime/node_modules/@zerowallscience/plugin-mcp']) {
      await put(`${base}/package.json`, { name: '@zerowallscience/plugin-mcp', version: '0.1.0', zerowall: { desktop: { min: '6.7.0' } } })
      await put(`${base}/zerowall.plugin.json`, {})
      await put(`${base}/lib/client.js`, 'current client')
    }
    const stage = join(root, 'artifacts/stage/6.7.0/6.7.0-dev')
    await put('resources/skills/example/SKILL.md', 'source skill')
    await put('artifacts/stage/6.7.0/6.7.0-dev/resources/skills/example/SKILL.md', 'source skill')
    for (const id of ['@deepseek-ai/libreoffice-kit', '@deepseek-ai/libreoffice-kit-win32-x64', '@deepseek-ai/dsh-client-ui-sidebar-documentpreview', 'dsh-univer-office']) await put(`artifacts/stage/6.7.0/6.7.0-dev/runtime/node_modules/${id}/runtime.js`, 'reviewed resource')
    await writeRuntimeIntegrity(root, stage)
    assert.equal((await verifyRuntimeFreshness(root)).checked, 3)
    await put('artifacts/stage/6.7.0/6.7.0-dev/runtime/node_modules/@deepseek-ai/libreoffice-kit/runtime.js', 'stale native resource')
    await assert.rejects(verifyRuntimeFreshness(root), /Office resources/)
    await put('artifacts/stage/6.7.0/6.7.0-dev/runtime/node_modules/@deepseek-ai/libreoffice-kit/runtime.js', 'reviewed resource')
    await put('artifacts/stage/6.7.0/6.7.0-dev/runtime/node_modules/@zerowallscience/plugin-mcp/lib/client.js', 'old client')
    await assert.rejects(verifyRuntimeFreshness(root), /Stale runtime:.*client.js/)
    await put('artifacts/stage/6.7.0/6.7.0-dev/runtime/node_modules/@zerowallscience/plugin-mcp/lib/client.js', 'current client')
    await put('artifacts/stage/6.7.0/6.7.0-dev/runtime/build-receipt.json', { ...receipt, commit: 'old-commit' })
    await assert.rejects(verifyRuntimeFreshness(root), /Stale Harness runtime/)
    await put('artifacts/stage/6.7.0/6.7.0-dev/runtime/build-receipt.json', receipt)
    await put('deepseek-harness/uncommitted.txt', 'source changed after building')
    await assert.rejects(verifyRuntimeFreshness(root), /Harness source changed/)
    assert.equal((await verifyRuntimeFreshness(root, { allowDirty: true })).checked, 3)
  } finally { await rm(root, { recursive: true, force: true }) }
})
