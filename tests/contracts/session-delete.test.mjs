import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { adaptSessionDelete } from '../../tools/packaging/adapt-session-delete.mjs'
import test from 'node:test'

test('curated session menu offers deletion only through the desktop confirmation bridge', async () => {
 const original=await readFile(new URL('../../deepseek-harness/packages/client/ui-workspace/lib/client.js',import.meta.url),'utf8')
 const result=adaptSessionDelete(original)
 assert.equal(adaptSessionDelete(result),result)
 assert.match(result,/window\.zerowallDesktop\?\.deleteSession/)
 assert.match(result,/sessionId: node\.id, title, language:/)
 assert.match(result,/danger: true/)
 assert.match(result,/删除会话/)
 assert.match(result,/Delete session/)
 assert.throws(()=>adaptSessionDelete('changed upstream shape'),/Unrecognized/)
})
