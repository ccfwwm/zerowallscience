/** Confirms that the shipped browser module registers the package identity its Host asks the client to load. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

it('registers the scoped package name declared by the client module manifest', () => {
  const pluginRoot = new URL('../../../distribution/plugins/dsh-computer-use-win/', import.meta.url)
  const manifest = JSON.parse(readFileSync(new URL('package.json', pluginRoot), 'utf8')) as { name: string }
  const source = readFileSync(new URL('mcp/client.js', pluginRoot), 'utf8')
  const registered: { id: string }[] = []
  runInNewContext(source, { window: { __ModuleLoader__: { load: (module: { id: string }) => { registered.push(module) } } } })
  expect(registered).toHaveLength(1)
  expect(registered[0]?.id).toBe(manifest.name)
})
