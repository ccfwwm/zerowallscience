import { fork, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer, type Socket } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

it.skipIf(process.platform !== 'win32')('authenticates the protected worker and rejects unsigned operations and automatic writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-protected-')), runtimeRoot = join(root, 'Python')
  const pipe = `\\\\.\\pipe\\zerowall-python-${randomUUID()}`, token = 'a'.repeat(64)
  let socket!: Socket, child: ChildProcess | undefined
  const queue: any[] = [], waiters: Array<(message: any) => void> = []
  const next = () => new Promise<any>((accept, reject) => {
    const timer = setTimeout(() => reject(new Error('Protected fixture response timeout')), 10_000)
    const received = (value: any) => { clearTimeout(timer); accept(value) }
    if (queue.length) received(queue.shift()); else waiters.push(received)
  })
  const server = createServer(client => {
    socket = client; let pending = ''
    client.setEncoding('utf8'); client.on('data', bytes => {
      pending += bytes
      for (;;) {
        const end = pending.indexOf('\n'); if (end < 0) return
        const message = JSON.parse(pending.slice(0, end)); pending = pending.slice(end + 1)
        if (message.type === 'activity' || message.type === 'status') continue
        const waiter = waiters.shift(); if (waiter) waiter(message); else queue.push(message)
      }
    })
    client.on('error', () => {})
  })
  try {
    await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(pipe, accept) })
    child = fork(resolve('..', 'plugins/python/src/worker/python-updater-worker.ts'), ['--protected-pipe', pipe], {
      execArgv: ['--import', 'tsx'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ZEROWALL_PROTECTED_CHANNEL_TOKEN: token, ZEROWALL_PROTECTED_RUNTIME_ROOT: runtimeRoot }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    })
    child.stderr?.resume()
    expect(await next()).toEqual({ token })
    socket.write(JSON.stringify({ type: 'configure', config: { root: join(runtimeRoot, '.zerowall'), runtimeRoot } }) + '\n')
    expect(await next()).toEqual({ type: 'configured', abi: 1 })
    for (const request of [
      { id: 'unsigned', scope: 'manager', method: 'installPythonPackage', args: ['evil'] },
      { id: 'automatic', scope: 'api', method: 'request', args: [{ action: 'sync', automatic: true, confirm: true }] },
    ]) {
      socket.write(JSON.stringify(request) + '\n')
      const response = await next()
      expect(response.id).toBe(request.id)
      expect(response.error).toContain(request.id === 'unsigned' ? 'PYTHON_PROTECTED_OPERATION_DENIED' : 'PYTHON_AUTHORIZATION_REQUIRED')
    }
  } finally {
    socket?.destroy()
    if (child && child.exitCode === null) { const exited = new Promise(accept => child!.once('exit', accept)); child.kill(); await exited }
    if (server.listening) await new Promise<void>(accept => server.close(() => accept()))
    await rm(root, { recursive: true, force: true, maxRetries: 5 })
  }
}, 30_000)
