/** PPT project tools, bundled instructions, workbench, and recoverable workflows. */
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { SkillProvider } from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-office-to-pdf'
import { installPresentationWorkflow } from './workflow/presentation-workflow.js'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { PACKAGE_ROOT } from './root.js'
import { buildProjectDeck, renderProjectPreviews, saveProjectPptx, saveRawProjectPptx } from './core/lazy-export-pipeline.js'
import {
  ProjectError,
  editProject,
  loadProject,
  listProjectHistory,
  projectUndoState,
  readHistorySnapshot,
  redoProject,
  restoreProject,
  undoProject,
  writeExportReport
} from './core/project/store.js'
import { armLazyTools } from './lazy-tools.js'
import { registerCheckTool } from './tools/check.js'
import { registerCreateTool } from './tools/create.js'
import { registerEditTool } from './tools/edit.js'
import { registerExportTool } from './tools/export.js'
import { registerImportTool } from './tools/import.js'
import { registerOpenTool, type PptMakerHostBridge } from './tools/open.js'
import { registerPatchTool } from './tools/patch.js'
import { registerRedoTool } from './tools/redo.js'
import { registerRenderTool } from './tools/render.js'
import { registerThemesTool } from './tools/themes.js'
import { registerUndoTool } from './tools/undo.js'
import { workbenchTools } from './tools/workbench.js'

export const name = '@zerowall/dsh-pptcreate'
export const inject = ['tools', 'sessions', 'skills', 'webServer', 'officeToPdf', 'sessionProjections', 'systemPrompt']
export { PACKAGE_ROOT }

const SKILL_DIR = path.join(PACKAGE_ROOT, 'skills', 'ppt-maker')
const SKILL_FILE = path.join(SKILL_DIR, 'SKILL.md')

interface ApplyCtx {
  officeToPdf: Context['officeToPdf']
  tools?: Parameters<typeof registerCreateTool>[0]['tools']
  sessions?: Parameters<typeof registerCreateTool>[0]['sessions']
  webServer?: {
    register(spec: { kind: 'prefix'; path: string; handler: unknown }): () => void
  }
  logger?: { warn?: (message: string) => void }
  effect?: (fn: () => void | (() => void)) => void
  /** Cordis `ctx.get(name)`：懒取 inject 之外的可选服务（llm / attachments）。 */
  get?: (name: string) => unknown
  /** Cordis `ctx.provide(name, service)`：向协作插件暴露 PPT 工具预热入口。 */
  provide?: (name: string, service: unknown) => unknown
  /** Cordis 事件总线（懒展开用）：tools/result、session/event、session/created。 */
  on?: (event: string, handler: (...args: never[]) => void) => unknown
  /** Cordis `ctx.inject(deps, cb)`：服务到达回调（懒展开扫 sessions 用）。 */
  inject?: (deps: readonly string[], cb: (ctx: ApplyCtx) => void) => unknown
}

/* ------------------------------------------------------------------ *
 * webServer 路由 + 宿主 → 工具 backchannel
 *
 * The host routes live in `plugin/host/routes.mjs` (plain JS so DSH can run
 * them without a TS loader), but they take their core from this bundle via
 * `deps.core` so they never re-import `lib/index.js`. The bridge below is
 * the other half: it gives `ppt_open` / `ppt_import` a way to mark a project
 * as "please open in the panel" without either half importing the other.
 * ------------------------------------------------------------------ */

interface HostStoreModule {
  registerProject(sessionId: string, cwd: string, dir: string): { key: string; dir: string }
  requestOpen(sessionId: string, key: string): void
}

interface HostRoutesModule {
  API_PREFIX: string
  createApiHandler(deps: {
    resolveCwd(sessionId: string): string | null
    log?: (message: string) => void
    core: {
      loadProject: typeof loadProject
      editProject: typeof editProject
      undoProject: typeof undoProject
      redoProject: typeof redoProject
      projectUndoState: typeof projectUndoState
      listProjectHistory: typeof listProjectHistory
      readHistorySnapshot: typeof readHistorySnapshot
      restoreProject: typeof restoreProject
      buildProjectDeck: typeof buildProjectDeck
      saveProjectPptx: typeof saveProjectPptx
      saveRawProjectPptx: typeof saveRawProjectPptx
      renderProjectPreviews: typeof renderProjectPreviews
      writeExportReport: typeof writeExportReport
      ProjectError: typeof ProjectError
    }
    sessionStore?: HostStoreModule
    ocr?: (retry: boolean) => Promise<unknown>
  }): (req: unknown, res: unknown) => Promise<void>
}

function loadHostModules(): Promise<{ routes: HostRoutesModule; store: HostStoreModule }> {
  const routesUrl = pathToFileURL(path.join(PACKAGE_ROOT, 'plugin', 'host', 'routes.mjs')).href
  const storeUrl = pathToFileURL(path.join(PACKAGE_ROOT, 'plugin', 'host', 'store.mjs')).href
  return Promise.all([import(routesUrl), import(storeUrl)]).then(
    ([routes, store]) => ({ routes: routes as HostRoutesModule, store: store as HostStoreModule })
  )
}

function buildPptMakerBridge(store: HostStoreModule): PptMakerHostBridge {
  return {
    registerProject(sessionId, cwd, dir) {
      return store.registerProject(sessionId, cwd, dir)
    },
    requestOpen(sessionId, key) {
      store.requestOpen(sessionId, key)
    }
  }
}

function registerRoutes(ctx: ApplyCtx, routes: HostRoutesModule): void {
  if (typeof ctx.effect !== 'function') return
  ctx.effect(() => {
    const webServer = ctx.webServer
    if (!webServer || typeof webServer.register !== 'function') {
      ctx.logger?.warn?.('[@zerowall/dsh-pptcreate] webServer 不可用，右侧栏面板将无法读写工程')
      return undefined
    }
    const sessions = ctx.sessions
    const resolveCwd = (sessionId: string): string | null => {
      if (!sessions || typeof sessions.get !== 'function') return null
      const header = sessions.get(String(sessionId))?.header
      return typeof header?.cwd === 'string' ? header.cwd : null
    }
    const handler = routes.createApiHandler({
      ocr: async retry => {
        const management = ctx.get?.('zerowallPythonManagement') as { request(input: { action: string; requestId: string; confirm?: boolean }): Promise<unknown> } | undefined
        if (!management) throw new Error('Python dependency management is unavailable. Enable the Python plugin and restart.')
        if (retry) await management.request({ action: 'install_runtime', requestId: crypto.randomUUID(), confirm: true })
        return management.request({ action: 'status', requestId: crypto.randomUUID() })
      },
      resolveCwd,
      log: (message) => ctx.logger?.warn?.(`[@zerowall/dsh-pptcreate] ${message}`),
      core: {
        loadProject,
        editProject,
        undoProject,
        redoProject,
        projectUndoState,
        listProjectHistory,
        readHistorySnapshot,
        restoreProject,
        buildProjectDeck,
        saveProjectPptx,
        saveRawProjectPptx,
        renderProjectPreviews: (cwd, dir, options) => renderProjectPreviews(cwd, dir, { ...options, office: ctx.officeToPdf }),
        writeExportReport,
        ProjectError
      }
    })
    return webServer.register({ kind: 'prefix', path: routes.API_PREFIX, handler })
  })
}

function presentationSkill(): SkillProvider {
  const descriptor = { name: 'ppt-maker', description: 'Create, edit, reconstruct and review editable or image presentations.',
    provider: name, source: 'bundled' as const, metadata: { ownerPackage: name }, invocation: { modelInvocable: true, userInvocable: true }, rank: 100,
    locator: pathToFileURL(SKILL_FILE), path: SKILL_FILE, resourceBase: { kind: 'directory' as const, path: SKILL_DIR } }
  return { name, async list() { return [descriptor] }, async get(candidate) {
    if (candidate.provider !== name || candidate.name !== descriptor.name) return undefined
    return { ...descriptor, content: (await readFile(SKILL_FILE, 'utf8')).replace(/^---[\s\S]*?---\s*/, '') }
  } }
}

/** Mount the shared conversion consumer and recoverable workflows before exposing tools. */
export async function apply(ctx: Context): Promise<void> {
  const [modules] = await Promise.all([loadHostModules(), readFile(SKILL_FILE, 'utf8')]).catch((cause: unknown) => {
    throw new Error('PPT workbench resources could not be loaded. Reinstall the PPT plugin and restart ZeroWallScience.', { cause })
  })
  ctx.effect(() => ctx.skills.registerProvider(presentationSkill))
  await installPresentationWorkflow(ctx)
  applyProjectTools(ctx as ApplyCtx, modules)
}

function applyProjectTools(ctx: ApplyCtx, modules: { routes: HostRoutesModule; store: HostStoreModule }): void {
  const offs: Array<() => void> = []

  const bridge = buildPptMakerBridge(modules.store)
  const resolveBridge = (): PptMakerHostBridge => bridge

  if (ctx.tools) {
    const tools = ctx.webServer ? workbenchTools(
      { tools: ctx.tools, sessions: ctx.sessions },
      async () => bridge,
      (message) => ctx.logger?.warn?.(`[@zerowall/dsh-pptcreate] ${message}`)
    ) : ctx.tools
    /** 注册全部 11 个 ppt_* 工具，返回合并注销函数。懒展开触发时整组进场。
     *  任一工具注册失败：先注销本组已注册的工具，再把失败整体抛出——`armLazyTools`
     *  据此置 revealPending 并在下个轮次重试，而不是留下一张残缺的工具表。 */
    const registerToolSuite = (): (() => void) => {
      const suiteOffs: Array<() => void> = []
      const failures: string[] = []
      const disposeSuite = (): void => {
        for (const off of suiteOffs.splice(0)) {
          try {
            off()
          } catch {
            /* teardown must not throw */
          }
        }
      }
      for (const register of [
        registerCreateTool,
        registerThemesTool,
        registerEditTool,
        registerUndoTool,
        registerRedoTool,
        registerRenderTool,
        registerExportTool,
        registerCheckTool,
        // Reverse / open / patch tools (raw JSON-Schema; ppt_open and the
        // open=true path of ppt_import rely on the optional bridge).
        registerImportTool,
        registerOpenTool,
        registerPatchTool
      ]) {
        try {
          const off = register({
            tools,
            officeToPdf: ctx.officeToPdf,
            sessions: ctx.sessions,
            // llm / attachments 懒取：它们不在 inject 里（缺席会静默挂死 apply，
            // 见文件头注释），工具每次执行时才经 ctx.get() 现取；缺席由 ai.ts 降级。
            get llm() {
              return ctx.get?.('llm') as Parameters<typeof registerCheckTool>[0]['llm']
            },
            get attachments() {
              return ctx.get?.('attachments') as Parameters<typeof registerCheckTool>[0]['attachments']
            },
            // Keep this as a getter on the actual context object: spreading an
            // object containing a getter eagerly snapshots its undefined value.
            get pptMaker() {
              return resolveBridge()
            }
          })
          if (typeof off === 'function') suiteOffs.push(off)
        } catch (err) {
          const label = register.name || 'tool'
          ctx.logger?.warn?.(`[@zerowall/dsh-pptcreate] ${label} 注册失败: ${(err as Error).message}`)
          failures.push(`${label}: ${(err as Error).message}`)
        }
      }
      if (failures.length > 0) {
        disposeSuite()
        throw new Error(`${failures.length} 个工具注册失败：${failures.join('；')}`)
      }
      return disposeSuite
    }
    // 懒展开（browser-skill 同款）：常驻的只有技能目录行；模型 invoke "ppt-maker"
    // 技能成功后整组工具才进场。webServer 路由不进懒展开——工作台面板随时要用。
    const lazyTools = armLazyTools(ctx, registerToolSuite)
    ctx.provide?.('dshPptMakerTools', { ensureRegistered: lazyTools.ensureRegistered })
    offs.push(lazyTools)
  }

  registerRoutes(ctx, modules.routes)

  ctx.effect?.(() => () => {
    for (const off of offs.splice(0)) {
      try {
        off()
      } catch {
        /* teardown must not throw */
      }
    }
  })
}
