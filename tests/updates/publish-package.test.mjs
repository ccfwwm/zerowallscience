import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { preparePublishPackage } from '../../tools/plugins/publish-package.mjs'

test('new plugin releases resolve current workspace sources instead of stale publish links', async () => {
  const source = await mkdtemp(join(tmpdir(), 'zws-publish-source-'))
  const dependency = '@zerowallscience/plugin-environment'
  const installed = join(source, 'node_modules', dependency)
  await mkdir(installed, { recursive: true })
  await writeFile(join(installed, 'package.json'), JSON.stringify({ name: dependency, version: '0.0.0-stale' }))
  await writeFile(join(source, 'package.json'), JSON.stringify({
    name: 'zws-publish-regression-fixture', version: '0.1.0', files: [],
    dependencies: { [dependency]: 'workspace:^' },
  }))
  const current = JSON.parse(await readFile(new URL('../../plugins/environment/package.json', import.meta.url), 'utf8'))
  const { publish } = await preparePublishPackage(source, join(source, 'publish'))
  assert.equal(publish.dependencies[dependency], current.version)
})
