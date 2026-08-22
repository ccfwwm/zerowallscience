let runtimeAnchor

export function initialize(data) {
  runtimeAnchor = data?.anchor
}

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !runtimeAnchor || !isBareSpecifier(specifier)) throw error
    return nextResolve(specifier, { ...context, parentURL: runtimeAnchor })
  }
}

function isBareSpecifier(specifier) {
  return !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('node:') && !specifier.includes(':')
}
