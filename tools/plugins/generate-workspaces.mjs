import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const rootPackage = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const version = String(rootPackage.version)
const clientInject = [
  'betterSidebar',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-api-remotes',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-sidebar',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-ui-tool',
]

const externalClientDependencies = {
  'dsh-better-sidebar': '0.16.0',
  'dsh-dream-skin': '0.4.14',
}

const dshDependencies = {
  '@deepseek-ai/cordis': 'workspace:^',
  '@deepseek-ai/schemastery': 'workspace:^',
  '@deepseek-ai/dsh-agent': 'workspace:^',
  '@deepseek-ai/dsh-agent-default-model': 'workspace:^',
  '@deepseek-ai/dsh-attachment': 'workspace:^',
  '@deepseek-ai/dsh-commands': 'workspace:^',
  '@deepseek-ai/dsh-llm': 'workspace:^',
  '@deepseek-ai/dsh-llm-pi-ai': 'workspace:^',
  '@deepseek-ai/dsh-mcp-client': 'workspace:^',
  '@deepseek-ai/dsh-session': 'workspace:^',
  '@deepseek-ai/dsh-session-persistence': 'workspace:^',
  '@deepseek-ai/dsh-settings': 'workspace:^',
  '@deepseek-ai/dsh-skill': 'workspace:^',
  '@deepseek-ai/dsh-skill-filesystem': 'workspace:^',
  '@deepseek-ai/dsh-subagent': 'workspace:^',
  '@deepseek-ai/dsh-tools': 'workspace:^',
  '@deepseek-ai/dsh-typert-protocol': 'workspace:^',
  '@deepseek-ai/dsh-api-remotes': 'workspace:^',
  '@deepseek-ai/dsh-host-webserver': 'workspace:^',
  '@deepseek-ai/dsh-system-prompt': 'workspace:^',
  '@deepseek-ai/dsh-workspace': 'workspace:^',
  '@deepseek-ai/dsh-client-runtime': 'workspace:^',
  '@deepseek-ai/dsh-client-locale': 'workspace:^',
  '@deepseek-ai/dsh-client-ui-slots': 'workspace:^',
  '@deepseek-ai/dsh-client-ui-sidebar': 'workspace:^',
  '@deepseek-ai/dsh-client-ui-settings': 'workspace:^',
  '@deepseek-ai/dsh-client-ui-conversation': 'workspace:^',
  '@deepseek-ai/dsh-client-ui-attachment': 'workspace:^',
  '@deepseek-ai/dsh-client-ui-tool': 'workspace:^',
  '@deepseek-ai/dsh-client-ui-primitives': 'workspace:^',
}

const npmDependencies = {
  opencode: {},
  base: { 'lucide-react': '^0.468.0', react: '^18.2.0', 'react-dom': '^18.2.0' },
  projects: { '@zerowallscience/research-store': 'workspace:^', 'lucide-react': '^0.468.0', react: '^18.2.0', 'react-dom': '^18.2.0', zod: '^4.4.3' },
  account: { qrcode: '^1.5.4', 'lucide-react': '^0.468.0', react: '^18.2.0', 'react-dom': '^18.2.0', zod: '^4.4.3' },
  files: { jszip: '3.10.1', 'pdf-lib': '^1.17.1', 'pdfjs-dist': '^4.10.38', xlsx: '^0.18.5', 'fast-xml-parser': '^5.11.0', zod: '^4.4.3', 'lucide-react': '^0.468.0', react: '^18.2.0' },
  images: { sharp: '^0.35.3', 'lucide-react': '^0.468.0', react: '^18.2.0' },
  mcp: { '@zerowallscience/research-store': 'workspace:^', 'lucide-react': '^0.468.0', react: '^18.2.0', 'react-dom': '^18.2.0', zod: '^4.4.3' },
  skills: { 'lucide-react': '^0.468.0', react: '^18.2.0', 'react-dom': '^18.2.0', zod: '^4.4.3' },
  reviewer: { 'lucide-react': '^0.468.0', react: '^18.2.0', zod: '^4.4.3' },
  environment: { 'lucide-react': '^0.468.0', react: '^18.2.0', zod: '^4.4.3' },
  research: { '@zerowallscience/research-store': 'workspace:^', 'lucide-react': '^0.468.0', react: '^18.2.0', 'react-dom': '^18.2.0', zod: '^4.4.3' },
  execution: { '@zerowallscience/research-store': 'workspace:^', zod: '^4.4.3' },
  runs: { '@zerowallscience/research-store': 'workspace:^', zod: '^4.4.3' },
  publications: { '@zerowallscience/research-store': 'workspace:^', jszip: '3.10.1', zod: '^4.4.3' },
  presentations: { '@zerowallscience/research-store': 'workspace:^', '@pdf-lib/fontkit': '1.1.1', 'pdf-lib': '1.17.1', pptxgenjs: '4.0.1', zod: '^4.4.3' },
  'web-search': {
    zod: '^4.4.3',
    '@deepseek-ai/dsh-web': 'workspace:^',
    '@deepseek-ai/dsh-web-search-deepseek': 'workspace:^',
  },
  wechat: { qrcode: '^1.5.4', 'lucide-react': '^0.468.0', react: '^18.2.0', 'react-dom': '^18.2.0' },
}

const plugins = [
  { id: 'opencode', capabilities: ['llm.free', 'llm.discovery'], permissions: ['network'] },
  { id: 'base', client: true, clientExternal: [], capabilities: ['ui.locale', 'ui.update'], permissions: [], requiredServices: [], optionalServices: ['updater'] },
  { id: 'desktop-compat', capabilities: ['desktop.profiles', 'desktop.plugins'], permissions: [], requiredServices: [], optionalServices: ['desktopProfiles', 'desktopPnpm'] },
  { id: 'secrets', capabilities: ['credentials.read', 'credentials.write'], permissions: ['credentials'], requiredServices: [], optionalServices: ['credentialBroker'] },
  { id: 'environment', client: true, remote: true, capabilities: ['environment-config'], permissions: ['credentials', 'processes'], dependencies: ['secrets', 'base'] },
  { id: 'projects', client: true, remote: true, capabilities: ['projects', 'workspaces'], permissions: ['files'] },
  { id: 'account', client: true, remote: true, capabilities: ['account'], permissions: ['credentials', 'network'], dependencies: ['secrets', 'base'] },
  { id: 'ai-cloud', client: true, capabilities: ['llm.cloud'], permissions: ['credentials', 'network'], dependencies: ['account', 'secrets'] },
  { id: 'files', client: true, remote: true, capabilities: ['files', 'data-assets'], permissions: ['files'] },
  {
    id: 'images',
    client: true,
    capabilities: ['images', 'image-generation'],
    permissions: ['files', 'network'],
    dependencies: ['account', 'secrets', 'base', 'environment'],
  },
  { id: 'mcp', client: true, remote: true, capabilities: ['mcp'], permissions: ['files', 'network'], dependencies: ['projects', 'base'] },
  { id: 'skills', client: true, remote: true, capabilities: ['skills'], permissions: ['files'], dependencies: ['base'] },
  { id: 'reviewer', client: true, capabilities: ['reviewer'], permissions: ['approvals'], dependencies: ['base'] },
  { id: 'research', client: true, remote: true, capabilities: ['research', 'data-assets', 'artifacts'], permissions: ['files'], dependencies: ['projects', 'base'] },
  { id: 'execution', client: true, remote: true, capabilities: ['execution-contexts'], permissions: ['processes', 'files'] },
  { id: 'python', capabilities: ['python'], permissions: ['processes', 'files'], dependencies: [] },
  { id: 'runs', client: true, remote: true, capabilities: ['runs'], permissions: ['processes', 'files'], dependencies: ['execution'] },
  { id: 'publications', client: true, remote: true, capabilities: ['papers', 'publications'], permissions: ['files'], dependencies: ['runs'] },
  { id: 'presentations', client: true, remote: true, capabilities: ['presentations'], permissions: ['files', 'processes'] },
  { id: 'web-search', client: true, capabilities: ['web-search'], permissions: ['credentials', 'network'], dependencies: ['account', 'secrets'] },
  { id: 'wechat', client: true, capabilities: ['remote.wechat'], permissions: ['credentials', 'network', 'files', 'approvals'], dependencies: ['secrets', 'projects', 'files', 'base'], requiredServices: ['agents', 'sessions', 'agentDefaultModel'], optionalServices: ['webServer', 'workspaceRegistry', 'agentPresets'] },
]

// plugin-base is the single client-side assembly point for ZeroWall Typert
// remotes. Keep its module-table dependency list derived from the same plugin
// roster that generates the remote contribution imports, so a newly added
// remote can never be emitted as a dynamic require without a graph edge.
const remoteClientExternal = plugins
  .filter(plugin => plugin.remote)
  .map(plugin => `@zerowallscience/plugin-${plugin.id}`)
const basePlugin = plugins.find(plugin => plugin.id === 'base')
if (basePlugin !== undefined) basePlugin.clientExternal = remoteClientExternal

for (const plugin of plugins) {
  const dir = resolve(root, 'plugins', plugin.id)
  const name = `@zerowallscience/plugin-${plugin.id}`
  await mkdir(resolve(dir, 'src/host'), { recursive: true })
  await mkdir(resolve(dir, 'src/client'), { recursive: true })
  await mkdir(resolve(dir, 'src/shared'), { recursive: true })
  await mkdir(resolve(dir, 'test'), { recursive: true })

  const packageJson = {
    name,
    version,
    description: `ZeroWall Science ${plugin.id} domain plugin.`,
    type: 'module',
    main: './lib/index.js',
    types: './src/host/index.ts',
    exports: {
      '.': { types: './src/host/index.ts', default: './lib/index.js' },
      ...(plugin.client ? { './client': { types: './src/client/index.ts', default: './lib/client.js' } } : {}),
      ...(plugin.id === 'base' ? { './client-helpers': './src/shared/client-helpers.ts' } : {}),
      ...(plugin.remote ? {
        // DSH rc2 Typert composition discovers remote contracts through these
        // generated faces. Without the exports the generator intentionally
        // skips typert.host/remote artifacts and the Web client waits forever
        // for remote.* services even though the Host plugin itself starts.
        './typert': { types: './lib/typert.host.d.ts', default: './lib/typert.host.js' },
        './remote': { types: './lib/typert.remote-client.d.ts', default: './lib/typert.remote-client.js' },
      } : {}),
      './types': './src/shared/types.ts',
      './manifest': './zerowall.plugin.json',
      './package.json': './package.json',
    },
    dsh: {
      bundle: { patch: 'dsh.bundle.patch.yml' },
      ...(plugin.client ? {
        client: {
          inject: clientInject,
          ...(plugin.clientExternal === undefined ? {} : { external: plugin.clientExternal }),
          platform: 'web',
        },
      } : {}),
    },
    zerowall: {
      dsh: { min: '0.1.1-rc.2', max: '0.1.1-rc.2' },
      requiredServices: plugin.requiredServices ?? [],
      optionalServices: plugin.optionalServices ?? [],
      capabilities: plugin.capabilities,
      permissions: plugin.permissions,
      profiles: ['development', 'preview', 'stable'],
      migrationVersion: 1,
    },
    scripts: {
      bundle: 'tsdown',
      typecheck: plugin.client
        ? 'tsc -p tsconfig.host.json --noEmit && tsc -p tsconfig.client.json --noEmit'
        : 'tsc -p tsconfig.host.json --noEmit',
      test: 'vitest run --config ../../vitest.plugins.config.ts',
    },
    license: 'AGPL-3.0-only',
    files: [
      'lib',
      ...(plugin.remote ? [
        'lib/typert.host.js',
        'lib/typert.host.d.ts',
        'lib/typert.remote-client.js',
        'lib/typert.remote-client.d.ts',
      ] : []),
      'dsh.bundle.patch.yml',
      'zerowall.plugin.json',
      'README.md',
    ],
    dependencies: {
      ...dshDependencies,
      ...(plugin.client ? externalClientDependencies : {}),
      ...Object.fromEntries((plugin.dependencies ?? []).map(id => [`@zerowallscience/plugin-${id}`, 'workspace:^'])),
      ...(plugin.id === 'base'
        ? Object.fromEntries(plugins.filter(candidate => candidate.remote).map(candidate => [`@zerowallscience/plugin-${candidate.id}`, 'workspace:^']))
        : {}),
      ...(npmDependencies[plugin.id] ?? {}),
    },
    peerDependencies: {
      '@deepseek-ai/cordis': '^4.0.3',
    },
    devDependencies: {
      tsdown: '^0.22.2',
      typescript: '6.0.3',
      vitest: '^4.1.10',
    },
  }
  await writeFile(resolve(dir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`)
  await writeFile(resolve(dir, 'zerowall.plugin.json'), `${JSON.stringify({
    name,
    version,
    dsh: packageJson.zerowall.dsh,
    host: './lib/index.js',
    ...(plugin.client ? { client: './lib/client.js' } : {}),
    requiredServices: packageJson.zerowall.requiredServices,
    optionalServices: packageJson.zerowall.optionalServices,
    capabilities: plugin.capabilities,
    permissions: plugin.permissions,
    network: plugin.permissions.includes('network'),
    files: plugin.permissions.includes('files'),
    credentials: plugin.permissions.includes('credentials'),
    approvals: plugin.permissions.includes('approvals'),
    profiles: packageJson.zerowall.profiles,
    migrationVersion: 1,
  }, null, 2)}\n`)
  await writeFile(resolve(dir, 'dsh.bundle.patch.yml'), [
    '- insert:',
    `    - id: zerowall-${plugin.id}`,
    `      name: '${name}'`,
    '',
  ].join('\n'))
  await writeFile(resolve(dir, 'tsconfig.json'), `${JSON.stringify({
    files: [],
    references: [
      { path: './tsconfig.host.json' },
      ...(plugin.client ? [{ path: './tsconfig.client.json' }] : []),
    ],
  }, null, 2)}\n`)
  await writeFile(resolve(dir, 'tsconfig.host.json'), `${JSON.stringify({
    extends: '../../tsconfig.plugin.host.json',
    include: ['src/host', 'src/shared'],
  }, null, 2)}\n`)
  await writeFile(resolve(dir, 'tsconfig.client.json'), `${JSON.stringify({
    extends: '../../tsconfig.plugin.client.json',
    include: plugin.client ? ['src/client', 'src/shared'] : [],
  }, null, 2)}\n`)
  await writeFile(resolve(dir, 'tsdown.config.ts'), [
    "import { zerowallBundle } from '../../tools/plugins/tsdown.ts'",
    '',
    `export default zerowallBundle('${name}', { host: true, client: ${plugin.client === true}${plugin.id === 'ai-cloud'
      ? String.raw`, hostAlwaysBundle: [/^@deepseek-ai\/dsh-llm-pi-ai\/src\/config\.ts$/u, /llm-pi-ai[\\/]src[\\/]config\.ts$/u]`
      : ''} })`,
    '',
  ].join('\n'))
  if (plugin.client) {
    await writeFile(resolve(dir, 'src/client/css-modules.d.ts'), "declare module '*.module.css' { const classes: Record<string, string>; export default classes }\n")
  }
  if (!(await exists(resolve(dir, 'src/host/index.ts')))) {
    await writeFile(resolve(dir, 'src/host/index.ts'), 'export function apply(): void {}\nexport default apply\n')
  }
  if (plugin.client && !(await exists(resolve(dir, 'src/client/index.ts')))) {
    await writeFile(resolve(dir, 'src/client/index.ts'), 'export function apply(): void {}\n')
  }
  if (!(await exists(resolve(dir, 'src/shared/types.ts')))) {
    await writeFile(resolve(dir, 'src/shared/types.ts'), 'export type ZeroWallPluginTypes = Record<string, never>\n')
  }
}

async function exists(path) {
  try { await access(path); return true } catch { return false }
}
