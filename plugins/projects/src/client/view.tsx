import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ProjectView } from './ProjectWorkbenchButton.js'
// Resolve the shared helper from source during the workspace build.  The
// packaged client bundle must contain this tiny helper rather than emitting a
// runtime workspace `require()` that the browser ModuleLoader cannot satisfy.
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'

export const inject = ['slots', 'remote', 'workspaces', 'remote.zerowallProjects']

export function apply(ctx: ClientContext): void {
  const remote = ctx.remote as any
  ctx.effect(() => {
    let disposed = false
    void (async () => {
      const projects = unwrapRemoteResult<ProjectView[]>('zerowall.projects.list', await remote.zerowallProjects.list())
      if (disposed) return
      await Promise.all(projects.map(async project => {
        const known = ctx.workspaces.list.getSnapshot().items
          .some(workspace => normalizedPath(workspace.path) === normalizedPath(project.rootPath))
        if (!known) await ctx.workspaces.create({ path: project.rootPath })
      }))
    })().catch(() => {})
    return () => { disposed = true }
  }, 'zerowall: restore project workspaces')

}

function normalizedPath(value: string): string {
  const normalized = value.replace(/[\\/]+$/u, '').replace(/\\/gu, '/')
  return navigator.userAgent.toLowerCase().includes('windows') ? normalized.toLowerCase() : normalized
}
