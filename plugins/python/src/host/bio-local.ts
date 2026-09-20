import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { ResearchStore } from '@zerowallscience/research-store'
import { pathToFileURL } from 'node:url'
type Json = null | string | number | boolean | Json[] | { [key: string]: Json }
type RunPython = (args: { code: string; description: string; timeoutMs?: number }, exec: ToolRunContext) => Promise<{ exitCode: number; timedOut: boolean; stdout: string; stderr: string; python: string }>

export function registerBioLocal(ctx: Context, runPython: RunPython): void {
  ctx.tools.register(defineTool({
    name: 'bio_local', description: 'BioGenie local sequence/file/analysis operations using managed Python. List and describe before running. Database lookup defaults to Bio Tools; conflicting packages use isolated dependency profiles. Never installs automatically.',
    parameters: { action: { type: 'string', required: true, enum: ['list', 'describe', 'run'] }, operation: { type: 'string' }, arguments: { type: 'json' }, backend: { type: 'string', enum: ['biogenie'] }, confirm_remote_upload: { type: 'boolean' }, timeout_ms: { type: 'integer' } },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const payloadRoot = process.env.ZEROWALL_BIOGENIE_ROOT
      const workspace = exec.agent?.session.header.cwd
      if (!payloadRoot || !workspace) throw new Error('BioGenie requires the bundled payload and an active workspace.')
      const profile = ['sbol_write', 'sbol_read'].includes(args.operation ?? '') ? 'sbol' : ['circuit_compile', 'circuit_simulate'].includes(args.operation ?? '') ? 'circuit' : undefined
      let isolatedPath: string | undefined
      if (profile && args.action === 'run') {
        const root = process.env.ZEROWALL_PYTHON_ROOT ?? process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT
        if (!root) throw new Error('Managed Python root unavailable')
        const pointer = await readFile(join(root, 'profiles', profile, 'current.json'), 'utf8').then(JSON.parse, () => undefined)
        const current = JSON.parse(await readFile(join(root, 'current.json'), 'utf8'))
        if (!pointer || pointer.snapshotId !== current.root) return { ok: false, status: 'missing_dependency', profile, repair: 'Preview and approve this profile with python_environment; interpreter snapshot changed or profile is missing.' }
        const rel = relative(resolve(root, 'profiles', profile), resolve(pointer.sitePackages))
        if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Invalid profile path')
        isolatedPath = pointer.sitePackages
      }
      const envelope = { ...args, arguments: args.arguments ?? {} }
      const code = [
        'import sys,os,json',
        ...(isolatedPath ? [`sys.path[:]=[p for p in sys.path if 'site-packages' not in p.lower() and 'overlay' not in p.lower()]`, `sys.path.insert(0,${JSON.stringify(isolatedPath)})`, `os.environ['ZEROWALL_BIO_PROFILE']=${JSON.stringify(profile)}`] : []),
        `sys.path.insert(0,${JSON.stringify(join(payloadRoot, 'python'))})`,
        'from zerowall_bridge import main',
        `print(main(json.loads(${JSON.stringify(JSON.stringify(envelope))})))`,
      ].join('\n')
      const result = await runPython({ code, description: `BioGenie ${args.action} ${args.operation ?? ''}`, timeoutMs: args.timeout_ms ?? 120_000 }, exec)
      if (result.timedOut) throw new Error('BioGenie timed out; inspect artifacts before retrying.')
      if (result.exitCode !== 0) throw new Error(`BioGenie process failed: ${result.stderr.slice(-4000)}`)
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
