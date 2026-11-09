import type { Context } from '@deepseek-ai/cordis'
import { ResearchStore } from '@zerowall/research-store'
import type {
  CreateMcpServerInput,
  McpServerRecord,
  UpdateMcpServerInput,
} from '@zerowall/research-store/types'

const STORE = Symbol('zerowall.mcp-configuration-store')

declare module '@deepseek-ai/cordis' {
  interface Context {
    zerowallMcpConfigurationStore: McpConfigurationStoreService
  }
}

export class McpConfigurationStoreService {
  private readonly [STORE]: ResearchStore

  constructor(ctx: Context, readonly databasePath: string) {
    this[STORE] = new ResearchStore(databasePath)
    ctx.effect(() => () => this[STORE].close(), 'zerowall-mcp-configuration-store: close store')
  }

  listMcpServers(): McpServerRecord[] {
    return this[STORE].listMcpServers()
  }

  getMcpServer(id: string): McpServerRecord | undefined {
    return this[STORE].getMcpServer(id)
  }

  createMcpServer(input: CreateMcpServerInput): McpServerRecord {
    return this[STORE].createMcpServer(input)
  }

  updateMcpServer(id: string, input: UpdateMcpServerInput): McpServerRecord {
    return this[STORE].updateMcpServer(id, input)
  }

  deleteMcpServer(id: string): void {
    this[STORE].deleteMcpServer(id)
  }
}
