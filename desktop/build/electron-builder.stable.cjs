const common = require('./electron-builder.base.cjs')
const path = require('node:path')
const verifyRuntimeFreshness = common.beforePack
common.beforePack = async context => {
  if (context.electronPlatformName === 'win32') {
    const bootstrap = path.join(require('../../tools/build/paths.cjs').buildPaths().stage, 'python-base-3.12.10')
    const manifest = path.join(bootstrap, 'latest.json')
    const archive = path.join(bootstrap, 'zerowall-python-windows-x64-3.12.10.zip')
    const { pathToFileURL } = require('node:url')
    const { verifyBundledPython } = await import(pathToFileURL(path.resolve(__dirname, '../../tools/packaging/bundled-python.mjs')).href)
    await verifyBundledPython(path.resolve(__dirname, '../..'), manifest, archive)
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
