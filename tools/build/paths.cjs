const { readFileSync, existsSync } = require('node:fs')
const { resolve, join } = require('node:path')
const root = resolve(__dirname, '../..')
function buildPaths(repositoryRoot = root) {
  const version = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')).version
  const artifacts = resolve(process.env.ZEROWALL_ARTIFACT_ROOT || join(repositoryRoot, 'artifacts'))
  const active = join(artifacts, 'stage', version, 'current.json')
  const buildId = process.env.ZEROWALL_BUILD_ID || (existsSync(active) ? JSON.parse(readFileSync(active, 'utf8')).buildId : `${version}-dev`)
  if (!/^[a-zA-Z0-9._-]+$/.test(buildId)) throw new Error('Invalid build ID')
  const target = process.env.ZEROWALL_TARGET || (process.platform === 'win32' ? 'windows-x64' : `macos-${process.arch}`)
  return { root: repositoryRoot, version, buildId, target, artifacts, active,
    stage: join(artifacts, 'stage', version, buildId), dev: join(artifacts, 'dev'),
    packages: resolve(process.env.ZEROWALL_PACKAGE_OUTPUT || join(artifacts, 'packages', version, target)),
    verification: join(artifacts, 'verification', version), release: join(artifacts, 'release', version),
    cache: join(artifacts, 'cache'), logs: join(artifacts, 'logs', version) }
}
module.exports = { buildPaths }
