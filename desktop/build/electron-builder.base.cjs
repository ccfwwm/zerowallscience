const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const buildPaths = require('../../tools/build/paths.cjs').buildPaths(root)
const { stage, packages: packageOutput } = buildPaths
const resourcePath = (...parts) => {
  const { preferred, legacy } = buildPaths.resource(...parts)
  return fs.existsSync(preferred) ? preferred : legacy
}
const applicationVersion = require(path.join(root, 'package.json')).version

const common = {
  // The verified runtime closure supplies node_modules explicitly. Returning
  // false tells electron-builder to skip workspace dependency collection too.
  beforeBuild: async () => false,
  beforePack: async () => {
    const { pathToFileURL } = require('node:url')
    const { resolve } = require('node:path')
    const root = resolve(__dirname, '../..')
    const { verifyRuntimeFreshness } = await import(pathToFileURL(resolve(root, 'tools/packaging/verify-runtime-freshness.mjs')).href)
    await verifyRuntimeFreshness(root)
  },
  asar: true,
  asarUnpack: [
    'package.json',
    '**/*.node',
    '**/*.dll',
    '**/*.exe',
    '**/node-pty/**/*',
    '**/sharp/**/*',
    '**/@zerowallscience/integrity-runtime/**/*',
    '**/dsh-univer-office/**/*',
    '**/@deepseek-ai/libreoffice-kit/**/*',
    '**/@deepseek-ai/libreoffice-kit-win32-x64/**/*',
    '**/@deepseek-ai/libreoffice-kit-win32-arm64/**/*',
    '**/@deepseek-ai/libreoffice-kit-wasm/**/*',
    '**/koffi/**/*',
    '**/@koromix/koffi-*/*',
    '**/@koromix/koffi-*/**/*',
    '**/@deepseek-ai/dsh-host-directory-picker-native/lib/worker.cjs',
    '**/ripgrep*/**/*',
  ],
  // The hook above stops rebuilding before it starts; npmRebuild=false would
  // bypass that hook and unexpectedly enable the dependency collector again.
  npmRebuild: true,
  electronDist: path.join(root, 'desktop/node_modules/electron/dist'),
  compression: 'normal',
  electronLanguages: ['en-US', 'zh-CN', 'zh-TW'],
  directories: {
    app: path.join(stage, 'electron-app'),
    output: packageOutput,
    buildResources: resourcePath('brand', 'app-icons'),
  },
  files: [
    { from: fs.realpathSync(path.join(__dirname, '../out')), to: 'out', filter: ['**/*'] },
    'package.json',
    // Exclude the workspace's pnpm-linked installation first; the explicit
    // curated runtime mapping below is added afterwards and therefore remains
    // included in the ASAR.
    '!node_modules/**/*',
    // The runtime closure is the only production dependency tree copied into
    // the ASAR. Keep the standard node_modules name because Node's ESM resolver
    // requires that package boundary for bare package imports.
    { from: path.join(stage, 'runtime/node_modules'), to: 'node_modules', filter: ['**/*'] },
    {
      from: path.join(root, 'desktop/build'),
      to: 'runtime',
      filter: ['harness-node-entry.mjs', 'runtime-esm-register.mjs', 'runtime-esm-loader.mjs'],
    },
  ],
  extraResources: [
    { from: path.join(stage, 'offline-profile'), to: 'offline-profile', filter: ['receipt.json', 'profile-runtime.asar', 'profile-runtime.asar.unpacked/**/*'] },
    { from: path.join(stage, 'resources/extensions/skills'), to: 'extensions/skills', filter: ['**/*'] },
    { from: path.join(stage, 'resources/extensions/mcp'), to: 'extensions/mcp', filter: ['**/*'] },
    { from: path.join(stage, 'resources/extensions/capabilities/biogenie'), to: 'extensions/capabilities/biogenie', filter: ['**/*'] },
    { from: path.join(stage, 'resources/sci'), to: 'sci', filter: ['**/*'] },
    { from: path.join(stage, 'python-updater'), to: 'python-updater', filter: ['**/*'] },
    { from: resourcePath('python', 'dependency-manifest.json'), to: 'python/dependency-manifest.json' },
    { from: resourcePath('python', 'core-dependency-manifest.json'), to: 'python/core-dependency-manifest.json' },
    { from: path.join(stage, 'resources/zerowall-core.patch.yml'), to: 'zerowall.patch.yml' },
    { from: path.join(root, 'desktop/build/splash.html'), to: 'splash.html' },
    { from: path.join(root, 'profiles/generated'), to: 'profiles', filter: ['*.yml'] },
    { from: path.join(root, 'THIRD_PARTY_NOTICES.md'), to: 'licenses/THIRD_PARTY_NOTICES.md' },
    // Historical sidebar tarballs inherited the workspace license while its
    // runtime copier omits source files. Ship the adapter's actual license
    // separately and preserve those immutable release tarballs unchanged.
    { from: path.join(buildPaths.packageRoots.dsh, 'dsh-better-sidebar/LICENSE'), to: 'licenses/dsh-better-sidebar.LICENSE' },
    { from: path.join(root, 'config/deepseek-harness/upstream.json'), to: 'licenses/deepseek-harness.version.json' },
    { from: path.join(stage, 'runtime/build-receipt.json'), to: 'licenses/build-receipt.json' },
    { from: path.join(stage, 'commands'), to: 'commands', filter: ['**/*'] },
    { from: path.join(resourcePath('brand', 'app-icons'), 'icon.png'), to: 'icon.png' },
    { from: path.join(resourcePath('brand', 'zerowall'), 'zerowall-icon.png'), to: 'zerowall-icon.png' },
  ],
  win: {
    icon: path.join(resourcePath('brand', 'app-icons'), 'icon.ico'),
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  mac: {
    icon: path.join(resourcePath('brand', 'app-icons'), 'icon.icns'),
    category: 'public.app-category.productivity',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    notarize: process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID
      ? {
          appleId: process.env.APPLE_ID,
          appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
          teamId: process.env.APPLE_TEAM_ID,
        }
      : false,
    target: ['dmg', 'zip'],
  },
  nsis: {
    include: 'build/installer.nsh',
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },
}

module.exports = common
