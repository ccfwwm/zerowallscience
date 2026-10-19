import { readFileSync } from 'node:fs'

const pin = JSON.parse(readFileSync(new URL('../../config/integrations/upstream-sources.json', import.meta.url), 'utf8')).libreOfficeKit

/** Exact published entry bundle adapter; upstream sources are never changed. */
export function adaptLibreOfficeKit(source, version) {
  if (!Array.isArray(pin.runtimeVersions) || !pin.runtimeVersions.includes(pin.version) || !pin.runtimeVersions.includes(version)) throw new Error(`LibreOfficeKit adapter requires a configured version (${pin.runtimeVersions?.join(', ')}), got ${version}.`)
  const anchor = 'const root = dirname(packageFile);'
  if (source.split(anchor).length !== 2) throw new Error('LibreOfficeKit physical-path anchor changed.')
  return source.replace(anchor, String.raw`const root = dirname(packageFile).replace(/app\.asar([\\/])/g, 'app.asar.unpacked$1');`)
}
