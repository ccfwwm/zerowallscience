import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { contract } from './paths.mjs'

// Generated libraries keep their source package's dependency environment.
// Resolving a relative pnpm symlink through a junction otherwise rebases it.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith('file:')) {
      const parent = fileURLToPath(context.parentURL)
      let directory = dirname(parent)
      while (directory !== dirname(directory)) {
        let source
        try { source = JSON.parse(readFileSync(join(directory, '.source.json'), 'utf8')).source } catch {}
        if (source && !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.includes(':')) {
          try { return nextResolve(specifier, { ...context, parentURL: pathToFileURL(join(source, 'package.json')).href }) }
          catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error }
          // Peer dependencies are supplied by the artifact workspace's
          // shared module anchor when the source package has no local link.
          return nextResolve(specifier, { ...context, parentURL: pathToFileURL(join(contract.dev, '__resolution__.mjs')).href })
        }
        directory = dirname(directory)
      }
    }
    return nextResolve(specifier, context)
  },
})
