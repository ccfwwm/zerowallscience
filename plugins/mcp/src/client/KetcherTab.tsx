import { useEffect } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { TabComponentProps } from 'dsh-better-sidebar/client/service'
import type {} from 'dsh-better-sidebar/client/service'
import { FlaskConical } from 'lucide-react'
import { unwrapRemoteResult } from '@zerowallscience/plugin-base/client-helpers'

// Capability URLs live only in memory, never in persisted sidebar metadata.
const editorUrls = new Map<string, string>()
function KetcherTab({ tab }: TabComponentProps) {
  const url = editorUrls.get(tab.id)
  if (!url || !/^http:\/\/127\.0\.0\.1:\d+\/#/u.test(url)) return <p>编辑器已失效，请重新调用 open_sketcher。</p>
  return <iframe title="Ketcher Chemistry" src={url} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', border: 0, minHeight: 520 }} />
}
export function registerKetcherTab(ctx: Context, remote: any): void {
  ctx.effect(() => ctx.betterSidebar.registerTab({ id: 'zerowall:ketcher', title: 'Ketcher Chemistry', icon: size => <FlaskConical size={size} />, hidden: true, component: KetcherTab }))
  ctx.effect(() => {
    let live = true; let busy = false
    const opened = new Set<string>()
    const poll = async () => {
      if (!live || busy) return
      busy = true
      try {
        const liveRemote = remote ?? (ctx as any).get?.('remote.zerowallMcp')
        if (!liveRemote?.pendingEditors) return
        const requests = unwrapRemoteResult('zerowall.mcp.pendingEditors', await liveRemote.pendingEditors()) as Array<{ artifact_id: string; url: string; sessionId: string; cwd: string; createdAt: number }>
        if (!live) return
        for (const request of requests) {
          const key = `${request.artifact_id}:${request.createdAt}`
          if (opened.has(key)) continue
          opened.add(key)
          const id = `zerowall:ketcher:${key}`
          editorUrls.set(id, request.url)
          ctx.betterSidebar.openTab({ type: 'zerowall:ketcher', id, title: 'Ketcher Chemistry', meta: { artifact_id: request.artifact_id } }, { sessionId: request.sessionId, cwd: request.cwd })
          await liveRemote.acknowledgeEditor(request.artifact_id)
        }
      } catch { /* Host reconnects; retry the read-only pending queue. */ }
      finally { busy = false }
    }
    const timer = setInterval(() => { void poll() }, 800)
    return () => { live = false; clearInterval(timer); editorUrls.clear() }
  })
}
