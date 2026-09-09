import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { McpConnectionsButton, PythonEnvironmentPanel, type McpServerInput } from './McpConnectionsButton.tsx'
import { NS, unwrapRemoteResult } from '@zerowallscience/plugin-base/client-helpers'

// Do not make the whole settings tab depend on the remote namespace's first
// handshake. The tab can render while the Host reconnects; action handlers
// report a precise unavailable error until the namespace is ready.
export const inject = ['slots', 'locale', 'remote', 'remote.zerowallMcp']

export function apply(ctx: ClientContext): void {
  // Capture the injected namespace from this plugin fiber. The slot callback
  // runs later in a renderer fiber where reading `ctx.remote.zerowallMcp`
  // would correctly be rejected as an undeclared property.
  const mcpRemote = ctx.get('remote.zerowallMcp') as any
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab', id: 'zerowall-mcp', order: -10,
    label: () => t('capabilities.mcpTab'), locale: NS,
    inject: () => ({
      embedded: true,
      listMcpServers: async () => unwrapRemoteResult('zerowall.mcp.list', await mcpRemote?.list?.() ?? { ok: false, error: 'MCP remote is still connecting.' }),
      createMcpServer: async (input: McpServerInput) => unwrapRemoteResult('zerowall.mcp.create', await mcpRemote.create(input)),
      updateMcpServer: async (id: string, input: Partial<McpServerInput>) => unwrapRemoteResult('zerowall.mcp.update', await mcpRemote.update({ id, changes: input })),
      removeMcpServer: async (id: string) => { unwrapRemoteResult('zerowall.mcp.deleteConnection', await mcpRemote.deleteConnection(id)) },
      reloadMcpServer: async (id: string) => unwrapRemoteResult('zerowall.mcp.reload', await mcpRemote.reload(id)),
      getSciMasterCredentialStatus: async () => unwrapRemoteResult('zerowall.mcp.getSciMasterCredentialStatus', await mcpRemote.getSciMasterCredentialStatus()),
      setSciMasterApiKey: async (apiKey: string) => unwrapRemoteResult('zerowall.mcp.setSciMasterApiKey', await mcpRemote.setSciMasterApiKey(apiKey)),
      clearSciMasterApiKey: async () => unwrapRemoteResult('zerowall.mcp.clearSciMasterApiKey', await mcpRemote.clearSciMasterApiKey()),
      getRdatalinuxCredentialStatus: async () => unwrapRemoteResult('zerowall.mcp.getRdatalinuxCredentialStatus', await mcpRemote.getRdatalinuxCredentialStatus()),
      setRdatalinuxAuthorization: async (value: string) => unwrapRemoteResult('zerowall.mcp.setRdatalinuxAuthorization', await mcpRemote.setRdatalinuxAuthorization(value)),
      clearRdatalinuxAuthorization: async () => unwrapRemoteResult('zerowall.mcp.clearRdatalinuxAuthorization', await mcpRemote.clearRdatalinuxAuthorization()),
    }),
  }, McpConnectionsButton))
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab', id: 'zerowall-python-environment', order: -9,
    label: () => 'Python 环境', locale: NS, inject: () => ({}),
  }, PythonEnvironmentPanel))
}
