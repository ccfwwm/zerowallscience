const common = {
  asar: true,
  asarUnpack: [
    '**/*.node',
    '**/*.dll',
    '**/*.exe',
    '**/node-pty/**/*',
    '**/sharp/**/*',
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
    '!node_modules/**/*',
    { from: '../.build/runtime/node_modules', to: 'node_modules', filter: ['**/*'] },
    {
      from: 'build',
      to: 'runtime',
      filter: ['harness-node-entry.mjs', 'runtime-esm-register.mjs', 'runtime-esm-loader.mjs'],
    },
  ],
  extraResources: [
    { from: 'build/zerowall.patch.yml', to: 'zerowall.patch.yml' },
    { from: 'build/splash.html', to: 'splash.html' },
    { from: '../.build/resources/skills', to: 'skills', filter: ['**/*'] },
    { from: '../profiles/generated', to: 'profiles', filter: ['*.yml'] },
    { from: '../THIRD_PARTY_NOTICES.md', to: 'licenses/THIRD_PARTY_NOTICES.md' },
    { from: '../dsh/lock/upstream.json', to: 'licenses/deepseek-harness.version.json' },
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
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },
}

module.exports = common
