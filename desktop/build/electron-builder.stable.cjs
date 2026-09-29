const common = require('./electron-builder.base.cjs')
const fs = require('node:fs')
const path = require('node:path')
const verifyRuntimeFreshness = common.beforePack
common.beforePack = async context => {
  if (context.electronPlatformName === 'win32') {
    const bootstrap = path.resolve(__dirname, '../dist/python-base-3.12.10')
    const manifest = path.join(bootstrap, 'latest.json')
    const archive = path.join(bootstrap, 'zerowall-python-windows-x64-3.12.10.zip')
    if (!fs.existsSync(manifest) || !fs.existsSync(archive)) {
      throw new Error('Windows Stable packaging requires the signed Python 3.12.10 base manifest and archive in desktop/dist/python-base-3.12.10. Prepare the signed base before packaging.')
    }
  }
  await verifyRuntimeFreshness(context)
}

module.exports = {
  ...common,
  appId: 'com.zerowall.science',
  productName: 'ZeroWall Science',
  executableName: 'ZeroWallScience',
  artifactName: 'zerowall-science-${version}-${os}-${arch}.${ext}',
  extraMetadata: { zerowallChannel: 'stable', dependencies: {}, devDependencies: {} },
  nsis: { ...common.nsis, shortcutName: 'ZeroWall Science' },
  publish: [{ provider: 'generic', url: 'https://zerowall.chengxunkeji.cn/stable/' }],
}
