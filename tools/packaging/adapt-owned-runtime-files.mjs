/** Literal manifest files must not expand into their whole parent directory. */
export function ownedRuntimeEntries(files) {
  return [...new Set(files.filter(entry => typeof entry === 'string' && !entry.startsWith('!')).map(pattern => {
    const path = pattern.replaceAll('\\', '/')
    if (!path || path.startsWith('/') || /^[a-z]:/iu.test(path) || path.split('/').includes('..')) throw new Error(`Invalid runtime package path: ${pattern}`)
    const [root] = path.split('/')
    if (/[?*[]/u.test(root)) throw new Error(`Unsupported root-level package pattern: ${pattern}`)
    // Keep existing directory/glob handling; exact script and asset entries
    // copy only that file, excluding adjacent development models and tests.
    return /[?*[]/u.test(path) ? root : path
  }))]
}
