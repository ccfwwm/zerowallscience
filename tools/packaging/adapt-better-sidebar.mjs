const REQUIRED_INJECTION = 'conversation'
const INJECT_ANCHORS = ['slots', 'sessions', 'connection', 'workspaces', 'locale', 'modules']

export function adaptBetterSidebarClient(source) {
  // Current Sidebar main no longer reads the conversation service directly.
  // Older snapshots did, so keep the compatibility injection for those bundles.
  if (!source.includes('ctx.get("conversation")')) return source

  const declaration = findClientInjectDeclaration(source)
  // Sidebar 0.19+ resolves services through the injected module system and
  // no longer emits the legacy `const inject = [...]` declaration. In that
  // layout there is nothing to rewrite; preserve the upstream client bundle.
  if (declaration === null) return source
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
