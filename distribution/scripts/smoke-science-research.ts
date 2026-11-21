/** Exercise the generated suite with real managed environments and bounded public-service probes. */
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'
import { UvRuntime } from '../plugins/dsh-plugin-python/src/host/uv-runtime.ts'
import { readScienceCapability } from '../plugins/dsh-plugin-python/src/host/science-capabilities.ts'
import { prepareImport } from '../plugins/dsh-plugin-skills/src/host/importer.ts'
import { tmpdir } from 'node:os'
import { rm } from 'node:fs/promises'

const root = fileURLToPath(new URL('../../', import.meta.url))
const work = join(root, '.artifacts/science-research')
const basePython = resolve(process.env.DSH_TEST_PYTHON_EXECUTABLE ?? join(root, 'apps/desktop/.desktop-build/targets/win-x64/runtime/primary-runtime/dependencies/python/python.exe'))
const publishedAssets = join(root, 'distribution/plugins/dsh-plugin-python/resources/runtime')
const assetsRoot = join(work, 'smoke-assets')
await mkdir(assetsRoot, { recursive: true })
const payload = JSON.parse(await readFile(join(publishedAssets, 'runtime.json'), 'utf8'))
await writeFile(join(assetsRoot, 'runtime.json'), JSON.stringify({ ...payload, requirements: 'core.lock', revision: createHash('sha256').update('').digest('hex'), imports: [], files: [], packageCount: 0 }))
await writeFile(join(assetsRoot, 'core.lock'), '')
await writeFile(join(assetsRoot, 'core.in'), '')
await writeFile(join(assetsRoot, 'science-capabilities.json'), await readFile(join(publishedAssets, 'science-capabilities.json')))
const runtime = new UvRuntime({ basePython, environmentRoot: join(work, 'managed-environments'), assetsRoot, uv: join(publishedAssets, payload.uv), indexUrl: 'https://pypi.org/simple', timeoutMs: 600_000 })
const suiteArchive = join(root, 'market/catalog/science-research/1.0.0.zip')
const archive = unzipSync(await readFile(suiteArchive))
const suite = join(work, 'suite')
for (const [path, body] of Object.entries(archive)) { const target = join(suite, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, body) }
const workspace = await mkdtemp(join(work, '工作区 with spaces-'))
const importStage = await mkdtemp(join(tmpdir(), 'science-suite-import-'))
const observations: { skill: string; scenario: string; exitCode: number | null; output: string }[] = []

async function run(executable: string, args: string[], skill: string, scenario: string): Promise<void> {
  await new Promise<void>((accept, reject) => {
    const child = spawn(executable, args, { cwd: workspace, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let timedOut = false
    child.stdout.on('data', chunk => { output = (output + String(chunk)).slice(-4000) })
    child.stderr.on('data', chunk => { output = (output + String(chunk)).slice(-4000) })
    const timer = setTimeout(() => { timedOut = true; child.kill() }, 120_000)
    child.once('error', reject)
    child.once('close', code => {
      clearTimeout(timer)
      observations.push({ skill, scenario, exitCode: code, output })
      console.log(`${skill}: ${scenario}: exit=${code}${timedOut ? ' timeout' : ''}`)
      if (code !== 0 || timedOut) reject(new Error(`${skill} ${scenario} failed: ${output}`))
      else accept()
    })
  })
}

try {
  const prepared = await prepareImport(suiteArchive, importStage, new Set())
  if (prepared.preview.skills.length !== 40 || new Set(prepared.preview.skills.map(skill => skill.name)).size !== 40) throw new Error('The product importer did not accept 40 unique science skill names.')
  console.log('science-research: product ZIP importer: 40 unique skills')
  await rm(prepared.directory, { recursive: true, force: true })
  await runtime.prepare()
  if (process.argv.includes('--syntax-only')) {
    const scripts = Object.keys(archive).filter(path => path.endsWith('.py'))
    for (const script of scripts) await run(basePython, ['-c', 'import ast,sys;ast.parse(open(sys.argv[1],encoding="utf-8").read())', join(suite, script)], script.split('/')[0], 'Python syntax')
  } else {
  const declarations = JSON.parse(await readFile(join(assetsRoot, 'science-capabilities.json'), 'utf8')) as { capabilities: { id: string }[] }
  const selected = process.argv.includes('--all') ? declarations.capabilities.map(row => row.id) : ['skill-science-pubmed-database', 'skill-science-pubchem-database', 'skill-science-uniprot-database', 'skill-science-pdb-database', 'skill-science-pymol', 'skill-science-alphagenome-atlas-website-links']
  for (const id of selected) {
    const spec = await readScienceCapability(assetsRoot, id)
    console.log(`Preparing ${id} (${spec.pythonVersion})`)
    const paths = await runtime.ensureScienceCapability(spec)
    const skill = id.slice('skill-'.length)
    const scripts = Object.keys(archive).filter(path => path.startsWith(skill + '/scripts/') && path.endsWith('.py'))
    // Syntax and imports are checked independently: some helper modules have no CLI parser.
    for (const script of scripts) await run(paths.executable, ['-c', 'import ast,sys;ast.parse(open(sys.argv[1],encoding="utf-8").read())', join(suite, script)], skill, `syntax ${script}`)
    const entry = { 'science-pubchem-database': 'pubchem_api.py', 'science-uniprot-database': 'uniprot_tools.py', 'science-pdb-database': 'search_pdb.py', 'science-alphagenome-atlas-website-links': 'alphagenome_atlas_links.py' }[skill]
    if (entry) await run(paths.executable, [join(suite, skill, 'scripts', entry), '--help'], skill, 'CLI help')
    const queries: Record<string, string[]> = {
      'science-pubmed-database': ['pubmed_api.py', join(workspace, 'pubmed.json'), 'search_pubmed', 'BRCA1', '--max_results', '1'],
      'science-pubchem-database': ['pubchem_api.py', 'properties', '--cid', '2244', '--output', join(workspace, 'pubchem.json')],
      'science-uniprot-database': ['uniprot_tools.py', 'get', 'P04637'],
      'science-pdb-database': ['fetch_pdb_metadata.py', '--help'],
    }
    const query = queries[skill]
    if (query) await run(paths.executable, [join(suite, skill, 'scripts', query[0]!), ...query.slice(1)], skill, 'public service probe')
    if (skill === 'science-pymol') {
      const code = 'import pymol; pymol.finish_launching(["pymol","-cq"]); from pymol import cmd; cmd.fragment("ala"); assert cmd.count_atoms()>0; cmd.png("pymol-smoke.png",width=400,height=300,ray=0); cmd.save("pymol-smoke.pse"); cmd.quit()'
      await run(paths.executable, ['-c', code], skill, 'headless PNG and PSE')
    }
  }
  }
} finally {
  await runtime.dispose()
  await writeFile(join(work, 'smoke-results.json'), JSON.stringify({ workspace, observations }, null, 2) + '\n')
  await rm(importStage, { recursive: true, force: true })
}
