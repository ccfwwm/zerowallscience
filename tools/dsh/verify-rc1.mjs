import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const source = resolve(root, 'dsh/source')
const expected = JSON.parse(await readFile(resolve(root, 'dsh/lock/upstream.json'), 'utf8'))
const allowedLocalAdaptations = new Set([
  'packages/bundle/base/cordis.patch.yml',
  'packages/client/runtime/src/client/contract/sessions-port.ts',
  'packages/client/runtime/src/client/workspaces/service.ts',
  'packages/client/runtime/tests/workspaces-service.client.spec.ts',
  'packages/client/connection/src/client/fixture.ts',
  'packages/client/ui-attachment/src/client/ComposerAttachments.tsx',
  'packages/client/ui-attachment/src/MessageImage.module.css',
  'packages/client/ui-attachment/src/MessageImage.tsx',
  'packages/client/ui-attachment/src/client/labels.ts',
  'packages/client/ui-attachment/tests/message-image.client.spec.tsx',
  'packages/client/ui-conversation/src/client/apply.ts',
  'packages/client/ui-conversation/src/client/chat/MessageItem.module.css',
  'packages/client/ui-conversation/src/client/chat/MessageItem.tsx',
  'packages/client/ui-conversation/src/client/contract/slots.ts',
  'packages/client/ui-conversation/src/client/locales.ts',
  'packages/client/ui-conversation/src/client/service.ts',
  'packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx',
  'packages/client/ui-conversation/src/client/skeleton/EmptyHero.tsx',
  'packages/client/ui-conversation/src/client/skeleton/InputBar.module.css',
  'packages/client/ui-conversation/src/client/skeleton/InputBar.tsx',
  'packages/client/ui-conversation/src/client/skeleton/PermissionSelect.tsx',
  'packages/client/ui-conversation/tests/input-bar.client.spec.tsx',
  'packages/client/ui-directory-picker-native/src/client/index.ts',
  'packages/client/ui-directory-picker-native/tests/client-flow.client.spec.tsx',
  'packages/client/ui-permission-presets/src/client/PermissionRow.tsx',
  'packages/client/ui-permission-presets/src/client/locales.ts',
  'packages/host/apiproxy/src/api-proxy.ts',
  'packages/host/apiproxy/src/api/index.ts',
  'packages/host/apiproxy/src/api/sessions.schema.ts',
  'packages/host/apiproxy/src/api/sessions.ts',
  'packages/host/apiproxy/src/fetch/client.ts',
  'packages/host/apiproxy/tests/api-proxy-models.spec.ts',
  'packages/host/apiproxy/tests/fetch-carrier.spec.ts',
  'packages/host/apiproxy/tests/rpc-schemas.spec.ts',
  'packages/host/directory-picker-native/src/win32-dialog-host.ts',
  'packages/llm/llm-pi-ai/src/adapter.ts',
  'packages/llm/llm/src/index.ts',
  'packages/boot/app-boot/src/profile.ts',
])
const manifest = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'))
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim()
const status = execFileSync('git', ['status', '--porcelain'], { cwd: source, encoding: 'utf8' }).trim()
if (manifest.version !== expected.version) throw new Error(`DSH version must be ${expected.version}, received ${manifest.version}`)
if (commit !== expected.commit) throw new Error(`DSH commit must be ${expected.commit}, received ${commit}`)
const dirtyPaths = status === '' ? [] : status.split(/\r?\n/).map(line => line.slice(2).trimStart()).filter(Boolean)
const unexpectedDirtyPaths = dirtyPaths.filter(path => !allowedLocalAdaptations.has(path))
if (unexpectedDirtyPaths.length > 0) {
  throw new Error(`dsh/source contains unexpected local changes: ${unexpectedDirtyPaths.join(', ')}`)
}
const upstreamBase = execFileSync('git', ['merge-base', 'HEAD', expected.upstreamCommit], { cwd: source, encoding: 'utf8' }).trim()
if (upstreamBase !== expected.upstreamCommit) throw new Error(`DSH must derive from upstream rc2 ${expected.upstreamCommit}; merge-base is ${upstreamBase}`)
console.log(`Verified DSH ${manifest.version} at ${commit}, based on upstream rc2 ${expected.upstreamCommit}.`)
