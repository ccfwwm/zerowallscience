/** Exact published entry bundle adapter; upstream sources are never changed. */
export function adaptLibreOfficeKit(source, version) {
  if (version !== '0.1.2') throw new Error('LibreOfficeKit adapter requires reviewed version 0.1.2.')
  const anchor = 'const root = dirname(packageFile);'
  if (source.split(anchor).length !== 2) throw new Error('LibreOfficeKit physical-path anchor changed.')
  return source.replace(anchor, String.raw`const root = dirname(packageFile).replace(/app\.asar([\\/])/g, 'app.asar.unpacked$1');`)
}
