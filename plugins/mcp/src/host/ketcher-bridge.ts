import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
interface PendingEditor { artifact_id: string; url: string; sessionId: string; cwd: string; createdAt: number }
export class KetcherBridge {
  private readonly pending = new Map<string, PendingEditor>()
  list(): PendingEditor[] { return [...this.pending.values()].filter(item => Date.now() - item.createdAt < 60_000) }
  acknowledge(id: string): void { this.pending.delete(id) }
  async execute(client: Client, name: string, args: unknown, exec: ToolExecution): Promise<any> {
    const cwd = exec.agent?.session.header.cwd; const sessionId = exec.agent?.session.id
    if (!cwd || !sessionId) throw new Error('Ketcher requires an active workspace session')
    const meta = { 'zerowall/workspace': cwd, 'zerowall/session': String(sessionId) }
    const call = async (tool: string, input: unknown) => {
      const result = await client.callTool({ name: tool, arguments: input as Record<string, unknown>, _meta: meta }, undefined, { signal: exec.signal, timeout: 40_000 })
      if (result.isError) throw new Error(JSON.stringify(result.content))
      return result
    }
    let result = await call(name, args)
    if (name === 'open_sketcher') {
      const editor = result._meta?.['zerowall/editor'] as { artifact_id?: string; url?: string } | undefined
      if (!editor?.artifact_id || !editor.url || !/^http:\/\/127\.0\.0\.1:\d+\/#/u.test(editor.url)) throw new Error('Ketcher did not return a valid local editor bridge')
      this.pending.set(editor.artifact_id, { artifact_id: editor.artifact_id, url: editor.url, sessionId: String(sessionId), cwd, createdAt: Date.now() })
      const deadline = Date.now() + 35_000
      while (Date.now() < deadline) {
        exec.signal.throwIfAborted()
        result = await call('editor_status', { artifact_id: editor.artifact_id })
        const status = (result.structuredContent as { status?: string } | undefined)?.status
        if (status === 'ready') break
        if (status === 'closed') throw new Error('EDITOR_CLOSED: editor closed during initialization')
        await new Promise(accept => setTimeout(accept, 350))
      }
      this.pending.delete(editor.artifact_id)
      if ((result.structuredContent as { status?: string } | undefined)?.status !== 'ready') throw new Error(`EDITOR_NOT_MOUNTED: open timed out; artifact_id=${editor.artifact_id}`)
    }
    // The browser capability is Host/UI-only; never write it into model/session history.
    return { content: result.content, ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}) }
  }
}
