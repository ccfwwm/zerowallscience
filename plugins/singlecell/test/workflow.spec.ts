import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dataContract, geneCandidates, isDirectDataUrl, normalizeGene, validationFromContract } from '../src/host/index.js'

const temporary: string[] = []
afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('singlecell intake and data contract', () => {
  it('retains explicit targets even when recommendation limit is one', () => {
    const candidates = geneCandidates({ targetGenes: ['HSPA1A', 'STAT1'], maxCandidates: 1 })
    expect(candidates.map(item => item.symbol)).toEqual(expect.arrayContaining(['HSPA1A', 'STAT1']))
    expect(candidates.filter(item => item.confidence === 'high')).toHaveLength(2)
  })

  it('normalizes gene symbols without turning prose into a target', () => {
    expect(normalizeGene('  hspa1a ')).toBe('HSPA1A')
    expect(normalizeGene('')).toBe('')
  })

  it('does not accept arbitrary or credential-bearing download URLs', () => {
    expect(isDirectDataUrl('https://datasets.cellxgene.cziscience.com/01234567-89ab-cdef-0123-456789abcdef.h5ad')).toBe(true)
    expect(isDirectDataUrl('https://user:pass@datasets.cellxgene.cziscience.com/file.h5ad')).toBe(false)
    expect(isDirectDataUrl('https://example.com/file.h5ad')).toBe(false)
    expect(isDirectDataUrl('https://datasets.cellxgene.cziscience.com/file.pdf')).toBe(false)
  })

  it('accepts an integer CSV as a raw-count candidate but keeps QC as a later gate', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-singlecell-'))
    temporary.push(root)
    const path = join(root, 'counts.csv')
    await writeFile(path, 'gene,cell1,cell2\nHSPA1A,1,0\nSTAT1,2,3\n')
    const contract = dataContract(path, ['HSPA1A'])
    expect(contract.state).toBe('ready_for_qc')
    expect(validationFromContract(contract)).toMatchObject({ rawCounts: 'verified', ok: true, missingTargets: [] })
  })

  it('blocks normalized decimal data and opaque documents before runtime', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-singlecell-'))
    temporary.push(root)
    const decimal = join(root, 'normalized.tsv')
    await writeFile(decimal, 'gene\tcell1\nHSPA1A\t0.42\n')
    const decimalValidation = validationFromContract(dataContract(decimal, ['HSPA1A']))
    expect(decimalValidation.ok).toBe(false)
    expect(decimalValidation.rawCounts).toBe('not_verified')
    const pdf = join(root, 'notes.pdf')
    await writeFile(pdf, '%PDF-1.7')
    const pdfValidation = validationFromContract(dataContract(pdf, ['HSPA1A']))
    expect(pdfValidation.ok).toBe(false)
    expect(pdfValidation.errors.join(' ')).toContain('raw counts')
  })
})
