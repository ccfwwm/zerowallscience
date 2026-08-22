const common = require('./electron-builder.base.cjs')

module.exports = {
  ...common,
  appId: 'com.zerowall.science.preview',
  productName: 'ZeroWallScience Preview',
  artifactName: 'zerowall-science-preview-${version}-${os}-${arch}.${ext}',
  extraMetadata: { zerowallChannel: 'preview', dependencies: {} },
  publish: [{ provider: 'generic', url: 'https://zerowall.chengxunkeji.cn/preview/' }],
}
