const common = require('./electron-builder.base.cjs')

module.exports = {
  ...common,
  appId: 'com.zerowall.science',
  productName: 'ZeroWallScience',
  artifactName: 'zerowall-science-${version}-${os}-${arch}.${ext}',
  extraMetadata: { zerowallChannel: 'stable', dependencies: {}, devDependencies: {} },
  nsis: { ...common.nsis, shortcutName: 'ZeroWallScience' },
  publish: [{ provider: 'generic', url: 'https://zerowall.chengxunkeji.cn/stable/' }],
}
