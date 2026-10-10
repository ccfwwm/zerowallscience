import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')

test('Dream Skin adapted resource settings title follows the active Chinese or English locale', async () => {
  const manifest = JSON.parse(await readFile(resolve(root, 'desktop/node_modules/dsh-dream-skin/package.json'), 'utf8'))
  const client = await readFile(resolve(root, 'desktop/node_modules/dsh-dream-skin/lib/client.js'), 'utf8')
  const sources = JSON.parse(await readFile(resolve(root, 'config/integrations/upstream-sources.json'), 'utf8'))
  assert.equal(manifest.version, sources.dreamSkin.resourceVersion)

  const labelFor = (locale) => {
    const value = client.match(new RegExp(`const ${locale} = \\{\\s*"section\\.nav": "([^"]+)"`, 'u'))?.[1]
    assert.ok(value, `missing ${locale} appearance title`)
    return value
  }
  assert.equal(labelFor('zh'), '外观')
  assert.equal(labelFor('en'), 'Appearance')
  assert.match(client, /id: "dream-skin",\s*order: 10,\s*label: \(\) => localeT\("section\.nav"\)/u)
  assert.match(client, /NAV_ROW_LABELS\.some\(function \(item\) \{ return label\.indexOf\(item\) !== -1 \}\)/u)
})
