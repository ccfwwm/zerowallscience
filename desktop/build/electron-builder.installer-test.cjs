const base = require('./electron-builder.stable.cjs')
const { version } = require('../package.json')
const key = version.replaceAll('.', '')

// Isolated registration keeps installer regression tests away from the user's app.
module.exports = {
  ...base,
  appId: `com.zerowall.science.installer-test-${key}`,
  productName: `ZeroWall Installer Test ${key}`,
  artifactName: `zerowall-installer-test-${version}.exe`,
  directories: { ...base.directories, output: `../.build/installer-test-${key}` },
  nsis: { ...base.nsis, shortcutName: `ZeroWall Installer Test ${key}` },
  publish: null,
}
