/**
 * Icon assets route tests (src/icons-route.ts): the
 * /dsh-better-sidebar-icons/icons handler that serves the explorer icon-theme
 * SVGs. Pins the trust fence, the svg filename allowlist (no traversal),
 * method gating, and the caching contract — ETag + If-None-Match 304 so
 * icon bytes revalidate cheaply.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createIconsRouteHandler } from '../src/icons-route.ts'
import type { SidebarHttpRequest } from '../src/types.ts'

const PREFIX = '/dsh-better-sidebar-icons/icons'

interface FakeRes {
  status: number
  headers: Record<string, string>
  body: string
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string | Buffer): void
}

function fakeRes(): FakeRes {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers = {}) {
      this.status = status
      this.headers = headers
    },
    end(body) {
      if (body !== undefined) this.body = body.toString()
    },
  } as FakeRes
}

function req(method: string, url: string, headers: Record<string, string> = {}): IncomingMessage {
  return { method, url, headers } as unknown as IncomingMessage
}

/** One handler instance over a scratch dir with one fake icon. */
function setup(fence: (req: SidebarHttpRequest) => boolean = () => true): { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>; dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'better-sidebar-icons-route-'))
  writeFileSync(join(dir, 'file_type_ts.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  const handler = createIconsRouteHandler(fence, dir)
  return { handler, dir, cleanup: () => { rmSync(dir, { recursive: true, force: true }) } }
}

describe('/dsh-better-sidebar-icons/icons route', () => {
  it('serves an allowlisted svg with the SVG content type and an ETag', async () => {
    const { handler, cleanup } = setup()
    try {
      const res = fakeRes()
      await handler(req('GET', `${PREFIX}/file_type_ts.svg`), res as unknown as ServerResponse)
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('image/svg+xml')
      expect(res.headers['cache-control']).toBe('no-cache')
      expect(res.headers.etag).toMatch(/^"[0-9a-f]{12}"$/)
      expect(res.body).toContain('<svg')
    } finally {
      cleanup()
    }
  })

  it('revalidates with a 304 when If-None-Match matches', async () => {
    const { handler, cleanup } = setup()
    try {
      const first = fakeRes()
      await handler(req('GET', `${PREFIX}/file_type_ts.svg`), first as unknown as ServerResponse)
      const etag = first.headers.etag!
      const second = fakeRes()
      await handler(req('GET', `${PREFIX}/file_type_ts.svg`, { 'if-none-match': etag }), second as unknown as ServerResponse)
      expect(second.status).toBe(304)
      expect(second.body).toBe('')
      expect(second.headers.etag).toBe(etag)
    } finally {
      cleanup()
    }
  })

  it('refuses cross-site requests through the trust fence (403)', async () => {
    const { handler, cleanup } = setup(() => false)
    try {
      const res = fakeRes()
      await handler(req('GET', `${PREFIX}/file_type_ts.svg`), res as unknown as ServerResponse)
      expect(res.status).toBe(403)
      expect(res.body).toBe('forbidden')
    } finally {
      cleanup()
    }
  })

  it('rejects traversal and unknown names (404)', async () => {
    const { handler, cleanup } = setup()
    try {
      for (const url of [
        `${PREFIX}/..%2f..%2fpackage.json`,
        `${PREFIX}/../secret.txt`,
        `${PREFIX}/no-such-icon.svg`,
        '/other/route/file_type_ts.svg',
        `${PREFIX}/`,
      ]) {
        const res = fakeRes()
        await handler(req('GET', url), res as unknown as ServerResponse)
        expect(res.status, url).toBe(404)
      }
    } finally {
      cleanup()
    }
  })

  it('gates methods: only GET and HEAD (405)', async () => {
    const { handler, cleanup } = setup()
    try {
      for (const method of ['POST', 'PUT', 'DELETE']) {
        const res = fakeRes()
        await handler(req(method, `${PREFIX}/file_type_ts.svg`), res as unknown as ServerResponse)
        expect(res.status, method).toBe(405)
      }
    } finally {
      cleanup()
    }
  })

  it('serves HEAD without a body', async () => {
    const { handler, cleanup } = setup()
    try {
      const res = fakeRes()
      await handler(req('HEAD', `${PREFIX}/file_type_ts.svg`), res as unknown as ServerResponse)
      expect(res.status).toBe(200)
      expect(res.body).toBe('')
    } finally {
      cleanup()
    }
  })
})
