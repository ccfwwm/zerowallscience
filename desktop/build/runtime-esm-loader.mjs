let runtimeAnchor
let profileAnchor
let generationAnchor

export function initialize(data) {
  runtimeAnchor = data?.anchor
  profileAnchor = data?.profileAnchor
  generationAnchor = data?.generationAnchor
}

export function resolve(specifier, context, nextResolve) {
  // Electron returns the physical path for unpacked entries. Their package
  // neighbours still live in the archive. Resolve from the same logical
  // importer before using shared anchors, preserving nested/peer instances,
  // package imports and ESM export conditions.
  try {
    const logicalContext = context.parentURL?.includes('.asar.unpacked/')
      ? { ...context, parentURL: context.parentURL.replace('.asar.unpacked/', '.asar/') }
      : context
    return nextResolve(specifier, logicalContext)
  } catch (error) {
    if (!['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(error?.code) || !runtimeAnchor || !isBareSpecifier(specifier)) throw error
    for (const anchor of [profileAnchor, generationAnchor, runtimeAnchor].filter(Boolean)) {
      try { return nextResolve(specifier, { ...context, parentURL: anchor }) }
      catch (fallbackError) {
        if (!['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(fallbackError?.code)) throw fallbackError
      }
    }
    throw error
  }
}

function isBareSpecifier(specifier) {
  return !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('node:') && !specifier.includes(':')
}
