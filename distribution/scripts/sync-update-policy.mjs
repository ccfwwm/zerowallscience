/** Generate the Desktop installation's business override policy from the Science composition. */
import { readFile, writeFile } from 'node:fs/promises'
const science = JSON.parse(await readFile(new URL('../science/package.json', import.meta.url), 'utf8'))
const path = new URL('../../apps/desktop-host/package.json', import.meta.url)
const host = JSON.parse(await readFile(path, 'utf8'))
const policy = [...science.zerowall.defaultBundles, science.name].filter(name => name.startsWith('@zerowall/'))
if (process.argv.slice(2).some(argument => !['--write', '--check'].includes(argument))) throw new Error('Expected --write or --check')
if (process.argv.includes('--write')) {
  host.dsh = { ...host.dsh, installation: { ...host.dsh?.installation, profileOverrides: policy } }
  await writeFile(path, JSON.stringify(host, null, 2) + '\n')
} else if (JSON.stringify(host.dsh?.installation?.profileOverrides) !== JSON.stringify(policy)) {
  throw new Error('Desktop update policy differs from Science; run node distribution/scripts/sync-update-policy.mjs --write')
}
console.log('Verified Science business update policy (' + policy.length + ' packages)')
