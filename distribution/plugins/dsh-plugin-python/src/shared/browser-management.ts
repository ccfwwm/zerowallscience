/** Browser adapter for the Host-owned Python management API. */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { PythonEnvironmentRequest, PythonManagementResponse } from './types.js'
import type { McpEnvironmentStatus, PythonEnvironmentResponse, ZeroWallDesktopApi } from '../client/desktop-api.js'

/** Remote methods used by both Python and MCP configuration pages. */
export interface PythonManagementRemote {
  request(input: PythonEnvironmentRequest): Promise<RemoteResult<PythonManagementResponse>>
  revealRuntimeDirectory(): Promise<RemoteResult<void>>
}

/**
 * Bind management actions without depending on the desktop carrier.
 * @param remote - Captured Host Remote methods.
 * @param chooseDirectory - Workspace-owned directory chooser.
 * @returns Management actions shared by plugin configuration views.
 */
export function createPythonManagementClient(remote: PythonManagementRemote, chooseDirectory: () => Promise<string | null>) {
  const request = async (input: PythonEnvironmentRequest): Promise<PythonEnvironmentResponse> => {
    const result = await remote.request(input)
    if (!result.ok) throw new Error(result.error.message)
    if (result.value.requestId !== input.requestId) throw new Error('Python management response has an invalid request identifier.')
    return result.value as PythonEnvironmentResponse
  }
  const status = async (): Promise<McpEnvironmentStatus> => {
    const result = await request({ action: 'status', requestId: crypto.randomUUID() })
    if (!result.status) throw new Error('Python management returned no runtime status.')
    return result.status
  }
  const install = async () => {
    await request({ action: 'install_runtime', requestId: crypto.randomUUID(), confirm: true })
    return status()
  }
  const api: Pick<ZeroWallDesktopApi, 'pythonEnvironment' | 'chooseDirectory' | 'copyText' | 'revealPath' | 'rollbackMcpEnvironment'> = {
    pythonEnvironment: request, chooseDirectory,
    copyText: async value => { await navigator.clipboard.writeText(value); return true },
    revealPath: async () => { const result = await remote.revealRuntimeDirectory(); if (!result.ok) throw new Error(result.error.message); return true },
    rollbackMcpEnvironment: async () => {
      const result = await request({ action: 'rollback', requestId: crypto.randomUUID(), confirm: true })
      if (!result.taskId) throw new Error('Python rollback returned no task identifier.')
      return { taskId: result.taskId }
    },
  }
  return {
    api,
    getEnvironmentStatus: status,
    retryEnvironment: install,
    checkEnvironment: status,
    updateEnvironment: async () => { await request({ action: 'sync', layer: 'core', requestId: crypto.randomUUID(), confirm: true }); return status() },
    selectEnvironment: async () => {
      const path = await chooseDirectory()
      if (path) await request({ action: 'configure', requestId: crypto.randomUUID(), runtimeRoot: path, confirm: true })
      return status()
    },
  }
}

export type { McpEnvironmentStatus } from '../client/desktop-api.js'
