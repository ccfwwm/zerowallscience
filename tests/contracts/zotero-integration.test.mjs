import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { adaptZoteroCommand } from '../../tools/packaging/adapt-zotero.mjs'

const root = resolve(import.meta.dirname, '../..')
const read = path => readFile(resolve(root, path), 'utf8')

test('Zotero status command remains usable with the pinned commands API', async () => {
  const original = await read('desktop/node_modules/dsh-zotero/lib/command.js')
  const adapted = adaptZoteroCommand(original)
  assert.doesNotMatch(adapted, /CommandDefinitionId/u)
  assert.equal(adaptZoteroCommand(adapted), adapted)
  const { registerStatusCommand } = await import(`data:text/javascript;base64,${Buffer.from(adapted).toString('base64')}`)
  let command
  registerStatusCommand({ inject: (_names, mount) => mount({ commands: { register: value => { command = value } } }) }, {
    status: async () => ({ connected: false, diagnosis: 'Zotero is offline' }),
  })
  assert.equal(command.name, 'zotero')
  assert.equal((await command.handler({ rawInput: 'status' })).text, 'Zotero local API: not connected\nZotero is offline')
  assert.equal((await command.handler({ rawInput: 'unknown' })).kind, 'error')
  assert.throws(() => adaptZoteroCommand('CommandDefinitionId(unknown)'), /Unrecognized/u)
})

test('Zotero ships compiled entries and is mounted once in every profile', async () => {
  const desktop = JSON.parse(await read('desktop/package.json'))
  assert.equal(desktop.dependencies['dsh-zotero'], '0.8.4')
  assert.equal(desktop.dependencies['@fylar/dsh-fylar-office-editor'], undefined)
  const manifest = JSON.parse(await read('desktop/node_modules/dsh-zotero/package.json'))
  assert.equal(manifest.version, '0.8.4')
  assert.equal(manifest.license, 'MIT')
  for (const entry of ['lib/index.js', 'lib/client.js', 'LICENSE']) {
    assert.ok((await read(`desktop/node_modules/dsh-zotero/${entry}`)).length > 0)
  }
  for (const profile of ['development', 'preview', 'stable']) {
    const source = await read(`profiles/generated/${profile}.yml`)
    assert.equal((source.match(/'dsh-zotero'/gu) ?? []).length, 1)
    assert.match(source, /'dsh-progressive-tools'/u)
    assert.doesNotMatch(source, /fylar/iu)
  }
  const patch = await read('desktop/build/zerowall.patch.yml')
  assert.equal((patch.match(/name: 'dsh-zotero'/gu) ?? []).length, 1)
  assert.doesNotMatch(patch, /fylar/iu)
})
