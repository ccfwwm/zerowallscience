import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { adaptSessionDelete } from '../../tools/packaging/adapt-session-delete.mjs'
import test from 'node:test'

test('rc.2 slot-based session menu offers deletion only through the desktop bridge', async () => {
 const original=await readFile(new URL('../../deepseek-harness/packages/client/ui-workspace/lib/client.js',import.meta.url),'utf8')
 const result=adaptSessionDelete(original)
 assert.equal(adaptSessionDelete(result),result)
 assert.match(result,/window\.zerowallDesktop\?\.deleteSession/)
 assert.match(result,/ZeroWallDeleteSessionMenuItem/)
 assert.match(result,/title: displayTitle, language: chinese \? "zh" : "en"/)
 assert.match(result,/id: "zerowall-delete-session"/)
 assert.match(result,/danger: true/)
 assert.match(result,/删除会话/)
 assert.match(result,/Delete session/)
 assert.throws(()=>adaptSessionDelete('changed upstream shape'),/Unrecognized/)
})
