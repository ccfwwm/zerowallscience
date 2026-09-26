const common = {
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
    'out/main/python-updater-worker.js',
    'out/main/chunks/mcp-environment-*.js',
    '**/yauzl/**/*',
    '**/pend/**/*',
    '**/*.node',
    '**/*.dll',
    '**/*.exe',
    '**/node-pty/**/*',
    '**/sharp/**/*',
    '**/@zerowallscience/integrity-runtime/**/*',
    '**/dsh-univer-office/**/*',
    '**/koffi/**/*',
    '**/@koromix/koffi-*/*',
    '**/@koromix/koffi-*/**/*',
    '**/@deepseek-ai/dsh-host-directory-picker-native/lib/worker.cjs',
    '**/ripgrep*/**/*',
  ],
  npmRebuild: false,
  electronDist: 'node_modules/electron/dist',
  compression: 'normal',
  electronLanguages: ['en-US', 'zh-CN', 'zh-TW'],
  directories: {
    output: 'dist',
    buildResources: '../resources/brand/app-icons',
  },
  files: [
    'out/**/*',
    'package.json',
    // Exclude the workspace's pnpm-linked installation first; the explicit
    // curated runtime mapping below is added afterwards and therefore remains
    // included in the ASAR.
    '!node_modules/**/*',
    // The runtime closure is the only production dependency tree copied into
    // the ASAR. Keep the standard node_modules name because Node's ESM resolver
    // requires that package boundary for bare package imports.
    { from: '../.build/runtime/node_modules', to: 'node_modules', filter: ['**/*'] },
    {
      from: 'build',
      to: 'runtime',
      filter: ['harness-node-entry.mjs', 'runtime-esm-register.mjs', 'runtime-esm-loader.mjs'],
    },
  ],
  extraResources: [
    { from: '../resources/biogenie', to: 'biogenie', filter: ['**/*', '!**/__pycache__/**', '!**/*.pyc'] },
    { from: '../resources/python/dependency-manifest.json', to: 'python/dependency-manifest.json' },
    { from: 'dist/python-base-3.12.10/latest.json', to: 'python/base-manifest.json' },
    { from: 'dist/python-base-3.12.10/zerowall-python-windows-x64-3.12.10.zip', to: 'python/base-runtime.zip' },
    { from: '../resources/mcp/bio-tools', to: 'bio-tools', filter: ['**/*', '!**/__pycache__/**', '!**/*.pyc'] },
    { from: '../resources/mcp/ketcher-chemistry', to: 'ketcher-chemistry', filter: ['server.js', 'widget/**', 'LICENSE*', 'UPSTREAM.json'] },
    { from: '../mcp-environment-staging/sci', to: 'sci', filter: ['dist/**', 'zerowall-mcp-launcher.cjs', 'package.json', 'LICENSE*', 'README.md'] },
    { from: 'build/zerowall.patch.yml', to: 'zerowall.patch.yml' },
    { from: 'build/splash.html', to: 'splash.html' },
    { from: '../.build/resources/skills', to: 'skills', filter: ['**/*'] },
    { from: '../profiles/generated', to: 'profiles', filter: ['*.yml'] },
    { from: '../THIRD_PARTY_NOTICES.md', to: 'licenses/THIRD_PARTY_NOTICES.md' },
    { from: '../config/deepseek-harness/upstream.json', to: 'licenses/deepseek-harness.version.json' },
    { from: '../.build/runtime/build-receipt.json', to: 'licenses/build-receipt.json' },
    { from: '../resources/brand/app-icons/icon.png', to: 'icon.png' },
    { from: '../resources/brand/zerowall/zerowall-icon.png', to: 'zerowall-icon.png' },
  ],
  win: {
    icon: '../resources/brand/app-icons/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  mac: {
    icon: '../resources/brand/app-icons/icon.icns',
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
