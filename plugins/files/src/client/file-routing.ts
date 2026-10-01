import type { Context } from '@deepseek-ai/cordis'

// Keep this list aligned with DSH rc.2's native Office and Excel registrations.
export const NATIVE_OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'tsv'])
export function prefersNativeOffice(name: string): boolean {
  return NATIVE_OFFICE_EXTENSIONS.has(name.split('.').pop()?.toLowerCase() ?? '')
}
export function workspaceFileAddress(sessionId: string, path: string): string {
  return `dsh-resource://file/session/${encodeURIComponent(sessionId)}/${path.replaceAll('\\', '/').split('/').map(encodeURIComponent).join('/')}`
}
export function openNativeViewer(ctx: Context, address: string): void {
  // The native document container selects Office/Excel/PDF internally.
  const sidebar = ctx.get('sidebarRight') as { openResource(address: string, options: { kind: string }): void }
  sidebar.openResource(address, { kind: 'text' })
}
