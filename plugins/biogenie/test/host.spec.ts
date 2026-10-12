import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ZeroWallPythonService } from '../../python/src/host/index.js'
import { registerBioLocal } from '../src/host/index.js'
import { verifyBioPayload } from '../src/host/payload.js'
const roots: string[] = []
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'biogenie-installed-')); roots.push(root)
  const payload = join(root, 'plugin/payload'); await cp(resolve(import.meta.dirname, '../payload'), payload, { recursive: true, dereference: true })
  const tools = new Map<string, any>(); const run = vi.fn()
  registerBioLocal({ tools: { register: (tool: any) => tools.set(tool.name, tool) } } as never, run, payload)
  return { root, payload, tools, run, exec: { signal: new AbortController().signal, agent: { session: { header: { cwd: root } } } } }
}
it('discovers 59 installed operations without Python or a workspace and rejects missing/extra resources', async () => {
  const f = await setup(); const tool = f.tools.get('bio_local')
  expect((await tool.execute({ action: 'list' }, { signal: new AbortController().signal })).operations).toHaveLength(59)
  expect(await tool.execute({ action: 'describe', operation: 'seq_translate' }, {})).toMatchObject({ id: 'seq_translate' })
  expect(f.run).not.toHaveBeenCalled()
  await writeFile(join(f.payload, 'python/injected.py'), 'print(1)')
  await expect(verifyBioPayload(f.payload)).rejects.toThrow('unowned payload')
  await rm(join(f.payload, 'python/injected.py'))
  await rm(join(f.payload, 'python/zerowall_bridge.py'))
  await expect(tool.execute({ action: 'list' }, {})).rejects.toThrow('BIOGENIE_RESOURCE_INVALID')
})
describe.skipIf(!process.env.ZEROWALL_TEST_BIOGENIE_RUNTIME)('real BioGenie fixed-interpreter algorithms', () => {
  it('runs sequence/file/SBOL/formal DE/GSEA/grouped ML/plot operations from an installed payload', async () => {
    const f = await setup()
    vi.stubEnv('ZEROWALL_PYTHON_RUNTIME_ROOT', process.env.ZEROWALL_TEST_BIOGENIE_RUNTIME!)
    const python = new ZeroWallPythonService(new Context())
    f.run.mockImplementation((args, exec) => python.run(args, exec))
    const call = (operation: string, args: unknown) => f.tools.get('bio_local').execute({ action: 'run', operation, arguments: args }, f.exec)
    const translated = await call('seq_translate', { sequence: 'ATGGCCATTGTA' })
    expect(translated).toMatchObject({ ok: true, result: { protein: 'MAIV' }, provenance: { version: '0.6.48', executable: join(process.env.ZEROWALL_TEST_BIOGENIE_RUNTIME!, 'python.exe') } })
    await writeFile(join(f.root, 'one.fasta'), '>one\nATGGCCATTGTA\n')
    expect(await call('seq_translate', { sequence: 'one.fasta' })).toMatchObject({ ok: true, result: { protein: 'MAIV' } })
    await writeFile(join(f.root, 'multiple.fasta'), '>one\nATGGCC\n>two\nATGGCC\n')
    expect(await call('seq_translate', { sequence: 'multiple.fasta' })).toMatchObject({ ok: false })
    expect(await call('seq_translate', { sequence: '../outside.fasta' })).toMatchObject({ ok: false })
    const sbol = await call('sbol_write', { components: [{ name: 'promoter', sequence: 'ATGGCC', role: 'promoter' }], output_file: 'design.xml' })
    expect(sbol, JSON.stringify(sbol)).toMatchObject({ ok: true, result: { n_components: 1 } })
    const genes = Array.from({ length: 100 }, (_, i) => 'G' + i)
    const samples = Array.from({ length: 8 }, (_, i) => 'S' + i)
    await writeFile(join(f.root, 'counts.csv'), 'gene,' + samples.join(',') + '\n' + genes.map((gene, g) => gene + ',' + samples.map((_, s) => Math.floor((30 + g * 3) * (g < 20 && s >= 4 ? 3 : 1) * (0.6 + ((g * 11 + s * 7) % 17) / 20))).join(',')).join('\n'))
    await writeFile(join(f.root, 'meta.csv'), 'sample,condition\n' + samples.map((s, i) => `${s},${i < 4 ? 'ctrl' : 'trt'}`).join('\n'))
    const de = await call('deseq2', { counts_file: 'counts.csv', meta_file: 'meta.csv', contrast: 'trt_vs_ctrl', out_csv: 'de.csv' })
    expect(de, JSON.stringify(de)).toMatchObject({ ok: true, result: { method: { backend: 'pydeseq2' } } })
    await writeFile(join(f.root, 'sets.gmt'), 'UP\tlocal\t' + genes.slice(0, 20).join('\t') + '\nDOWN\tlocal\t' + genes.slice(50, 75).join('\t') + '\n')
    const gsea = await call('gsea', { de_results_file: 'de.csv', gene_set_file: 'sets.gmt', permutation_num: 20, min_size: 5, out_csv: 'gsea.csv' })
    expect(gsea, JSON.stringify(gsea)).toMatchObject({ ok: true, result: { method: { backend: 'gseapy' } } })
    await writeFile(join(f.root, 'ml.csv'), 'x,z,patient,label\n' + Array.from({ length: 60 }, (_, i) => `${i % 2 + i / 100},${i % 7},P${Math.floor(i / 3)},${i % 2}`).join('\n'))
    const ml = await call('ml_pipeline', { path: 'ml.csv', target: 'label', group_col: 'patient', cv: 3 })
    expect(ml, JSON.stringify(ml)).toMatchObject({ ok: true })
    expect(JSON.stringify(ml.result)).toContain('group')
    const plot = await call('plasmid_map', { sequence: 'ATGGCC'.repeat(100), features: [{ start: 20, end: 150, name: 'gene', type: 'CDS' }], out_file: 'plasmid.png' })
    expect(plot, JSON.stringify(plot)).toMatchObject({ ok: true })
    expect(plot.result.graphic).toBe(true)
    await writeFile(join(f.root, 'acceptance.json'), JSON.stringify({ translated, sbol, de, gsea, ml, plot }, null, 2))
    if (process.env.ZEROWALL_TEST_BIOGENIE_RECEIPT) await cp(join(f.root, 'acceptance.json'), process.env.ZEROWALL_TEST_BIOGENIE_RECEIPT)
  }, 180_000)
})
