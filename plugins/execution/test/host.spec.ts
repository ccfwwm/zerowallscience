import { describe, expect, it } from 'vitest'
import { executionCommandSpec } from '../src/host/index.js'

const common = { id: 'ctx', projectId: 'project', name: 'Context', version: 1, createdAt: '', updatedAt: '' }

describe('Execution command specifications', () => {
  it('keeps Windows and macOS local execution explicit', () => {
    expect(executionCommandSpec(undefined, 'Write-Output ok', 'C:/work', 'win32')).toEqual({
      executable: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', 'Write-Output ok'], cwd: 'C:/work',
    })
    expect(executionCommandSpec(undefined, 'printf ok', '/work', 'darwin')).toEqual({ executable: '/bin/sh', args: ['-lc', 'printf ok'], cwd: '/work' })
  })

  it('builds WSL and SSH commands without embedding private key contents', () => {
    const wsl = executionCommandSpec({ ...common, kind: 'wsl' as const, config: { distro: 'Ubuntu' } }, 'python run.py', '/work dir', 'win32')
    expect(wsl).toMatchObject({ executable: 'wsl.exe', args: expect.arrayContaining(['-d', 'Ubuntu', '--', 'sh', '-lc']) })
    expect(wsl.args.at(-1)).toContain("cd '/work dir'")

    const ssh = executionCommandSpec({ ...common, kind: 'ssh' as const, config: { host: 'gpu.test', user: 'alice', port: 2222, privateKeyPath: 'C:/keys/gpu' } }, 'python run.py', '/srv/work', 'darwin')
    expect(ssh).toMatchObject({ executable: 'ssh', args: expect.arrayContaining(['-p', '2222', '-i', 'C:/keys/gpu', 'alice@gpu.test']) })
    expect(JSON.stringify(ssh)).not.toContain('BEGIN PRIVATE KEY')
  })
})
