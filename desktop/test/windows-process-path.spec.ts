import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { windowsProcessPath } from '../src/main/windows-process-path.js'

it.skipIf(process.platform !== 'win32')('starts a real process with both executable and cwd beyond MAX_PATH', async () => {
  const root = await mkdtemp(join(tmpdir(), 'windows-process-long-path-'))
  try {
    const cwd = join(root, 'x'.repeat(220))
    const executable = join(cwd, 'node.exe')
    expect(cwd.length).toBeGreaterThanOrEqual(260)
    await mkdir(cwd)
    await copyFile(process.execPath, executable)
    const result = await promisify(execFile)(windowsProcessPath(executable),
      ['-e', 'console.log(JSON.stringify({executable:process.execPath,cwd:process.cwd(),result:42}))'],
      { cwd: windowsProcessPath(cwd), windowsHide: true, timeout: 20_000 })
    const value = JSON.parse(result.stdout)
    expect(value.result).toBe(42)
    expect(value.executable.replace(/^\\\\\?\\/u, '')).toBe(executable)
    // Windows may expose the cwd through its 8.3 alias. Compare the actual
    // directory identity instead of assuming one textual spelling.
    const expected = await stat(cwd)
    const actual = await stat(value.cwd)
    expect({ dev: actual.dev, ino: actual.ino }).toEqual({ dev: expected.dev, ino: expected.ino })
  } finally {
    expect(resolve(root).startsWith(resolve(tmpdir()) + '\\')).toBe(true)
    await rm(root, { recursive: true, force: true, maxRetries: 3 })
  }
})
