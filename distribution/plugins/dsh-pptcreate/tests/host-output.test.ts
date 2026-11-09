import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanHostOutput } from '../scripts/clean-host-output.mjs'

describe('Host output ownership', () => {
  it('removes stale entry/chunks while preserving the client, unknown files and directories', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ppt-host-output-'))
    try {
      for (const name of ['index.js', 'chunk-ABC234.js', 'chunk-OLD123.js', 'client.js', 'custom.js', 'chunk-not-owned.js']) {
        await writeFile(join(directory, name), name)
      }
      const nested = join(directory, 'chunk-DIRECTORY.js')
      await mkdir(nested)
      await writeFile(join(nested, 'index.js'), 'preserved nested file')

      expect(await cleanHostOutput(directory)).toEqual(['chunk-ABC234.js', 'chunk-OLD123.js', 'index.js'])
      expect((await readdir(directory)).sort()).toEqual(['chunk-DIRECTORY.js', 'chunk-not-owned.js', 'client.js', 'custom.js'])
      expect(await readFile(join(directory, 'client.js'), 'utf8')).toBe('client.js')
      expect(await readFile(join(nested, 'index.js'), 'utf8')).toBe('preserved nested file')
      expect(await cleanHostOutput(directory)).toEqual([])
      expect(await cleanHostOutput(join(directory, 'missing'))).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
