import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { resolveProjectDir } from '../core/project/store.js'
import type { PptMakerHostBridge } from './open.js'
import { resolveSessionCwd, sessionIdOf, type PluginToolCtx, type ToolDef } from './shared.js'

/** The workbench is a projection of successful project work, never a prerequisite for it. */
export function workbenchTools(
  ctx: PluginToolCtx,
  bridge: () => Promise<PptMakerHostBridge>,
  warn: (message: string) => void = () => {}
): PluginToolCtx['tools'] {
  const opened = new Map<string, string>()
  const bind = async (exec: unknown, dir: string, force = false): Promise<void> => {
    const cwd = resolveSessionCwd(exec, ctx.sessions)
    const abs = resolveProjectDir(cwd, dir)
    const manifest = JSON.parse(await readFile(path.join(abs, 'manifest.json'), 'utf8')) as { revision?: unknown }
    if (typeof manifest.revision !== 'number') return
    let sessionId = sessionIdOf(exec)!
    const visited = new Set<string>()
    // Subagent work belongs to the visible parent conversation as well. A normal
    // user-created fork has parentSession too; it must keep its own workbench.
    const targets: Array<{ id: string; cwd: string }> = []
    while (!visited.has(sessionId)) {
      visited.add(sessionId)
      const header = ctx.sessions?.get(sessionId)?.header
      if (typeof header?.cwd !== 'string') break
      const rel = path.relative(header.cwd, abs)
      if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) break
      targets.push({ id: sessionId, cwd: header.cwd })
      if (header.origin !== 'subagent' || typeof header.parentSession !== 'string' || !header.parentSession) break
      sessionId = header.parentSession
    }
    const host = await bridge()
    for (const target of targets) {
      const rel = path.relative(target.cwd, abs).replace(/\\/g, '/') || '.'
      if (!force && opened.get(target.id) === abs) continue
      const { key } = host.registerProject(target.id, target.cwd, rel)
      host.requestOpen(target.id, key)
      opened.set(target.id, abs)
    }
  }
  const safelyBind = async (exec: unknown, dir: string, force = false) => {
    try {
      await bind(exec, dir, force)
    } catch (error) {
      warn(`工作台工程关联失败: ${(error as Error).message}`)
    }
  }
  return {
    register(def: ToolDef) {
      return ctx.tools.register({
        ...def,
        async execute(args, exec) {
          // Their own result includes requested/open semantics. Wait for module
          // initialization rather than relying on apply()'s warm-up microtask.
          if (def.name === 'ppt_open' || def.name === 'ppt_import') {
            try { await bridge() } catch (error) { warn(`工作台服务尚未就绪: ${(error as Error).message}`) }
          }
          // Existing projects become visible before an expensive check/render/export.
          const dir = typeof args.dir === 'string' ? args.dir : null
          if (dir && def.name !== 'ppt_create' && def.name !== 'ppt_open') await safelyBind(exec, dir)
          const result = await def.execute(args, exec)
          if ((result as { ok?: unknown } | null)?.ok === true) {
            if (def.name === 'ppt_import' && args.open !== false) {
              const projectDir = (result as { projectDir?: unknown }).projectDir
              if (typeof projectDir === 'string') await safelyBind(exec, projectDir, true)
            } else if (dir && (def.name === 'ppt_create' || def.name === 'ppt_open')) {
              await safelyBind(exec, dir, def.name === 'ppt_open')
            }
          }
          return result
        }
      })
    }
  }
}
