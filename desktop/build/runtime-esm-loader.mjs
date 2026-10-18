let runtimeAnchor
let profileAnchor
let dependenciesAnchor

export function initialize(data) {
  runtimeAnchor = data?.anchor
  profileAnchor = data?.profileAnchor
  dependenciesAnchor = data?.dependenciesAnchor
}

export function resolve(specifier, context, nextResolve) {
  // Historical Harness homes can retain profiles/node_modules links to a
  // different DSH build. Core identities always belong to this installation;
  // neither a parent directory nor a plugin-local shadow may replace them.
  // Synchronous hooks apply the same rule to CommonJS and ESM resolution.
  if (runtimeAnchor && specifier.startsWith('@deepseek-ai/')) {
    return nextResolve(specifier, { ...context, parentURL: runtimeAnchor })
  }
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
    for (const anchor of [profileAnchor, dependenciesAnchor, runtimeAnchor].filter(Boolean)) {
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
