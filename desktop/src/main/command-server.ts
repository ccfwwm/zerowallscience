import { createServer } from 'node:net'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

export interface ManagementRequest { operation: string; args: unknown[] }

/** Local CLI endpoint. The random token belongs to the current user profile. */
export async function startCommandServer(root: string, dispatch: (request: ManagementRequest) => Promise<unknown>): Promise<() => Promise<void>> {
  const token = randomUUID() + randomUUID()
  const address = process.platform === 'win32' ? `\\\\.\\pipe\\zerowall-${createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 24)}` : join(root, 'commands.sock')
  const receipt = join(root, 'command-endpoint.json')
  await mkdir(root, { recursive: true, mode: 0o700 })
  const server = createServer(socket => {
    let input = ''
    socket.setTimeout(30_000, () => socket.destroy())
    socket.on('data', chunk => {
      input += chunk.toString('utf8')
      if (input.length > 65536) { socket.destroy(); return }
      if (!input.includes('\n')) return
      socket.pause()
      socket.setTimeout(0)
      void (async () => {
        try {
          const request = JSON.parse(input.split('\n')[0]!) as ManagementRequest & { token?: string }
          if (typeof request.token !== 'string' || request.token.length !== token.length || !timingSafeEqual(Buffer.from(request.token), Buffer.from(token))) throw new Error('CLI authentication failed')
          if (!Array.isArray(request.args) || typeof request.operation !== 'string') throw new Error('Invalid CLI request')
          const result = await dispatch(request)
          socket.end(JSON.stringify({ ok: true, result }) + '\n')
        } catch { socket.end(JSON.stringify({ ok: false, error: 'Management operation failed; check the requested plugin and Desktop status.' }) + '\n') }
      })()
    })
  })
  await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(address, () => { server.off('error', reject); accept() }) })
  await writeFile(receipt, JSON.stringify({ address, token, pid: process.pid }), { mode: 0o600 })
  return async () => { await unlink(receipt).catch(() => undefined); await new Promise<void>(accept => server.close(() => accept())) }
}
