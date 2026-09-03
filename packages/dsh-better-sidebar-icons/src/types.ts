/**
 * Structural type faces this plugin uses from the host. These are plain
 * interface mirrors of the DSH surfaces the plugin consumes (webServer /
 * webRuntime / the request-response faces), so the plugin does not depend
 * on any @deepseek-ai/* package types at runtime — the host casts at the
 * few boundaries that need real Node types.
 */

/** The request face route handlers read (structural subset of node's
 *  IncomingMessage: the URL/method/header reads routes use). */
export interface SidebarHttpRequest {
  url?: string
  method?: string
  headers: Record<string, string | string[] | undefined>
  [Symbol.asyncIterator](): AsyncIterator<string | Uint8Array>
}

/** The response face route handlers write to (structural subset of node's
 *  ServerResponse: the status/header/body writes the routes use). */
export interface SidebarHttpResponse {
  statusCode: number
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string | Uint8Array): void
}

/** One named webserver route (mirror of the host-webserver WebRoute). */
export interface SidebarWebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: SidebarHttpRequest, res: SidebarHttpResponse) => void | Promise<void>
}

/** The webServer service face this plugin uses. */
export interface SidebarWebServer {
  register(route: SidebarWebRoute): () => void
}

/** The web runtime trust list (bind-derived; the same source the /api
 *  gateway fence derives from). */
export interface SidebarWebRuntime {
  trustedHosts: readonly string[]
}

/** The host plugin context face (cordis supplies these at runtime). */
export interface HostContext {
  webServer: SidebarWebServer
  webRuntime: SidebarWebRuntime
  effect(fn: () => void | (() => void), name?: string): void
}
