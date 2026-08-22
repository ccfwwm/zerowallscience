import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResearchStore } from '@zerowallscience/research-store'
import { RunManager, launchSpec, type RunLaunchSpec, type RunProcessAdapter } from '../src/host/manager.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'zerowall-runs-')); roots.push(root)
  const store = new ResearchStore(join(root, 'research.sqlite'))
  const project = store.createProject({ name: 'Run study', rootPath: join(root, 'project') })
  return { root, store, project }
}

class FakeAdapter implements RunProcessAdapter {
  alive = new Set<number>()
  launches: RunLaunchSpec[] = []
  cancelled: number[] = []
  paused: number[] = []
  resumed: number[] = []
  remoteAlive = new Set<string>()
  remoteCancelled: string[] = []
  remotePaused: string[] = []
  remoteResumed: string[] = []
  private nextPid = 100
  private exits = new Map<number, (value: { code: number | null; signal: string | null }) => void>()
  launch(spec: RunLaunchSpec) { const pid = this.nextPid++; this.launches.push(spec); this.alive.add(pid); return { pid, exited: new Promise<{ code: number | null; signal: string | null }>(resolve => this.exits.set(pid, resolve)) } }
  isAlive(pid: number) { return this.alive.has(pid) }
  async cancel(pid: number) { this.cancelled.push(pid); this.alive.delete(pid) }
  async pause(pid: number) { this.paused.push(pid) }
  async resume(pid: number) { this.resumed.push(pid) }
  async isRemoteAlive(_context: unknown, pid: string) { return this.remoteAlive.has(pid) }
  async cancelRemote(_context: unknown, pid: string) { this.remoteCancelled.push(pid); this.remoteAlive.delete(pid) }
  async pauseRemote(_context: unknown, pid: string) { this.remotePaused.push(pid) }
  async resumeRemote(_context: unknown, pid: string) { this.remoteResumed.push(pid) }
  exit(pid: number, code: number | null, signal: string | null = null) { this.alive.delete(pid); this.exits.get(pid)?.({ code, signal }) }
}

describe('RunManager', () => {
  it('persists launch state, log continuation, completion, projection, and artifact harvest', async () => {
    const { root, store, project } = fixture(); const adapter = new FakeAdapter(); const updates: string[] = []
    const manager = new RunManager(store, join(root, 'runs'), adapter, { update: run => updates.push(run.status) }, 'win32')
    const output = join(root, 'result.txt'); writeFileSync(output, 'result')
    const run = manager.submit({
      projectId: project.id, name: 'Compute', command: 'Write-Output ok', workingDirectory: root,
      inputs: [{ name: 'Samples', uri: 'file:///samples.csv', mediaType: 'text/csv' }],
      outputs: [{ name: 'Result', uri: `file:///${output.replaceAll('\\', '/')}`, mediaType: 'text/plain' }],
    })
    expect(run).toMatchObject({ status: 'running', pid: 100 })
    expect(run.inputs).toEqual([{ name: 'Samples', uri: 'file:///samples.csv', mediaType: 'text/csv' }])
    expect(adapter.launches[0]).toMatchObject({ executable: 'powershell.exe' })
    expect(manager.updateProgress(run.id, 0.5).progress).toBe(0.5)
    expect(manager.declareOutputs(run.id, run.outputs)).toMatchObject({ outputs: run.outputs })
    writeFileSync(adapter.launches[0]!.logPath, 'continued log')
    expect(manager.log(run.id)).toContain('continued log')
    adapter.exit(100, 0)
    await expect.poll(() => store.getRun(run.id)?.status).toBe('succeeded')
    expect(store.listArtifacts(project.id)).toEqual([expect.objectContaining({ runId: run.id, uri: expect.stringContaining('result.txt') })])
    expect(updates).toContain('succeeded')
    manager.dispose()
    store.close()
  })

  it('supports cancel, timeout, pause, resume, and restart recovery through an adapter', async () => {
    vi.useFakeTimers()
    const { root, store, project } = fixture(); const adapter = new FakeAdapter(); const manager = new RunManager(store, join(root, 'runs'), adapter)
    const context = store.createExecutionContext({ projectId: project.id, name: 'WSL', kind: 'wsl', config: { distro: 'Ubuntu' } })
    const run = manager.submit({ projectId: project.id, executionContextId: context.id, name: 'Long', command: 'sleep 10', workingDirectory: root })
    store.updateRun(run.id, { remotePid: '700' })
    adapter.remoteAlive.add('700')
    expect((await manager.pause(run.id)).status).toBe('paused')
    expect((await manager.resume(run.id)).status).toBe('running')
    expect((await manager.cancel(run.id)).status).toBe('cancelled')
    expect(adapter.cancelled).toContain(run.pid)
    expect(adapter.remotePaused).toContain('700')
    expect(adapter.remoteResumed).toContain('700')
    expect(adapter.remoteCancelled).toContain('700')

    const timed = manager.submit({ projectId: project.id, name: 'Timeout', command: 'sleep 10', workingDirectory: root, timeoutMs: 5 })
    await vi.advanceTimersByTimeAsync(10)
    expect(store.getRun(timed.id)?.status).toBe('timed_out')
    vi.useRealTimers()

    const detached = store.createRun({ projectId: project.id, name: 'Detached', command: 'job', workingDirectory: root, status: 'running', pid: 999 })
    adapter.alive.add(999)
    const recovering = new RunManager(store, join(root, 'runs'), adapter)
    const recovered = await recovering.recover()
    expect(recovered.find(item => item.id === detached.id)).toMatchObject({ status: 'running', pid: 999 })
    const lost = store.createRun({ projectId: project.id, name: 'Lost', command: 'job', workingDirectory: root, status: 'running', pid: 998 })
    const lostManager = new RunManager(store, join(root, 'runs'), adapter)
    expect((await lostManager.recover()).find(item => item.id === lost.id)?.status).toBe('failed')
    manager.dispose(); recovering.dispose(); lostManager.dispose()
    store.close()
  })

  it('discovers remote pids, renews leases, and recovers remote-only or completed runs', async () => {
    vi.useFakeTimers()
    const { root, store, project } = fixture(); const adapter = new FakeAdapter()
    const context = store.createExecutionContext({ projectId: project.id, name: 'SSH', kind: 'ssh', config: { host: 'gpu.test' } })
    const manager = new RunManager(store, join(root, 'runs'), adapter, undefined, 'win32', 5, 30)
    const launched = manager.submit({ projectId: project.id, executionContextId: context.id, name: 'Remote', command: 'sleep 10', workingDirectory: '/work', timeoutMs: 1000 })
    writeFileSync(adapter.launches[0]!.logPath, '__ZEROWALL_REMOTE_PID__=8123\n')
    await vi.advanceTimersByTimeAsync(6)
    expect(store.getRun(launched.id)).toMatchObject({ remotePid: '8123', leaseOwner: expect.any(String), timeoutAt: expect.any(String) })

    manager.dispose()
    adapter.alive.delete(launched.pid!)
    adapter.remoteAlive.add('8123')
    const remoteRecovery = new RunManager(store, join(root, 'runs'), adapter, undefined, 'win32', 5, 30)
    expect((await remoteRecovery.recover()).find(item => item.id === launched.id)).toMatchObject({ status: 'running', remotePid: '8123' })
    remoteRecovery.dispose()

    adapter.remoteAlive.delete('8123')
    writeFileSync(adapter.launches[0]!.logPath, '__ZEROWALL_REMOTE_PID__=8123\n__ZEROWALL_EXIT_CODE__=0\n')
    const completedRecovery = new RunManager(store, join(root, 'runs'), adapter)
    expect((await completedRecovery.recover()).find(item => item.id === launched.id)?.status).toBe('succeeded')
    completedRecovery.dispose(); vi.useRealTimers(); store.close()
  })

  it('builds explicit Local, WSL, SSH, Windows, and macOS launch specifications', () => {
    const common = { id: 'id', projectId: 'p', name: 'ctx', version: 1, createdAt: '', updatedAt: '' }
    expect(launchSpec(undefined, 'echo ok', 'C:/work', 'run.log', 'win32').executable).toBe('powershell.exe')
    expect(launchSpec(undefined, 'echo ok', '/work', 'run.log', 'darwin').executable).toBe('/bin/sh')
    expect(launchSpec({ ...common, kind: 'wsl', config: { distro: 'Ubuntu' } }, 'echo ok', '', 'run.log', 'win32')).toMatchObject({ executable: 'wsl.exe', args: expect.arrayContaining(['-d', 'Ubuntu', '--', 'sh', '-lc']) })
    expect(launchSpec({ ...common, kind: 'ssh', config: { host: 'gpu.test', user: 'alice', privateKeyPath: 'C:/keys/gpu' } }, 'echo ok', '', 'run.log', 'darwin')).toMatchObject({ executable: 'ssh', args: expect.arrayContaining(['-i', 'C:/keys/gpu', 'alice@gpu.test']) })
    expect(launchSpec({ ...common, kind: 'ssh', config: { host: 'gpu.test' } }, 'echo ok', '/work dir', 'run.log', 'darwin').args.at(-1)).toContain('__ZEROWALL_REMOTE_PID__=')
  })
})
