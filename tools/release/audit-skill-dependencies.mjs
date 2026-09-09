import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const skillsRoot = join(root, 'resources', 'skills')
const outputFlag = process.argv.indexOf('--output')
const output = resolve(outputFlag >= 0 ? process.argv[outputFlag + 1] : join(root, 'resources', 'python', 'skill-dependencies.json'))

const stdlib = new Set(['argparse', 'ast', 'asyncio', 'base64', 'collections', 'concurrent', 'contextlib', 'csv', 'dataclasses', 'datetime', 'enum', 'functools', 'glob', 'hashlib', 'html', 'http', 'importlib', 'inspect', 'io', 'itertools', 'json', 'logging', 'math', 'mimetypes', 'multiprocessing', 'os', 'pathlib', 'platform', 'queue', 'random', 're', 'shutil', 'sqlite3', 'statistics', 'string', 'subprocess', 'sys', 'tempfile', 'textwrap', 'threading', 'time', 'traceback', 'typing', 'unicodedata', 'urllib', 'uuid', 'warnings', 'xml', 'zipfile'])
const managedModules = new Map(Object.entries({
  Bio: 'biopython', anndata: 'anndata', astropy: 'astropy', bs4: 'beautifulsoup4', dask: 'dask', docx: 'python-docx', fitz: 'pymupdf', gseapy: 'gseapy', httpx: 'httpx', lxml: 'lxml', markitdown: 'markitdown', matplotlib: 'matplotlib', mcp: 'mcp', mygene: 'mygene', neo4j: 'neo4j', networkx: 'networkx', numpy: 'numpy', openpyxl: 'openpyxl', pandas: 'pandas', pdfplumber: 'pdfplumber', PIL: 'pillow', plotly: 'plotly', polars: 'polars', pyarrow: 'pyarrow', pydantic: 'pydantic', pypdf: 'pypdf', pptx: 'python-pptx', requests: 'requests', scanpy: 'scanpy', scipy: 'scipy', seaborn: 'seaborn', sklearn: 'scikit-learn', sqlalchemy: 'sqlalchemy', statsmodels: 'statsmodels', sympy: 'sympy', umap: 'umap-learn', xlsxwriter: 'xlsxwriter', yaml: 'pyyaml', zarr: 'zarr', liteparse: 'liteparse',
}))
const managedSkills = new Map(Object.entries({ anndata: 'anndata', astropy: 'astropy', biopython: 'biopython', dask: 'dask', 'exploratory-data-analysis': 'pandas', geopandas: 'geopandas', liteparse: 'liteparse', markitdown: 'markitdown', matplotlib: 'matplotlib', networkx: 'networkx', polars: 'polars', scanpy: 'scanpy', 'scikit-learn': 'scikit-learn', seaborn: 'seaborn', 'statistical-analysis': 'scipy', statsmodels: 'statsmodels', sympy: 'sympy', 'umap-learn': 'umap-learn', 'zarr-python': 'zarr', 'zerowall-literature': 'openpyxl' }))
const optionalSkills = new Set(['alphafold2', 'boltz', 'borzoi', 'chai1', 'deepchem', 'deeptools', 'diffdock', 'esm', 'esmfold2', 'evo2', 'fair-esm2', 'fluidsim', 'histolab', 'hugging-science', 'ligandmpnn', 'molecular-dynamics', 'molfeat', 'openfold3', 'pathml', 'proteinmpnn', 'pufferlib', 'pyhealth', 'pytorch-lightning', 'scgpt', 'scvi-tools', 'solublempnn', 'stable-baselines3', 'timesfm-forecasting', 'torch-geometric', 'torchdrug', 'transformers'])
const externalSkills = new Set(['adaptyv', 'benchling-integration', 'browser-use', 'dnanexus-integration', 'ginkgo-cloud-lab', 'labarchive-integration', 'latchbio-integration', 'matlab', 'nextflow', 'omero-integration', 'opentrons-integration', 'protocolsio-integration', 'remote-compute-modal', 'remote-compute-ssh', 'sc-upstream', 'zerowall-rbioagent', 'zerowall-rplatform', 'zerowall-rplotfigure', 'zerowall-tsg-literature'])
const incompatibleSkills = new Map([['tiledbvcf', 'The current upstream runtime requires a different Python ABI on Windows.'], ['vaex', 'No supported Python 3.12 Windows wheel is available for the maintained release.']])

async function filesUnder(path) {
  const result = []
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) result.push(...await filesUnder(child))
    else result.push(child)
  }
  return result
}

function skillName(text, path) {
  return text.match(/^name:\s*["']?([^\r\n"']+)/mu)?.[1]?.trim() || relative(skillsRoot, dirname(path)).replaceAll('\\', '/')
}

function importsOf(text) {
  const names = new Set()
  for (const match of text.matchAll(/^\s*(?:from|import)\s+([A-Za-z_][\w.]*)/gmu)) names.add(match[1].split('.')[0])
  return [...names].sort()
}

const allFiles = await filesUnder(skillsRoot)
const skillFiles = allFiles.filter(path => path.endsWith('SKILL.md'))
const skills = []
for (const path of skillFiles) {
  const directory = dirname(path)
  const name = skillName(await readFile(path, 'utf8'), path)
  const sourceFiles = allFiles.filter(file => file.startsWith(`${directory}\\`) && file.endsWith('.py'))
  const detectedImports = [...new Set((await Promise.all(sourceFiles.map(file => readFile(file, 'utf8')))).flatMap(importsOf))].sort()
  const requirements = []
  for (const module of detectedImports) {
    if (stdlib.has(module)) continue
    const pkg = managedModules.get(module)
    requirements.push(pkg ? { name: pkg, import: module, status: 'managed' } : { name: module, import: module, status: 'optional', reason: 'Not part of the signed Windows Python 3.12 lock; install or configure it only when this workflow is used.' })
  }
  const manualManaged = managedSkills.get(name)
  if (manualManaged && !requirements.some(item => item.name === manualManaged)) requirements.push({ name: manualManaged, status: 'managed', reason: 'Curated runtime dependency for this Skill.' })
  let status = requirements.some(item => item.status === 'optional') ? 'optional' : requirements.some(item => item.status === 'managed') ? 'managed' : 'ready'
  let reason = status === 'ready' ? 'No additional managed Python package is required.' : undefined
  if (optionalSkills.has(name)) { status = 'optional'; reason = 'Large model, GPU-oriented, or unusually heavy dependency; installed only on demand.' }
  if (externalSkills.has(name)) { status = 'external'; reason = 'Requires an external service, account, runtime, hardware, or system executable.' }
  if (incompatibleSkills.has(name)) { status = 'incompatible'; reason = incompatibleSkills.get(name) }
  skills.push({ name, path: relative(skillsRoot, directory).replaceAll('\\', '/'), status, reason, detectedImports, requirements })
}
skills.sort((a, b) => a.path.localeCompare(b.path))
const summary = Object.fromEntries(['ready', 'managed', 'optional', 'external', 'incompatible'].map(status => [status, skills.filter(skill => skill.status === status).length]))
const report = { schema: 1, platform: 'win32', architecture: 'x64', python: '3.12', generatedAt: new Date().toISOString(), summary, skills }
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`Audited ${skills.length} bundled Skills: ${JSON.stringify(summary)}`)
