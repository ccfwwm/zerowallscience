const base = require('./electron-builder.stable.cjs')
const { version } = require('../package.json')
const key = version.replaceAll('.', '')

// Isolated registration keeps installer regression tests away from the user's app.
// The wrapper include is deliberately test-only: it defines a compile-time NSIS
// guard that skips production PATH ownership and legacy 2.x migration probes.
// Keep the production include unchanged so the formal installer follows the
// exact same lifecycle when this config is not selected.
module.exports = {
  ...base,
  appId: `com.zerowall.science.installer-test-${key}`,
  productName: `ZeroWall Installer Test ${key}`,
  artifactName: `zerowall-installer-test-${version}.exe`,
  directories: { ...base.directories, output: require('../../tools/build/paths.cjs').buildPaths().verification + `/installer-test-${key}` },
  nsis: {
    ...base.nsis,
    include: 'build/installer-test.nsh',
    shortcutName: `ZeroWall Installer Test ${key}`,
  },
  publish: null,
  afterAllArtifactBuild: async result => {
    const { pathToFileURL } = require('node:url')
    const { resolve } = require('node:path')
    const { writeInstallerTestContract } = await import(pathToFileURL(resolve(__dirname, '../../tools/packaging/installer-test-contract.mjs')).href)
    return writeInstallerTestContract(result, version)
  },
}
