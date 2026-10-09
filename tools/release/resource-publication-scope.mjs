const allKinds = ['plugin', 'skill', 'mcp', 'python']

export function resourcePublicationScope(args) {
  if (args.length === 0) return { kinds: allKinds, receiptSuffix: '' }
  if (args.length === 2 && args[0] === '--kind' && allKinds.includes(args[1])) {
    return { kinds: [args[1]], receiptSuffix: `-${args[1]}` }
  }
  throw new Error('Usage: [--kind plugin|skill|mcp|python]')
}
