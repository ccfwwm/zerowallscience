/** Exact published entry bundle adapter; upstream sources are never changed. */
export function adaptLibreOfficeKit(source, version) {
  // The pinned DSH desktop-host currently resolves the kit to 0.1.1, while
  // the same reviewed source shape is also used by 0.1.2. Keep the adapter
  // explicit about the reviewed versions instead of tying it to one lockfile
  // resolution.
  if (!new Set(['0.1.1', '0.1.2']).has(version)) throw new Error(`LibreOfficeKit adapter requires a reviewed version (0.1.1 or 0.1.2), got ${version}.`)
  const anchor = 'const root = dirname(packageFile);'
  if (source.split(anchor).length !== 2) throw new Error('LibreOfficeKit physical-path anchor changed.')
  return source.replace(anchor, String.raw`const root = dirname(packageFile).replace(/app\.asar([\\/])/g, 'app.asar.unpacked$1');`)
}
