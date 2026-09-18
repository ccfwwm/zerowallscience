import { zerowallBundle } from '../../tools/plugins/tsdown.ts'

export default zerowallBundle('@zerowallscience/plugin-mcp', { host: true, client: true, hostAlwaysBundle: [/^@deepseek-ai\/dsh-mcp-client\/src\//] })
