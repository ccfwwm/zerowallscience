import { createElement } from 'react'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '../../lib/typert.remote-client.js'
import type {} from '@zerowall/dsh-plugin-python/remote'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { createPythonManagementClient } from '@zerowall/dsh-plugin-python/client-api'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { McpSettingsTab, type McpServerInput, type McpActions } from './McpConnectionsButton.tsx'
import { NS, unwrapRemoteResult } from '@zerowall/dsh-plugin-environment/client-helpers'
import { registerKetcherTab } from './KetcherTab.js'

export const inject = ['slots', 'locale', 'remote', 'remote.zerowallMcp', 'remote.zerowallPythonManagement', 'uiWorkspace', 'betterSidebar']

export function apply(ctx: ClientContext): void {
  // Capture the dotted remote through reflection while this plugin fiber owns
  // the dependency. Slot callbacks run later in renderer fibers and must not
  // read `ctx.remote.zerowallMcp` directly.
  const mcpRemote = ctx.get('remote.zerowallMcp')
  registerKetcherTab(ctx, mcpRemote)
  const t = ctx.locale.bind(NS)
  const python = createPythonManagementClient(ctx.get('remote.zerowallPythonManagement'), () => ctx.uiWorkspace.pickDirectory())
  const actions: McpActions = {
    ...python,
      listMcpServers: async () => unwrapRemoteResult('zerowall.mcp.list', await mcpRemote.list()),
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
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'zerowall-mcp', order: 31,
    label: () => t('capabilities.mcpTab'), locale: NS, inject: () => actions,
  }, McpSettingsTab))
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config', key: '@zerowall/dsh-plugin-mcp',
  }, ({ view }: PluginConfigViewProps) => view === 'page' ? createElement(McpSettingsTab, { ...actions, t }) : null))
}
