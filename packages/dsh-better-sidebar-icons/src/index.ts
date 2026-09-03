/**
 * dsh-better-sidebar-icons — host half.
 *
 * Mounts the icon assets route (/dsh-better-sidebar-icons/icons/<name>.svg) that
 * serves the bundled vscode-icons SVG set to the browser overlay. The client
 * half (src/client) does the DOM work; this half only serves bytes, behind
 * the same browser-trust fence every DSH route applies.
 */
import { isTrustedApiRequest } from './trust-fence.ts'
import { registerIconsRoute } from './icons-route.ts'
import type { HostContext, SidebarHttpRequest } from './types.ts'

/** Services required before mounting: the webserver routes and the web
 *  runtime's trusted hosts (the fence's authority source). */
export const inject = ['webServer', 'webRuntime']

export function apply(ctx: HostContext): void {
  // The web runtime's bind-derived trust list (boot-sampled LAN literals
  // plus --trusted-host authorities) — the authoritative source the /api
  // gateway fence derives its list from.
  const fence = (req: SidebarHttpRequest): boolean => isTrustedApiRequest(req, ctx.webRuntime.trustedHosts)
  ctx.effect(
    () => registerIconsRoute(ctx, fence),
    'dsh-better-sidebar-icons: /dsh-better-sidebar-icons/icons asset route',
  )
}
