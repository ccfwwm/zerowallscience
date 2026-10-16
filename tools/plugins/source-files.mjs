import { execFileSync } from 'node:child_process'
import { lstatSync } from 'node:fs'
import { join } from 'node:path'

export function isExportableSource(path) {
  // "secrets" is also the name of a legitimate source plugin. Only its
  // package root is exempt from the private-directory check below.
  const checkedPath = path.replace(/^plugins\/secrets\//u, 'plugins/secrets-plugin/')
  if (!/^(?:plugins\/|tools\/|config\/|tests\/|patches\/|schemas\/|resources\/extensions\/|desktop\/src\/shared\/)/u.test(path)
    && !/^(?:tsconfig.*\.json|vitest.*\.ts)$/u.test(path)
    && !['pnpm-lock.yaml', 'pnpm-workspace.yaml', '.gitmodules', 'LICENSE', 'LICENSE.md'].includes(path)) return false
  return !/(?:^|\/)(?:node_modules|artifacts|lib|payload|\.yarn|\.git|\.zerowall|__pycache__|user-data|credentials|secrets)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|p12|pfx|log|tsbuildinfo|sqlite|sqlite3|db)$/iu.test(checkedPath)
    && !/^plugins\/(?:dsh-auto-review|dsh-capability-menu)(?:\/|$)/u.test(path)
}

export function sourceFiles(root) {
  return [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean))].filter(path => {
    if (!isExportableSource(path)) return false
    // The index includes tracked files removed during an uncommitted layout
    // migration. They must not protect obsolete files in the export target.
    try { return lstatSync(join(root, path)).isFile() }
    catch (error) { if (error.code === 'ENOENT') return false; throw error }
  }).sort()
}
