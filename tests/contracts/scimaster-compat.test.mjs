import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { patchSciMasterMcp, SCIMASTER_0315_MCP_PATCHED_SHA256, SCIMASTER_0315_MCP_SHA256 } from '../../tools/release/scimaster-compat.mjs'
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
  assert.ok([SCIMASTER_0315_MCP_SHA256, SCIMASTER_0315_MCP_PATCHED_SHA256].includes(createHash('sha256').update(source).digest('hex')))
  const patchedBytes = patchSciMasterMcp(source)
  const patched = patchedBytes.toString('utf8')
  assert.equal(createHash('sha256').update(patchedBytes).digest('hex'), SCIMASTER_0315_MCP_PATCHED_SHA256)
  assert.match(patched, /parsedYear/)
  assert.match(patched, /year: external_exports\.number\(\)\.optional\(\)/)
  assert.throws(() => patchSciMasterMcp(Buffer.from('not the pinned bundle')), /Unsupported SciMaster/)
})
