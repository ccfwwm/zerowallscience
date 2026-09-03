const REQUIRED_INJECTION = 'conversation'
const INJECT_ANCHORS = ['slots', 'sessions', 'connection', 'workspaces', 'locale', 'modules']

export function adaptBetterSidebarClient(source) {
  // v0.18.0 emits the ModuleLoader registration contract. Its service
  // lookups are resolved by the module table, so the legacy inject rewrite
  // must not inspect incidental `ctx.get("conversation")` strings in the
  // compiled bundle.
  if (source.includes('window.__ModuleLoader__.load(')) return source

  // Current Sidebar main no longer reads the conversation service directly.
  // Older snapshots did, so keep the compatibility injection for those bundles.
  if (!source.includes('ctx.get("conversation")')) return source

  const declaration = findClientInjectDeclaration(source)
  // A bundle that still accesses conversation must expose the legacy inject
  // declaration so the host can provide the service. If no unambiguous
  // declaration exists, fail closed instead of shipping a bundle that will
  // crash only after the client mounts.
  if (declaration === null) {
    throw new Error('Expected one dsh-better-sidebar client inject declaration')
  }
  if (declaration.names.includes(REQUIRED_INJECTION)) return source

  const slots = declaration.text.match(/([\t ]*)["']slots["'],?/u)
  if (slots === null) throw new Error('dsh-better-sidebar client injection declaration has no slots anchor.')
  const separator = slots[0].endsWith(',') ? '' : ','
  const replacement = `${slots[0]}${separator}\n${slots[1]}"${REQUIRED_INJECTION}",`
  const adaptedDeclaration = declaration.text.replace(slots[0], replacement)
  const adapted = source.slice(0, declaration.index)
    + adaptedDeclaration
    + source.slice(declaration.index + declaration.text.length)

  assertBetterSidebarConversationInjection(adapted)
  return adapted
}

export function assertBetterSidebarConversationInjection(source) {
  if (!source.includes('ctx.get("conversation")')) return
  const declaration = findClientInjectDeclaration(source)
  if (declaration === null) return
  if (!declaration.names.includes(REQUIRED_INJECTION)) {
    throw new Error('dsh-better-sidebar accesses conversation without declaring it in the client inject list.')
  }
}

function findClientInjectDeclaration(source) {
  const matches = [...source.matchAll(/const inject = \[[\s\S]*?\];/gu)]
    .map(match => ({
      index: match.index,
      text: match[0],
      names: [...match[0].matchAll(/["']([^"']+)["']/gu)].map(value => value[1]),
    }))
    .filter(match => INJECT_ANCHORS.every(name => match.names.includes(name)))

  if (matches.length !== 1) return null
  return matches[0]
}
