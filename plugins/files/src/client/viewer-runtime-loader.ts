import type { createViewer } from '@open-file-viewer/core'

export interface ViewerRuntime { createViewer: typeof createViewer; plugins: () => NonNullable<Parameters<typeof createViewer>[0]['plugins']> }
const pending = new Map<string, Promise<ViewerRuntime>>()
function validRuntime(value: ViewerRuntime | undefined): value is ViewerRuntime {
  return typeof value?.createViewer === 'function' && typeof value.plugins === 'function'
}
export function loadViewerRuntime(): Promise<ViewerRuntime> {
  const version = process.env.ZEROWALL_VERSION ?? 'development'
  const loaded = (globalThis as any).__ZEROWALL_VIEWER_RUNTIMES__?.[version] as ViewerRuntime | undefined
  if (validRuntime(loaded)) return Promise.resolve(loaded)
  const current = pending.get(version)
  if (current) return current
  const operation = new Promise<ViewerRuntime>((accept, reject) => {
    const script = document.createElement('script')
    script.src = `/zerowall/viewer-assets/runtime/${encodeURIComponent(version)}/viewer-runtime.js`
    script.async = true
    const timer = setTimeout(() => failed('本地预览运行时加载超时，请重试'), 30_000)
    const finished = () => { clearTimeout(timer); script.onload = null; script.onerror = null }
    const failed = (message: string) => { finished(); script.remove(); reject(new Error(message)) }
    script.onload = () => {
      const runtime = (globalThis as any).__ZEROWALL_VIEWER_RUNTIMES__?.[version] as ViewerRuntime | undefined
      if (!validRuntime(runtime)) failed('本地预览运行时不完整，请重试或修复文件插件')
      else { finished(); accept(runtime) }
    }
    script.onerror = () => failed('本地预览运行时加载失败，请重试')
    document.head.append(script)
  })
  pending.set(version, operation)
  void operation.catch(() => { if (pending.get(version) === operation) pending.delete(version) })
  return operation
}
