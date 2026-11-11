import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { readHostRuntimeIdentity } from '../src/runtime-identity.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

it('reports bundled and external identity from the selected runtime descriptor', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runtime-identity-')); roots.push(root)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'desktop-runtime.json'), JSON.stringify({ release: { productVersion: '9.1.0', hostProtocolVersion: 4 } }))
  expect(await readHostRuntimeIdentity(root)).toEqual({ source: 'bundled', version: '9.1.0', protocolVersion: '4' })
  await writeFile(join(root, 'host-runtime.json'), JSON.stringify({ runtimeVersion: '9.1.1', hostProtocolVersion: '4' }))
  expect(await readHostRuntimeIdentity(root)).toEqual({ source: 'external', version: '9.1.1', protocolVersion: '4' })
  await writeFile(join(root, 'host-runtime.json'), '{')
  await expect(readHostRuntimeIdentity(root)).rejects.toThrow()
})
