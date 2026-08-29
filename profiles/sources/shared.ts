export const bundledPlugins = [
  'dsh-dream-skin',
  'dsh-better-sidebar',
  '@huanlin/dsh-plugin-better-sidebar-plugin-office',
  '@zerowallscience/plugin-base',
  '@zerowallscience/plugin-secrets',
  '@zerowallscience/plugin-environment',
  '@zerowallscience/plugin-desktop-compat',
  '@zerowallscience/plugin-projects',
  '@zerowallscience/plugin-mcp',
  '@zerowallscience/plugin-account',
  '@zerowallscience/plugin-ai-cloud',
  '@zerowallscience/plugin-opencode',
  '@zerowallscience/plugin-web-search',
  '@zerowallscience/plugin-files',
  '@zerowallscience/plugin-images',
  '@zerowallscience/plugin-image-dup',
  '@zerowallscience/plugin-research',
  '@zerowallscience/plugin-execution',
  '@zerowallscience/plugin-python',
  '@zerowallscience/plugin-runs',
  '@zerowallscience/plugin-publications',
  '@zerowallscience/plugin-presentations',
  '@zerowallscience/plugin-skills',
  '@zerowallscience/plugin-reviewer',
  '@zerowallscience/plugin-wechat',
] as const

export interface ZeroWallProfileSource {
  id: 'development' | 'preview' | 'stable'
  channel: 'development' | 'preview' | 'stable'
  plugins: readonly string[]
  wechat: { enabled: true; autoConnect: false; channel: 'ilink'; dmPolicy: 'open'; groupPolicy: 'allowlist' }
}

export function profile(id: ZeroWallProfileSource['id']): ZeroWallProfileSource {
  return {
    id,
    channel: id,
    plugins: bundledPlugins,
    wechat: {
      enabled: true,
      autoConnect: false,
      channel: 'ilink',
      dmPolicy: 'open',
      groupPolicy: 'allowlist',
    },
  }
}
