import { zerowallBundle } from '../../tools/plugins/tsdown.ts'

export default zerowallBundle('@zerowallscience/plugin-claude-code', { host: true, client: true, inlineClientCss: true, hostAlwaysBundle: [/^@anthropic-ai\/claude-agent-sdk(?:\/|$)/u] })
