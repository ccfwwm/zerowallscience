const base = require('./electron-builder.stable.cjs')

// Isolated registry identity and shortcuts: never replace a user's installation.
module.exports = {
  ...base,
  appId: 'com.zerowall.science.installer-test-640',
  productName: 'ZeroWall Installer Test 640',
  artifactName: 'zerowall-installer-test-6.4.0.exe',
  directories: { ...base.directories, output: '../.build/installer-test-640' },
  nsis: { ...base.nsis, shortcutName: 'ZeroWall Installer Test 640' },
  publish: null,
}
