import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const version = JSON.parse(await readFile(resolve(root, 'desktop/package.json'), 'utf8')).version
const dist = resolve(root, 'desktop/dist')
for (const name of [
  `zerowall-science-${version}-latest.json`,
  'latest.yml',
  'releases-latest.json',
  'releases-zerowallsciencedev-latest.json',
]) await access(resolve(dist, name))
const metadata = JSON.parse(await readFile(resolve(dist, `zerowall-science-${version}-latest.json`), 'utf8'))
if (metadata.version !== version || !String(metadata.assetUrl).includes(`/stable/releases/${version}/`)) {
  throw new Error(`Stable update metadata does not point at ${version}.`)
}
const feed = await readFile(resolve(dist, 'latest.yml'), 'utf8')
const expectedFeedPath = `releases/${version}/zerowall-science-${version}-win-x64.exe`
if (!feed.includes(`path: ${expectedFeedPath}`) || !feed.includes(`url: ${expectedFeedPath}`)) {
  throw new Error(`Stable updater feed must point at ${expectedFeedPath}.`)
}
console.log(`Stable update metadata verified for ${version}.`)
