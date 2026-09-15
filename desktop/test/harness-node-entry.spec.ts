import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

const execute = promisify(execFile)

it('invokes the imported CLI once with the forwarded profile arguments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-cli-entry-'))
  try {
    const entry = join(root, 'cli.mjs')
    await writeFile(entry, `
      export async function runCli() {
        console.log(JSON.stringify({ args: process.argv.slice(2), main: import.meta.main }));
      }
      if (import.meta.main) await runCli();
    `)
    const { stdout } = await execute(process.execPath, [
      resolve('build/harness-node-entry.mjs'), entry, 'web', '--port', '43127',
    ], { windowsHide: true })
    expect(JSON.parse(stdout.trim())).toEqual({ args: ['web', '--port', '43127'], main: false })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
