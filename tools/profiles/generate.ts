import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import development from '../../profiles/sources/development.ts'
import preview from '../../profiles/sources/preview.ts'
import stable from '../../profiles/sources/stable.ts'

const root = resolve(import.meta.dirname, '../..')
const check = process.argv.includes('--check')

for (const source of [development, preview, stable]) {
  const output = [
    'version: 1',
    `id: zerowall-${source.id}`,
    `channel: ${source.channel}`,
    'dsh: 0.1.1-rc.2',
    'plugins:',
    ...source.plugins.map(name => `  - '${name}'`),
    'wechat:',
    `  enabled: ${source.wechat.enabled}`,
    `  autoConnect: ${source.wechat.autoConnect}`,
    `  channel: ${source.wechat.channel}`,
    `  dmPolicy: ${source.wechat.dmPolicy}`,
    `  groupPolicy: ${source.wechat.groupPolicy}`,
    '',
  ].join('\n')
  const path = resolve(root, 'profiles/generated', `${source.id}.yml`)
  if (check) {
    const current = await readFile(path, 'utf8').catch(() => '')
    if (current !== output) throw new Error(`Generated profile is stale: ${path}`)
  } else {
    await mkdir(resolve(root, 'profiles/generated'), { recursive: true })
    await writeFile(path, output)
  }
}
