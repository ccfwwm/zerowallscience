import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))

export async function createWindowsReleaseMetadata(options) {
  const installer = resolve(options.installer)
  const bytes = await readFile(installer)
  const info = await stat(installer)
  const assetName = basename(installer)
  const releaseBaseUrl = options.releaseBaseUrl.replace(/\/$/, '')
  const assetUrl = `${releaseBaseUrl}/stable/releases/${options.version}/${assetName}`
  return {
    version: options.version,
    url: assetUrl,
    name: `ZeroWall Science ${options.version}`,
    notes: options.notes.trim(),
    publishedAt: options.publishedAt,
    assetUrl,
    assetName,
    assetSha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: info.size,
  }
}

async function main() {
  const desktopPackage = JSON.parse(await readFile(resolve(root, 'desktop/package.json'), 'utf8'))
  const version = String(desktopPackage.version)
  const installer = resolve(root, `desktop/dist/zerowall-science-${version}-win-x64.exe`)
  const notes = await readFile(resolve(root, `docs/release-notes-${version}.md`), 'utf8')
  const metadata = await createWindowsReleaseMetadata({
    installer,
    version,
    notes,
    publishedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    releaseBaseUrl: process.env.ZEROWALL_RELEASE_BASE_URL ?? 'https://zerowall.chengxunkeji.cn',
  })
  const payload = `${JSON.stringify(metadata, null, 2)}\n`
  const outputs = [
    resolve(root, `desktop/dist/zerowall-science-${version}-latest.json`),
    resolve(root, 'desktop/dist/releases-latest.json'),
    resolve(root, 'desktop/dist/releases-zerowallsciencedev-latest.json'),
  ]
  await Promise.all(outputs.map(output => writeFile(output, payload, 'utf8')))
  // electron-updater exposes this field on update-available, allowing the
  // desktop dialog to show the concrete fixes before download/installation.
  const feedPath = resolve(root, 'desktop/dist/latest.yml')
  const feed = await readFile(feedPath, 'utf8')
  const releaseNotes = notes.trim().split(/\r?\n/u).map(line => `  ${line}`).join('\n')
  const relativeAsset = `releases/${version}/${basename(installer)}`
  let nextFeed = feed
    .replace(/(^\s*- url: ).*$/mu, `$1${relativeAsset}`)
    .replace(/(^path: ).*$/mu, `$1${relativeAsset}`)
  nextFeed = /^releaseNotes:/mu.test(nextFeed)
    ? nextFeed.replace(/^releaseNotes:[\s\S]*$/mu, `releaseNotes: |-\n${releaseNotes}\n`)
    : `${nextFeed.replace(/\s*$/u, '')}\nreleaseNotes: |-\n${releaseNotes}\n`
  await writeFile(feedPath, nextFeed, 'utf8')
  for (const output of outputs) console.log(`Generated ${output}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
