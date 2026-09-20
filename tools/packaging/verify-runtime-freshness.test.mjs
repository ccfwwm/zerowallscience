import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { verifyRuntimeFreshness } from './verify-runtime-freshness.mjs'

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
    await put('.build/dsh/build-receipt.json', receipt)
    await put('.build/runtime/build-receipt.json', receipt)
    await put('plugins/retired/lib/client.js', 'ignored retired plugin without manifest')
    for (const base of ['plugins/mcp', '.build/runtime/node_modules/@zerowallscience/plugin-mcp']) {
      await put(`${base}/package.json`, { name: '@zerowallscience/plugin-mcp', version: '6.7.0' })
      await put(`${base}/zerowall.plugin.json`, {})
      await put(`${base}/lib/client.js`, 'current client')
    }
    assert.equal((await verifyRuntimeFreshness(root)).checked, 3)
    await put('.build/runtime/node_modules/@zerowallscience/plugin-mcp/lib/client.js', 'old client')
    await assert.rejects(verifyRuntimeFreshness(root), /Stale runtime:.*client.js/)
    await put('.build/runtime/node_modules/@zerowallscience/plugin-mcp/lib/client.js', 'current client')
    await put('.build/runtime/build-receipt.json', { ...receipt, commit: 'old-commit' })
    await assert.rejects(verifyRuntimeFreshness(root), /Stale Harness runtime/)
    await put('.build/runtime/build-receipt.json', receipt)
    await put('deepseek-harness/uncommitted.txt', 'source changed after building')
    await assert.rejects(verifyRuntimeFreshness(root), /Harness source changed/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
