/** Explicit ZeroWall unsigned official release lane; no signing secrets or upload credentials enter the build. */
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { packageTarget, resolveDesktopPackageTarget } from './package-target.ts'
import { localUnsignedPackageEnvironment, validateDesktopPackageEnvironment } from './desktop-package-environment.mjs'
import { createPackagingRun } from './packaging-run.mjs'
import { requireDesktopToolchain } from './desktop-toolchain-preflight.ts'
import { resolveZeroWallReleaseConfig } from './zerowall-release-config.mjs'
import { desktopBuildCommitEnvironment, readDesktopBuildCommit } from './desktop-build-commit.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const { values } = parseArgs({ options: { dir: { type: 'boolean', default: false }, check: { type: 'boolean', default: false } } })
const target = resolveDesktopPackageTarget('win-x64')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version as string
if (!/^9\.\d+\.\d+$/u.test(version)) throw new Error('ZeroWall stable packaging requires a stable 9.x product version')
const environment: NodeJS.ProcessEnv = { ...localUnsignedPackageEnvironment(),
  ...desktopBuildCommitEnvironment(readDesktopBuildCommit(resolve(root,
    '../..'))),
  ZEROWALL_OFFICIAL_UNSIGNED: '1', DSH_DESKTOP_APP_ID: 'com.zerowall.science', DSH_DESKTOP_UPDATE_PROVIDER: 'qiniu',
  DSH_DESKTOP_AUTO_UPDATE_ENV: 'production', DSH_DESKTOP_UPDATE_CHANNEL: 'latest', DSH_CLIENT_VERSION: version,
  DSH_DESKTOP_BUILD_VERSION: version }
resolveZeroWallReleaseConfig(environment, 'win32', 'x64')
validateDesktopPackageEnvironment(environment, target, { unsigned: true })
await requireDesktopToolchain('win32', environment)
if (!values.check) {
  const run = createPackagingRun(join(root, '.desktop-build/packaging-runs'), { target: 'win-x64', version, productVersion: version,
    unsigned: true,
    officialUnsigned: true,
    directory: values.dir,
    prepareOnly: false,
    node: process.version },
  { parallel: true,
    secrets: [] })
  environment.DSH_DESKTOP_PACKAGING_RUN_DIR = run.directory
  process.env.DSH_DESKTOP_PACKAGING_RUN_DIR = run.directory
  let success = false
  try {
    await packageTarget({ target, unsigned: true, directory: values.dir, prepareOnly: false, skipNotarization: false,
      check: false, requestedBuildVersion: undefined }, environment, run)
    success = true
  } finally { run.finish(success) }
}
