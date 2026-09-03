/**
 * Icon assets route: serves the bundled file/folder icon SVGs
 * (/dsh-better-sidebar-icons/icons/<name>.svg) that the client overlay resolves
 * entries to (src/client/resolve-icon.ts maps a file/folder name to an icon
 * file basename, e.g. `file_type_typescript.svg`; this route serves bytes).
 *
 * Caching contract: static assets — `cache-control: no-cache` plus an ETag
 * (content hash, memoized per file by mtime/size) with If-None-Match 304
 * handling. The browser revalidates each fetch but avoids re-downloading
 * icon bytes that did not change. Same browser-trust fence as every other
 * DSH route; the file name must match the strict svg allowlist (no path
 * traversal, no query tricks).
 */
import { createHash } from 'node:crypto'
import { stat, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SidebarHttpRequest, SidebarHttpResponse } from './types.ts'

/** Directory of this host-half module (lib/ — icons/ sits one level up). */
const LIB_DIR = dirname(fileURLToPath(import.meta.url))

/** svg file name the route will serve: letters, digits, underscores, one dot. */
const ICON_FILE_RE = /^[a-z0-9_]+\.svg$/i

/** sha1 content hash shortened to 12 hex chars. */
function shortHash(input: string | Buffer): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 12)
}

interface IconEtag {
  mtimeMs: number
  size: number
  etag: string
}

/** ETag memo: recompute the content hash only when the file's stat changed. */
const etags = new Map<string, IconEtag>()

/**
 * The icon file's ETag (quoted hash), or undefined when the file is missing.
 * Hash is recomputed only when mtime/size changed (hashing per request is
 * wasteful for the multi-MB icon set).
 */
async function etagOf(name: string, iconsDir: string): Promise<string | undefined> {
  const path = join(iconsDir, name)
  const key = `${iconsDir}:${name}`
  try {
    const info = await stat(path)
    const memo = etags.get(key)
    if (memo !== undefined && memo.mtimeMs === info.mtimeMs && memo.size === info.size) {
      return memo.etag
    }
    const etag = `"${shortHash(await readFile(path))}"`
    etags.set(key, { mtimeMs: info.mtimeMs, size: info.size, etag })
    return etag
  } catch {
    return undefined
  }
}

/**
 * Build the /dsh-better-sidebar-icons/icons route handler. `fence` is the shared
 * browser-trust check every plugin route applies; `iconsDir` is the
 * directory the SVG assets live in (overridable for tests).
 */
export function createIconsRouteHandler(
  fence: (req: SidebarHttpRequest) => boolean,
  iconsDir: string = join(LIB_DIR, '..', 'icons'),
): (req: SidebarHttpRequest, res: SidebarHttpResponse) => Promise<void> {
  return async (req, res): Promise<void> => {
    if (!fence(req)) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
    const name = pathname.startsWith(ICON_ROUTE_PREFIX + '/')
      ? pathname.slice(ICON_ROUTE_PREFIX.length + 1)
      : undefined
    if (name === undefined || !ICON_FILE_RE.test(name)) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    const etag = await etagOf(name, iconsDir)
    if (etag === undefined) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    if (req.headers['if-none-match'] === etag) {
      // Revalidation hit: unchanged icon, no body.
      res.writeHead(304, { 'cache-control': 'no-cache', etag })
      res.end()
      return
    }
    try {
      const body = await readFile(join(iconsDir, name))
      res.writeHead(200, {
        'content-type': 'image/svg+xml',
        'cache-control': 'no-cache',
        etag,
        'x-content-type-options': 'nosniff',
      })
      // HEAD carries headers only (the real ServerResponse would drop the
      // body anyway; be explicit so fake responses observe the contract).
      if (req.method === 'HEAD') res.end()
      else res.end(body)
    } catch {
      // Read raced a delete/rebuild between the stat and the read.
      res.writeHead(404)
      res.end('not found')
    }
  }
}

/** The route prefix the client also builds URLs from (keep in sync with
 *  src/client/resolve-icon.ts ROUTE_BASE). */
export const ICON_ROUTE_PREFIX = '/dsh-better-sidebar-icons/icons'

/** Register the icon route (disposed with the fiber). */
export function registerIconsRoute(
  ctx: { webServer: { register(route: { kind: 'prefix'; path: string; handler: (req: SidebarHttpRequest, res: SidebarHttpResponse) => void | Promise<void> }): () => void } },
  fence: (req: SidebarHttpRequest) => boolean,
): () => void {
  return ctx.webServer.register({
    kind: 'prefix',
    path: ICON_ROUTE_PREFIX,
    handler: createIconsRouteHandler(fence),
  })
}
