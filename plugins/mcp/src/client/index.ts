import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { McpConnectionsButton, type McpServerInput } from './McpConnectionsButton.tsx'
import { NS, unwrapRemoteResult } from '@zerowallscience/plugin-base/client-helpers'

export const inject = ['slots', 'locale', 'remote', 'remote.zerowallMcp']

export function apply(ctx: ClientContext): void {
  const remote = ctx.remote as any
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab', id: 'zerowall-mcp', order: -10,
    label: () => t('capabilities.mcpTab'), locale: NS,
    inject: () => ({
      embedded: true,
      listMcpServers: async () => unwrapRemoteResult('zerowall.mcp.list', await remote.zerowallMcp.list()),
      createMcpServer: async (input: McpServerInput) => unwrapRemoteResult('zerowall.mcp.create', await remote.zerowallMcp.create(input)),
      updateMcpServer: async (id: string, input: McpServerInput) => unwrapRemoteResult('zerowall.mcp.update', await remote.zerowallMcp.update({ id, changes: input })),
      removeMcpServer: async (id: string) => { unwrapRemoteResult('zerowall.mcp.deleteConnection', await remote.zerowallMcp.deleteConnection(id)) },
      reloadMcpServer: async (id: string) => unwrapRemoteResult('zerowall.mcp.reload', await remote.zerowallMcp.reload(id)),
      getSciMasterCredentialStatus: async () => unwrapRemoteResult('zerowall.mcp.getSciMasterCredentialStatus', await remote.zerowallMcp.getSciMasterCredentialStatus()),
      setSciMasterApiKey: async (apiKey: string) => unwrapRemoteResult('zerowall.mcp.setSciMasterApiKey', await remote.zerowallMcp.setSciMasterApiKey(apiKey)),
      clearSciMasterApiKey: async () => unwrapRemoteResult('zerowall.mcp.clearSciMasterApiKey', await remote.zerowallMcp.clearSciMasterApiKey()),
    }),
  }, McpConnectionsButton))
}
