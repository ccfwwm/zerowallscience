import type { Context } from '@deepseek-ai/cordis'
import { ResearchStore } from '@zerowallscience/research-store'
import type {
  CreateMcpServerInput,
  McpServerRecord,
  UpdateMcpServerInput,
} from '@zerowallscience/research-store/types'

const STORE = Symbol('zerowall.mcp-configuration-store')

declare module '@deepseek-ai/cordis' {
  interface Context {
    zerowallMcpConfigurationStore: McpConfigurationStoreService
  }
}

export class McpConfigurationStoreService {
  private readonly [STORE]: ResearchStore

  constructor(ctx: Context) {
    const databasePath = process.env.ZEROWALL_RESEARCH_DB?.trim()
    if (!databasePath) throw new Error('ZEROWALL_RESEARCH_DB is required.')
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

export function apply(ctx: Context): void {
  ctx.provide('zerowallMcpConfigurationStore', new McpConfigurationStoreService(ctx))
}

export default { apply }
