import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { adaptConversationClient } from '../../tools/packaging/adapt-conversation.mjs'

test('conversation adapter accepts the pinned shell and fails on drift', async () => {
  const source = await readFile(new URL('../../deepseek-harness/packages/client/ui-conversation/lib/client.js', import.meta.url), 'utf8')
  const adapted = adaptConversationClient(source)
  assert.equal(adaptConversationClient(adapted), adapted)
  assert.match(adapted, /data-conversation-view/u)
  assert.match(adapted, /data-conversation-tab/u)
  assert.throws(() => adaptConversationClient('unknown shell'), /Unrecognized/u)
})
