import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commitFixedRuntime, restoreFixedTransaction, recoverFixedTransactions } from '../src/main/python-fixed-transaction.js'

async function fixture(run: (root: string, candidate: string, base: string) => Promise<void>) {
  const base = await mkdtemp(join(tmpdir(), 'zws-fixed-tx-'))
  const root = join(base, 'Python'), candidate = join(base, 'candidate')
  await mkdir(root); await mkdir(candidate)
  try { await run(root, candidate, base) } finally { await rm(base, { recursive: true, force: true }) }
}
describe('fixed directory transactions', () => {
  it('restores replaced files, preserves user files, and removes new owned files', () => fixture(async (root, candidate) => {
    await writeFile(join(root, 'python.exe'), 'old'); await writeFile(join(root, 'user.txt'), 'user')
    await writeFile(join(candidate, 'python.exe'), 'new'); await writeFile(join(candidate, 'python312.dll'), 'dll')
    const id = await commitFixedRuntime(root, candidate, async () => { expect(await readFile(join(root, 'python.exe'), 'utf8')).toBe('new') })
    await restoreFixedTransaction(root, id)
    expect(await readFile(join(root, 'python.exe'), 'utf8')).toBe('old')
    expect(await readFile(join(root, 'user.txt'), 'utf8')).toBe('user')
    await expect(readFile(join(root, 'python312.dll'))).rejects.toThrow()
    await restoreFixedTransaction(root, id)
  }))
  it('rolls back failed verification at the same path', () => fixture(async (root, candidate) => {
    await writeFile(join(root, 'python.exe'), 'old'); await writeFile(join(candidate, 'python.exe'), 'bad')
    await expect(commitFixedRuntime(root, candidate, async () => { throw new Error('health failed') })).rejects.toThrow('health failed')
    expect(await readFile(join(root, 'python.exe'), 'utf8')).toBe('old')
  }))
  it('recovers a durable interrupted package transaction including removed files', () => fixture(async (root, candidate) => {
    await mkdir(join(root, 'Lib', 'site-packages'), { recursive: true })
    await writeFile(join(root, 'Lib', 'site-packages', 'old.py'), 'old')
    await writeFile(join(candidate, 'new.py'), 'new')
    const id = await commitFixedRuntime(root, candidate, async () => {}, { prefix: 'Lib/site-packages', removals: ['Lib/site-packages/old.py'] })
    const path = join(root, '.zerowall', 'transactions', id, 'journal.json')
    const record = JSON.parse(await readFile(path, 'utf8')); record.state = 'applying'; await writeFile(path, JSON.stringify(record))
    await recoverFixedTransactions(root)
    expect(await readFile(join(root, 'Lib', 'site-packages', 'old.py'), 'utf8')).toBe('old')
    await expect(readFile(join(root, 'Lib', 'site-packages', 'new.py'))).rejects.toThrow()
  }))
  it('rejects a linked ancestor before modifying external files', () => fixture(async (root, candidate, base) => {
    const external = join(base, 'external'); await mkdir(external)
    await writeFile(join(external, 'keep.py'), 'keep')
    await symlink(external, join(root, 'Lib'), process.platform === 'win32' ? 'junction' : 'dir')
    await mkdir(join(candidate, 'Lib')); await writeFile(join(candidate, 'Lib', 'keep.py'), 'bad')
    await expect(commitFixedRuntime(root, candidate, async () => {})).rejects.toThrow('link')
    expect(await readFile(join(external, 'keep.py'), 'utf8')).toBe('keep')
  }))
})
