import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { Readable } from 'node:stream'

export function publicIPv4(address: string): boolean {
  const p = address.split('.').map(Number)
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = p
  return a !== 0 && a !== 10 && a !== 127 && a! < 224
    && !(a === 100 && b! >= 64 && b! <= 127)
    && !(a === 169 && b === 254) && !(a === 172 && b! >= 16 && b! <= 31)
    && !(a === 192 && (b === 168 || b === 0 || b === 2))
    && !(a === 198 && (b === 18 || b === 19 || b === 51)) && !(a === 203 && b === 0)
}

/** Resolve once and pin the checked address to the TLS socket (no redirects). */
export async function externalArtifact(url: URL, signal: AbortSignal): Promise<Response> {
  const addresses = await lookup(url.hostname, { family: 4, all: true })
  if (!addresses.length || addresses.some(a => !publicIPv4(a.address))) throw new Error('MEDIA_UNSAFE_ARTIFACT_HOST')
  const address = addresses[0]!.address
  return new Promise((accept, reject) => {
    const req = request(url, { signal, lookup: (_host, options, callback) => {
      if (typeof options === 'object' && options.all) callback(null, [{ address, family: 4 }])
      else callback(null, address, 4)
    } }, response => {
      if (response.statusCode !== 200) { response.destroy(); reject(new Error(`MEDIA_DOWNLOAD_HTTP_${response.statusCode}`)); return }
      const headers = new Headers()
      for (const name of ['content-type', 'content-length']) if (typeof response.headers[name] === 'string') headers.set(name, response.headers[name])
      accept(new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, { status: 200, headers }))
    })
    req.once('error', () => reject(new Error('MEDIA_DOWNLOAD_NETWORK_ERROR')))
    req.end()
  })
}
