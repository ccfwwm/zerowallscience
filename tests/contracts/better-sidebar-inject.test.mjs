import assert from 'node:assert/strict'
import test from 'node:test'
import {
  adaptBetterSidebarClient,
  assertBetterSidebarConversationInjection,
} from '../../tools/packaging/adapt-better-sidebar.mjs'

const upstreamBundle = `
const conversation = ctx.get("conversation");
const inject = [
  "slots",
  "sessions",
  "connection",
  "workspaces",
  "locale",
  "modules"
];
`

test('adds conversation to the better-sidebar client injection declaration', () => {
  const adapted = adaptBetterSidebarClient(upstreamBundle)
  assert.match(adapted, /"slots",\s*"conversation",/u)
  assert.doesNotThrow(() => assertBetterSidebarConversationInjection(adapted))
})

test('better-sidebar adaptation is idempotent', () => {
  const once = adaptBetterSidebarClient(upstreamBundle)
  assert.equal(adaptBetterSidebarClient(once), once)
})

test('rejects a client bundle that accesses conversation without the known inject contract', () => {
  assert.throws(
    () => adaptBetterSidebarClient('const conversation = ctx.get("conversation");'),
    /Expected one dsh-better-sidebar client inject declaration/u,
  )
})
