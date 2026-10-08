let runtimeAnchor
let profileAnchor

export function initialize(data) {
  runtimeAnchor = data?.anchor
  profileAnchor = data?.profileAnchor
}

export function resolve(specifier, context, nextResolve) {
  try {
    return nextResolve(specifier, context)
  } catch (error) {
    if (!['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(error?.code) || !runtimeAnchor || !isBareSpecifier(specifier)) throw error
    try { return nextResolve(specifier, { ...context, parentURL: runtimeAnchor }) }
    catch (fallbackError) {
      if (!profileAnchor || !['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(fallbackError?.code)) throw fallbackError
      return nextResolve(specifier, { ...context, parentURL: profileAnchor })
    }
  }
}

function isBareSpecifier(specifier) {
  return !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('node:') && !specifier.includes(':')
}
