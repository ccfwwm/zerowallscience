const common = require('./electron-builder.base.cjs')
const fs = require('node:fs')
const path = require('node:path')
const verifyRuntimeFreshness = common.beforePack
common.beforePack = async context => {
  if (context.electronPlatformName === 'win32' && process.env.ZEROWALL_BUNDLE_PYTHON === '1') {
    const bootstrap = path.join(require('../../tools/build/paths.cjs').buildPaths().stage, 'python-base-3.12.10')
    const manifest = path.join(bootstrap, 'latest.json')
    const archive = path.join(bootstrap, 'zerowall-python-windows-x64-3.12.10.zip')
    if (!fs.existsSync(manifest) || !fs.existsSync(archive)) {
      throw new Error('Windows Stable packaging found no optional Python base resource. Use a separately built offline Python package when offline recovery is required.')
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
