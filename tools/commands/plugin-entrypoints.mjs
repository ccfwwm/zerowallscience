export function pluginRuntimeEntries(manifest) {
  const exports = []
  function visit(value) {
    if (typeof value === 'string') exports.push(value)
    else if (value && typeof value === 'object') for (const [condition, child] of Object.entries(value)) if (condition !== 'types') visit(child)
  }
  visit(manifest.exports)
  return [...new Set(['package.json', manifest.main, manifest.dsh?.bundle?.patch, ...exports, ...(manifest.zerowall?.runtimeFiles ?? [])]
    .filter(value => typeof value === 'string' && !value.includes('*') && !/\.tsx?$/u.test(value)).map(value => value.replace(/^\.\//u, '')))]
}
