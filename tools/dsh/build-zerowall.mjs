import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const source = resolve(root, 'dsh/source')
const pnpmCli = process.env.npm_execpath
const apiClient = resolve(source, 'packages/host/apiproxy/src/fetch/client.ts')
const apiProxy = resolve(source, 'packages/host/apiproxy/src/api-proxy.ts')
const profile = resolve(source, 'packages/boot/app-boot/src/profile.ts')
const dialogHost = resolve(source, 'packages/host/directory-picker-native/src/win32-dialog-host.ts')
const allowedLocalAdaptations = new Set([
  'packages/bundle/base/cordis.patch.yml',
  'packages/client/connection/src/client/fixture.ts',
  'packages/client/runtime/src/client/contract/sessions-port.ts',
  'packages/client/runtime/src/client/workspaces/service.ts',
  'packages/client/runtime/tests/workspaces-service.client.spec.ts',
  'packages/client/ui-attachment/src/client/ComposerAttachments.tsx',
  'packages/client/ui-attachment/src/MessageImage.module.css',
  'packages/client/ui-attachment/src/MessageImage.tsx',
  'packages/client/ui-attachment/src/client/labels.ts',
  'packages/client/ui-attachment/tests/message-image.client.spec.tsx',
  'packages/client/ui-conversation/src/client/apply.ts',
  'packages/client/ui-conversation/src/client/chat/MessageItem.module.css',
  'packages/client/ui-conversation/src/client/chat/MessageItem.tsx',
  'packages/client/ui-conversation/src/client/contract/slots.ts',
  'packages/client/ui-conversation/src/client/locales.ts',
  'packages/client/ui-conversation/src/client/service.ts',
  'packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx',
  'packages/client/ui-conversation/src/client/skeleton/EmptyHero.tsx',
  'packages/client/ui-conversation/src/client/skeleton/InputBar.module.css',
  'packages/client/ui-conversation/src/client/skeleton/InputBar.tsx',
  'packages/client/ui-conversation/src/client/skeleton/PermissionSelect.tsx',
  'packages/client/ui-conversation/tests/input-bar.client.spec.tsx',
  'packages/client/ui-directory-picker-native/src/client/index.ts',
  'packages/client/ui-directory-picker-native/tests/client-flow.client.spec.tsx',
  'packages/client/ui-permission-presets/src/client/PermissionRow.tsx',
  'packages/client/ui-permission-presets/src/client/locales.ts',
  'packages/host/apiproxy/src/api-proxy.ts',
  'packages/host/apiproxy/src/api/index.ts',
  'packages/host/apiproxy/src/api/sessions.schema.ts',
  'packages/host/apiproxy/src/api/sessions.ts',
  'packages/host/apiproxy/src/fetch/client.ts',
  'packages/host/apiproxy/tests/api-proxy-models.spec.ts',
  'packages/host/apiproxy/tests/fetch-carrier.spec.ts',
  'packages/host/apiproxy/tests/rpc-schemas.spec.ts',
  'packages/host/directory-picker-native/src/win32-dialog-host.ts',
  'packages/host/directory-picker-native/src/native-picker.ts',
  'packages/host/directory-picker-native/src/win32-dialog.ts',
  'packages/llm/llm-pi-ai/src/adapter.ts',
  'packages/llm/llm-pi-ai/src/replay.ts',
  'packages/llm/llm-pi-ai/tests/convert.spec.ts',
  'packages/llm/llm/src/index.ts',
  'packages/boot/app-boot/src/profile.ts',
  'packages/client/web/package.json',
  'packages/client/web/src/platform.ts',
  'packages/client/web/src/seed.ts',
  // ZeroWall shell adapters normalize duplicate sandbox requests at the
  // tool boundary when the active mode already matches the requested mode.
  'packages/shell/tool-bash/src/index.ts',
  'packages/shell/tool-pwsh/src/index.ts',
])

function run(file, args, options = {}) {
  execFileSync(file, args, { cwd: options.cwd ?? root, stdio: 'inherit', env: { ...process.env, ...options.env } })
}

function runPnpm(args, options) {
  if (!pnpmCli) throw new Error('pnpm executable path is unavailable to the ZeroWall DSH build wrapper.')
  run(process.execPath, [pnpmCli, ...args], options)
}

function cleanSource() {
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: source, encoding: 'utf8' }).trim()
  const dirtyPaths = status === '' ? [] : status.split(/\r?\n/).map(line => line.slice(2).trimStart()).filter(Boolean)
  const unexpectedDirtyPaths = dirtyPaths.filter(path => !allowedLocalAdaptations.has(path))
  if (unexpectedDirtyPaths.length > 0) {
    throw new Error(`dsh/source contains unexpected local changes: ${unexpectedDirtyPaths.join(', ')}`)
  }
}

async function adaptModelProbeTimeout() {
  const original = await readFile(apiClient, 'utf8')
  if (original.includes("payload.check === true ? 'caller-signal-only' : 'default'")) {
    return original
  }
  const replacements = [
    [
      "const DEFAULT_TIMEOUT_MS = 30_000\n\n/** Whether a unary call uses the transport health deadline or only caller/connection cancellation. */\ntype UnaryTimeoutPolicy = 'default' | 'caller-signal-only'",
      "const DEFAULT_TIMEOUT_MS = 30_000\n\n/** A complete catalog probe has a separate bounded deadline from ordinary UI RPCs. */\nconst MODEL_PROBE_TIMEOUT_MS = 120_000\n\n/** Whether a unary call uses the transport health deadline or only caller/connection cancellation. */\ntype UnaryTimeoutPolicy = 'default' | 'model-probe' | 'caller-signal-only'",
    ],
    [
      "    const requestSignal = timeoutPolicy === 'default'\n      ? signal === undefined\n        ? AbortSignal.timeout(this.timeoutMs)\n        : AbortSignal.any([AbortSignal.timeout(this.timeoutMs), signal])\n      : signal",
      "    const timeoutMs = timeoutPolicy === 'model-probe' ? MODEL_PROBE_TIMEOUT_MS : this.timeoutMs\n    const requestSignal = timeoutPolicy === 'caller-signal-only'\n      ? signal\n      : signal === undefined\n        ? AbortSignal.timeout(timeoutMs)\n        : AbortSignal.any([AbortSignal.timeout(timeoutMs), signal])",
    ],
    [
      "    models: (payload, signal) => this.callUnary('session.models', payload, signal),",
      "    models: (payload, signal) => this.callUnary(\n      'session.models', payload, signal, payload.check === true ? 'model-probe' : 'default',\n    ),",
    ],
    [
      "    models: (payload, signal) => this.callUnary('llm.models', payload, signal),",
      "    models: (payload, signal) => this.callUnary(\n      'llm.models', payload, signal, payload.check === true ? 'model-probe' : 'default',\n    ),",
    ],
  ]
  let adapted = original
  for (const [from, to] of replacements) {
    if (!adapted.includes(from)) throw new Error('DSH rc2 model probe source no longer matches the ZeroWall build adaptation.')
    adapted = adapted.replace(from, to)
  }
  await writeFile(apiClient, adapted)
  return original
}

async function adaptPackagedProfileFallback() {
  const original = await readFile(profile, 'utf8')
  const importFrom = "  existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, unlinkSync, writeFileSync,"
  if (!original.includes(importFrom)) throw new Error('DSH rc2 profile source no longer matches the ZeroWall packaged fallback adaptation.')
  let adapted = original
  const marker = "function ensureSymlink(link: string, target: string): void {"
  const start = adapted.indexOf(marker)
  const end = adapted.indexOf('\n}\n\n/**', start)
  if (start < 0 || end < 0) throw new Error('DSH rc2 ensureSymlink source no longer matches the ZeroWall packaged fallback adaptation.')
  // The checked-in source already owns the ASAR guard. The build wrapper only
  // validates that the rc2 shape is still present; it must not inject a second
  // guard into the generated bundle.
  const replacement = `function ensureSymlink(link: string, target: string): void {${adapted.slice(start + marker.length, end)}
}`
  adapted = `${adapted.slice(0, start)}${replacement}${adapted.slice(end + 2)}`
  await writeFile(profile, adapted)
  return original
}

async function adaptModelStatusPersistence() {
  const original = await readFile(apiProxy, 'utf8')
  if (original.includes("'model-probes.json'") && original.includes('ensureModelProbeCache')) {
    return original
  }
  const importFrom = "import { mkdir, stat } from 'node:fs/promises'"
  const importTo = "import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'"
  if (!original.includes(importFrom)) throw new Error('DSH rc2 api-proxy source no longer matches the ZeroWall model status adaptation.')
  let adapted = original.replace(importFrom, importTo)
  const pathFrom = "import { dirname } from 'node:path'"
  const pathTo = "import { dirname, join } from 'node:path'"
  if (!adapted.includes(pathFrom)) throw new Error('DSH rc2 api-proxy path imports no longer match the ZeroWall model status adaptation.')
  adapted = adapted.replace(pathFrom, pathTo)
  const constantMarker = 'const DEFAULT_MAX_MESSAGES = 50\n'
  const cacheCode = `const DEFAULT_MAX_MESSAGES = 50

type PersistedModelProbe = { status: ModelAvailability; statusMessage?: string; probeProtocol?: string; lastCheckedAt: number }
const modelProbeStatus = new Map<string, PersistedModelProbe>()
let modelProbeStatusLoaded = false
let modelProbeStatusLoad: Promise<void> | undefined

function modelProbeStatusPath(): string {
  return process.env.ZEROWALL_MODEL_STATUS_PATH ?? join(process.env.DSH_HOME ?? homedir(), 'model-status.json')
}

async function loadModelProbeStatus(): Promise<void> {
  if (modelProbeStatusLoaded) return
  modelProbeStatusLoad ??= (async () => {
    try {
      const raw = JSON.parse(await readFile(modelProbeStatusPath(), 'utf8')) as unknown
      if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [key, value] of Object.entries(raw)) {
          if (value !== null && typeof value === 'object' && typeof (value as { status?: unknown }).status === 'string') {
            modelProbeStatus.set(key, value as PersistedModelProbe)
          }
        }
      }
    } catch { /* first run or a partially written cache is equivalent to empty */ }
    modelProbeStatusLoaded = true
  })()
  await modelProbeStatusLoad
}

async function saveModelProbeStatus(): Promise<void> {
  const path = modelProbeStatusPath()
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(Object.fromEntries(modelProbeStatus), null, 2) + '\\n', 'utf8')
  } catch { /* availability is advisory; never fail model catalog delivery */ }
}

function applyCachedModelProbeStatus(groups: ModelProviderGroup[]): ModelProviderGroup[] {
  return groups.map(group => ({
    ...group,
    models: group.models.map(model => {
      const cached = modelProbeStatus.get(\`\${group.id}\\0\${model.id}\`)
      return cached === undefined ? { ...model, status: 'unknown' as const } : { ...model, ...cached }
    }),
  }))
}
`
  if (!adapted.includes(constantMarker)) throw new Error('DSH rc2 api-proxy constants no longer match the ZeroWall model status adaptation.')
  adapted = adapted.replace(constantMarker, cacheCode)
  const loadMarker = "  const catalog = await Promise.all(ctx.llm.listProviders().map(async (provider) => {"
  if (!adapted.includes(loadMarker)) throw new Error('DSH rc2 model catalog source no longer matches the ZeroWall model status adaptation.')
  adapted = adapted.replace(loadMarker, "  await loadModelProbeStatus()\n  const catalog = await Promise.all(ctx.llm.listProviders().map(async (provider) => {")
  const checkMarker = "  if (options.check === true) groups = await probeModelCatalog(ctx, groups, options.signal)"
  if (!adapted.includes(checkMarker)) throw new Error('DSH rc2 model catalog check source no longer matches the ZeroWall model status adaptation.')
  adapted = adapted.replace(checkMarker, "  if (options.check === true) groups = await probeModelCatalog(ctx, groups, options.signal)\n  else groups = applyCachedModelProbeStatus(groups)")
  const persistMarker = "  await Promise.all(Array.from({ length: Math.min(6, entries.length) }, () => worker()))\n  return groups.map(group => ({"
  if (!adapted.includes(persistMarker)) throw new Error('DSH rc2 model probe source no longer matches the ZeroWall model status adaptation.')
  adapted = adapted.replace(persistMarker, "  await Promise.all(Array.from({ length: Math.min(6, entries.length) }, () => worker()))\n  for (const [key, value] of results) modelProbeStatus.set(key, value)\n  await saveModelProbeStatus()\n  return groups.map(group => ({")
  const managedMarker = "      const checkedAt = Date.now()\n      const controller = new AbortController()"
  const managedReplacement = "      const checkedAt = Date.now()\n      // ZeroWall AI Cloud groups have already passed the authenticated /v1/models\n      // catalog check. Replaying a synthetic chat request against every model\n      // produces false negatives for quota/protocol-gated aliases, so catalog\n      // availability is the authoritative status for these managed routes.\n      if (entry.group.id.startsWith('zerowall-ai-cloud-')) {\n        results.set(`${entry.group.id}\\0${entry.model.id}`, { status: 'available', statusMessage: '目录可用', probeProtocol: 'catalog', lastCheckedAt: checkedAt })\n        continue\n      }\n      const controller = new AbortController()"
  if (!adapted.includes(managedMarker)) throw new Error('DSH rc2 managed model probe source no longer matches the ZeroWall model status adaptation.')
  adapted = adapted.replace(managedMarker, managedReplacement)
  const statusMarker = "        const status: ModelAvailability = /login|credential|api key|unauthori[sz]ed|401|403/.test(lower)\n          ? 'requires-login'\n          : 'unavailable'"
  const statusReplacement = "        const status: ModelAvailability = /login|credential|api key|unauthori[sz]ed|401|403/.test(lower)\n          ? 'requires-login'\n          : /检测超时|timeout|timed out|aborted/.test(lower)\n            ? 'unknown'\n            : 'unavailable'"
  if (!adapted.includes(statusMarker)) throw new Error('DSH rc2 model probe status source no longer matches the ZeroWall model status adaptation.')
  adapted = adapted.replace(statusMarker, statusReplacement)
  await writeFile(apiProxy, adapted)
  return original
}

async function adaptPackagedDialogWorkerPath() {
  const original = await readFile(dialogHost, 'utf8')
  // Newer ZeroWall-adapted DSH sources resolve the worker path directly from
  // app.asar to app.asar.unpacked. Keep the build idempotent when that source
  // is already present instead of requiring the old replacement marker.
  if (original.includes('app.asar.unpacked')) return original
  const from = "    return spawn(process.execPath, [fileURLToPath(new URL('./worker.cjs', import.meta.url))], { env, stdio, windowsHide: true })"
  const to = "    const workerPath = fileURLToPath(new URL('./worker.cjs', import.meta.url))\n    // The worker is intentionally unpacked because koffi/native dialog code\n    // cannot execute from app.asar. Resolve the physical sibling when the\n    // host module itself is loaded from the archive.\n    const unpackedWorkerPath = workerPath.replace(/([\\\\/])app\\.asar([\\\\/])/iu, '$1app.asar.unpacked$2')\n    return spawn(process.execPath, [unpackedWorkerPath], { env, stdio, windowsHide: true })"
  if (!original.includes(from)) throw new Error('DSH rc2 dialog worker source no longer matches the ZeroWall packaged-path adaptation.')
  await writeFile(dialogHost, original.replace(from, to))
  return original
}

cleanSource()

let original
let originalApiProxy
let originalProfile
let originalDialogHost
try {
  original = await adaptModelProbeTimeout()
  originalApiProxy = await adaptModelStatusPersistence()
  originalProfile = await adaptPackagedProfileFallback()
  originalDialogHost = await adaptPackagedDialogWorkerPath()
  const memory = { NODE_OPTIONS: '--max-old-space-size=8192' }
  runPnpm(['--filter', '@deepseek-ai/dsh-root', 'run', 'build:lib:host'], { cwd: source, env: memory })
  runPnpm(['--filter', '@deepseek-ai/dsh-root', 'run', 'build:lib:client'], { cwd: source, env: memory })
  runPnpm(['--filter', '@deepseek-ai/dsh-root', 'run', 'build:web'], { cwd: source })
} finally {
  if (original !== undefined) await writeFile(apiClient, original)
  if (originalApiProxy !== undefined) await writeFile(apiProxy, originalApiProxy)
  if (originalProfile !== undefined) await writeFile(profile, originalProfile)
  if (originalDialogHost !== undefined) await writeFile(dialogHost, originalDialogHost)
  cleanSource()
}
