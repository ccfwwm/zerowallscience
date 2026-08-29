import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const source = resolve(root, 'deepseek-harness')
const expected = JSON.parse(await readFile(resolve(root, 'config/deepseek-harness/upstream.json'), 'utf8'))
const manifest = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'))

const commit = git(['rev-parse', 'HEAD'])
const branch = git(['branch', '--show-current'])
const status = git(['status', '--porcelain'])
const upstreamBase = git(['merge-base', 'HEAD', expected.upstreamCommit])
const upstreamIsAncestor = runGit(['merge-base', '--is-ancestor', expected.upstreamCommit, 'HEAD'])

if (manifest.version !== expected.version) throw new Error(`DSH version must be ${expected.version}, received ${manifest.version}`)
if (commit !== expected.commit) throw new Error(`DSH commit must be ${expected.commit}, received ${commit}`)
if (branch !== expected.branch) throw new Error(`DSH branch must be ${expected.branch}, received ${branch || '(detached)'}`)
if (status !== '') throw new Error(`deepseek-harness contains uncommitted changes:\n${status}`)
if (!upstreamIsAncestor || upstreamBase !== expected.upstreamCommit) {
  throw new Error(`DSH must derive from upstream ${expected.tag} at ${expected.upstreamCommit}; merge-base is ${upstreamBase}`)
}

const trackedPaths = git(['ls-files']).split(/\r?\n/u)
for (const value of ['packages/client/runtime', 'packages/host/apiproxy']) {
  if (trackedPaths.some(path => path.startsWith(value))) {
    throw new Error(`DSH alpha fork still tracks removed rc2 path: ${value}`)
  }
}

console.log(`Verified DSH ${manifest.version} at ${commit} on ${branch}, based on ${expected.tag}.`)

function git(args) {
  return execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim()
}

function runGit(args) {
  try {
    execFileSync('git', args, { cwd: source, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
