import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')

test('WeChat package is iLink-only and does not include puppet dependencies', async () => {
  const packageJson = await readFile(resolve(root, 'plugins/wechat/package.json'), 'utf8')
  const source = await readFile(resolve(root, 'plugins/wechat/src/host/index.ts'), 'utf8')
  assert.doesNotMatch(packageJson, /wechaty-puppet-(wechat4u|wcferry|wechat)/i)
  assert.match(source, /puppet !== 'ilink'|puppet: ilink/i)
})

test('WeChat credential implementation does not persist the legacy plaintext token', async () => {
  const source = await readFile(resolve(root, 'plugins/wechat/src/host/backend.ts'), 'utf8')
  const ilink = await readFile(resolve(root, 'plugins/wechat/src/host/ilink.ts'), 'utf8')
  assert.match(source, /SecretBrokerClient/)
  assert.match(source, /secureCredentialStore/)
  assert.match(source, /rm\(legacyFile/)
  assert.match(ilink, /token: false/)
})
