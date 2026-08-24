import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const source = resolve(root, 'dsh/source')
const expected = JSON.parse(await readFile(resolve(root, 'dsh/lock/upstream.json'), 'utf8'))
const manifest = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'))
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim()
const status = execFileSync('git', ['status', '--porcelain'], { cwd: source, encoding: 'utf8' }).trim()
if (manifest.version !== expected.version) throw new Error(`DSH version must be ${expected.version}, received ${manifest.version}`)
if (commit !== expected.commit) throw new Error(`DSH commit must be ${expected.commit}, received ${commit}`)
if (status !== '') throw new Error('dsh/source must be clean; commit DSH adaptations before building a release.')
const upstreamBase = execFileSync('git', ['merge-base', 'HEAD', expected.upstreamCommit], { cwd: source, encoding: 'utf8' }).trim()
if (upstreamBase !== expected.upstreamCommit) throw new Error(`DSH must derive from upstream rc2 ${expected.upstreamCommit}; merge-base is ${upstreamBase}`)
console.log(`Verified DSH ${manifest.version} at ${commit}, based on upstream rc2 ${expected.upstreamCommit}.`)
