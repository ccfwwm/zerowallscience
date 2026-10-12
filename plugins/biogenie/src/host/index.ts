import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { ResearchStore } from '@zerowallscience/research-store'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { verifyBioPayload } from './payload.js'
import type {} from '../../../python/src/host/index.js'
type Json = null | string | number | boolean | Json[] | { [key: string]: Json }
type RunPython = (args: { code: string; description: string; timeoutMs?: number }, exec: ToolRunContext) => Promise<{ exitCode: number; timedOut: boolean; stdout: string; stderr: string; python: string }>

export function registerBioLocal(ctx: Context, runPython: RunPython, payloadRoot = fileURLToPath(new URL('../payload/', import.meta.url))): void {
  ctx.tools.register(defineTool({
    name: 'bio_local', description: 'BioGenie local sequence/file/analysis operations using managed Python. List and describe before running. Database lookup defaults to Bio Tools; dependencies use the application shared Python environment. Never installs automatically.',
    parameters: { action: { type: 'string', required: true, enum: ['list', 'describe', 'run'] }, operation: { type: 'string' }, arguments: { type: 'json' }, backend: { type: 'string', enum: ['biogenie'] }, confirm_remote_upload: { type: 'boolean' }, timeout_ms: { type: 'integer' } },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const payload = await verifyBioPayload(payloadRoot).catch(error => { throw new Error(`BIOGENIE_RESOURCE_INVALID: ${error instanceof Error ? error.message : String(error)}`) })
      if (args.action === 'list') return { ok: true, operations: payload.operations.map(({ description, parameters, ...item }) => item) }
      if (args.action === 'describe') {
        const operation = payload.operations.find(item => item.id === args.operation)
        if (!operation) throw new Error('BIOGENIE_UNKNOWN_OPERATION: use bio_local list.')
        return { ok: true, ...operation }
      }
      const workspace = exec.agent?.session.header.cwd
      if (!workspace) throw new Error('BIOGENIE_WORKSPACE_REQUIRED: select a workspace before execution.')
      const envelope = { ...args, arguments: args.arguments ?? {} }
      const code = [
        'import sys,os,json',
        `sys.path.insert(0,${JSON.stringify(join(payloadRoot, 'python'))})`,
        'from zerowall_bridge import main',
        `print(main(json.loads(${JSON.stringify(JSON.stringify(envelope))})))`,
      ].join('\n')
      const result = await runPython({ code, description: `BioGenie ${args.action} ${args.operation ?? ''}`, timeoutMs: args.timeout_ms ?? 120_000 }, exec).catch(error => {
        if (exec.signal.aborted) throw new Error('BIOGENIE_CANCELLED: 用户已取消操作。')
        throw error
      })
      exec.signal.throwIfAborted()
      if (result.timedOut) throw new Error('BIOGENIE_TIMEOUT: inspect artifacts before retrying.')
      if (result.exitCode !== 0) throw new Error(`BIOGENIE_EXECUTION_FAILED: ${result.stderr.slice(-4000)}`)
      let value: Record<string, Json>
      try { value = JSON.parse(result.stdout.trim()) } catch { throw new Error(`BioGenie returned an invalid response: ${result.stderr.slice(-2000)}`) }
      if (args.action === 'run') {
        const directory = join(workspace, '.zerowall', 'bio-runs'); await mkdir(directory, { recursive: true })
        const runId = randomUUID(); const path = join(directory, `${runId}.json`)
        await writeFile(path, JSON.stringify({ ...value, operation: args.operation, input_sha256: createHash('sha256').update(JSON.stringify(args.arguments ?? {})).digest('hex'), createdAt: new Date().toISOString() }, null, 2))
        const db = process.env.ZEROWALL_RESEARCH_DB
        if (db) {
          const store = new ResearchStore(db)
          try {
            const project = store.listProjects().find(item => resolve(item.rootPath) === resolve(workspace)) ?? store.createProject({ name: 'Bio analysis', rootPath: workspace })
            const run = store.createRun({ projectId: project.id, name: `BioGenie ${args.operation}`, command: 'bio_local', workingDirectory: workspace, status: 'submitted', leaseOwner: 'research-workflow' })
            store.updateRun(run.id, { status: 'running' })
            store.updateRun(run.id, { status: value.ok ? 'succeeded' : 'failed', progress: value.ok ? 1 : 0, outputs: [{ name: 'BioGenie result', uri: pathToFileURL(path).href, mediaType: 'application/json' }], ...(value.ok ? {} : { error: String(value.error) }) })
            value.task_id = run.id
          } finally { store.close() }
        }
        return { ...value, run_id: runId, log_artifact: path }
      }
      return value
    },
  }))
}

export const name = 'zerowall-biogenie'
export const inject = ['tools', 'zerowallPython']
export function apply(ctx: Context): void { registerBioLocal(ctx, (args, exec) => ctx.zerowallPython.run(args, exec)) }
export default { name, inject, apply }
