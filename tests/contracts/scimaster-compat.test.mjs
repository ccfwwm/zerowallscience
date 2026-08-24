import assert from 'node:assert/strict'
import test from 'node:test'
import { patchSciMasterMcp, SCIMASTER_0315_MCP_SHA256 } from '../../tools/release/scimaster-compat.mjs'
import { access, readFile } from 'node:fs/promises'

test('SciMaster compatibility patch is guarded and normalizes year output', async (t) => {
  const sourceUrl = new URL('../../mcp-environment-staging/sci/dist/mcp.cjs', import.meta.url)
  try {
    await access(sourceUrl)
  } catch {
    t.skip('local upstream SciMaster bundle is intentionally excluded from source control')
    return
  }
  const source = await readFile(sourceUrl)
  assert.equal((await import('node:crypto')).createHash('sha256').update(source).digest('hex'), SCIMASTER_0315_MCP_SHA256)
  const patched = patchSciMasterMcp(source).toString('utf8')
  assert.match(patched, /parsedYear/)
  assert.match(patched, /year: external_exports\.number\(\)\.optional\(\)/)
  assert.throws(() => patchSciMasterMcp(Buffer.from('not the pinned bundle')), /Unsupported SciMaster/)
})
