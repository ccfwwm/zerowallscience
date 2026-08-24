import { zerowallBundle } from '../../tools/plugins/tsdown.ts'

export default zerowallBundle('@zerowallscience/plugin-ai-cloud', { host: true, client: false, hostAlwaysBundle: [/^@deepseek-ai\/dsh-llm-pi-ai\/src\/config\.ts$/u, /llm-pi-ai[\\/]src[\\/]config\.ts$/u] })
