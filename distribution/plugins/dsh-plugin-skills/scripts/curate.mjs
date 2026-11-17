/** Build the owned curated resource tree and a row for every legacy instruction file. */
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { parse, stringify } from 'yaml'

const args = process.argv.slice(2)
const manifestIndex = args.indexOf('--manifest')
const manifestPath = manifestIndex >= 0 ? resolve(args[manifestIndex + 1]) : undefined
const manifest = manifestPath ? JSON.parse(await readFile(manifestPath, 'utf8')) : undefined
function expandPath(path) {
  return String(path).replace(/\$\{([A-Z_][A-Z0-9_]*)\}/gu, (_match, name) => process.env[name] ?? (() => { throw new Error(`Missing source environment variable: ${name}`) })())
}
const configuredSources = Array.isArray(manifest?.sources) ? manifest.sources.map(source => ({ ...source, path: expandPath(source.path), ...(source.licenseRoot ? { licenseRoot: expandPath(source.licenseRoot) } : {}) })) : []
const sourceRoots = configuredSources.length
  ? configuredSources
  : args.filter(arg => !arg.startsWith('--')).map((path, index) => ({ id: index === 0 ? 'zerowall-legacy' : `source-${index}`, path }))
if (!sourceRoots.length) throw new Error('Pass a legacy skills source directory or --manifest <path>.')
const legacySource = resolve(sourceRoots[0].path)
const root = resolve(import.meta.dirname, '..', 'resources')
const core = new Set(['literature-review', 'citation-reviewer', 'peer-review', 'exploratory-data-analysis', 'statistical-analysis', 'statistical-power', 'experimental-design', 'scientific-critical-thinking', 'uncertainty-and-units', 'analysis-workflow', 'reproducible-research', 'figure-style'])
const plugin = {
  'zerowall-aichem': 'dsh-plugin-mcp', 'zerowall-bio': 'dsh-plugin-mcp', 'zerowall-bio-tools': 'dsh-plugin-mcp', 'zerowall-ketcher': 'dsh-plugin-mcp', 'zerowall-scimaster': 'dsh-plugin-mcp',
  'zerowall-mcp-guide': 'dsh-plugin-mcp', 'zerowall-rmcp': 'dsh-plugin-mcp', 'zerowall-r-files': 'dsh-plugin-mcp', 'zerowall-r-packages': 'dsh-plugin-mcp', 'zerowall-rplatform': 'dsh-plugin-mcp',
  'zerowall-python-packages': 'dsh-plugin-python', 'local-env-setup': 'dsh-plugin-python', 'pubmed-literature': 'dsh-zotero', 'pyzotero': 'dsh-zotero', 'mineru-document-parser': 'dsh-plugin-mineru',
  'zerowall-presentation': 'dsh-pptcreate', 'zerowall-spreadsheet': 'official-office', 'gpt-image-generator': 'dsh-imagecreate',
}
const merged = {
  'publication-figures': 'figure-style', 'bioinfor-figure-export': 'figure-style', 'figure-composer': 'figure-style',
  'method-choice': 'statistical-analysis', 'zerowall-claim-audit': 'scientific-critical-thinking', 'zerowall-data-contract': 'exploratory-data-analysis',
  'zerowall-intervention-response': 'experimental-design', 'zerowall-obesity-alopecia': 'zerowall-nhanes',
  'zerowall-colocalization': 'zerowall-mr', 'zerowall-omicverse-agent': 'zerowall-omicverse', 'zerowall-omicverse-bulk': 'zerowall-omicverse', 'zerowall-omicverse-multiomics': 'zerowall-omicverse', 'zerowall-omicverse-singlecell': 'zerowall-omicverse', 'zerowall-omicverse-spatial': 'zerowall-omicverse',
  'zerowall-paper-analysis': 'zerowall-image-dup', 'zerowall-paper-compare': 'zerowall-image-dup', 'zerowall-integrity-report': 'zerowall-image-dup', 'paper-download-pdf-cascade': 'pdf-cascade',
}
const excluded = new Set(['agent-infini','compute-env-setup','managing-pixi-environments','pixi-environment-builder','self-awareness','product-self-knowledge','customize','skill-creator','browser-use',
  'zerowall-research-evidence','zerowall-research-orchestrator','zerowall-science-agent-router','zerowall-science-canvas','zerowall-science-viewer','zerowall-scientific-engine-center','zerowall-science-workbench',
  'zerowall-brainglobe','zerowall-cells','zerowall-fiji','zerowall-fiji-bacterial-cfu','zerowall-fiji-colony-formation','zerowall-fiji-scratch-wound','zerowall-fiji-tube-formation','zerowall-fiji-western-blot','zerowall-flow','zerowall-he','zerowall-image-intensity','zerowall-image-mask','zerowall-molecule-docking','zerowall-molecule-viewer','zerowall-napari','zerowall-sanger','zerowall-sequence'])
const remote = new Set(['zerowall-faerskit','zerowall-geo','zerowall-nhanes','zerowall-mr','zerowall-omicverse','zerowall-rbioagent','zerowall-rplotfigure','zerowall-tooluniverse','sc-tenifold-knockout'])
const ars = new Set(['academic-paper','academic-paper-reviewer','academic-pipeline','deep-research','academic-research-shared'])
const coreRequirements = ['numpy','pandas','scipy','statsmodels','matplotlib','seaborn','pint','uncertainties','pyDOE3','pingouin']
const requirements = {
  'zerowall-image-dup': ['Pillow','numpy','scipy','scikit-image','opencv-python-headless','ImageHash','pikepdf','pypdf','pdfplumber','matplotlib','markdown','pydantic','rapidocr-onnxruntime==1.4.4','torch'],
  'paper-download': ['httpx','pydantic','PyYAML','tenacity','pypdf','requests','beautifulsoup4'],
  markitdown: ['markitdown'], liteparse: ['liteparse'],
}
const sdkRequirements = {
  scanpy: ['scanpy[leiden]'], anndata: ['anndata'], 'scvi-tools': ['scvi-tools'], scvelo: ['scvelo'],
  biopython: ['biopython'], bioservices: ['bioservices'], gget: ['gget'], pysam: ['pysam'],
  'scikit-learn': ['scikit-learn'], 'scikit-bio': ['scikit-bio'], 'scikit-survival': ['scikit-survival'],
  statsmodels: ['statsmodels'], matplotlib: ['matplotlib'], seaborn: ['seaborn'],
  rdkit: ['rdkit'], datamol: ['datamol'], molfeat: ['molfeat'], deepchem: ['deepchem'], medchem: ['medchem'],
  networkx: ['networkx'], sympy: ['sympy'], pymc: ['pymc'], pymoo: ['pymoo'],
  dask: ['dask[complete]'], polars: ['polars'], vaex: ['vaex'], 'zarr-python': ['zarr'],
  'pytorch-lightning': ['lightning'], transformers: ['transformers'], shap: ['shap'],
  'torch-geometric': ['torch-geometric'], 'stable-baselines3': ['stable-baselines3'],
  'umap-learn': ['umap-learn'], pydeseq2: ['pydeseq2'], 'polars-bio': ['polars-bio'],
  'cellxgene-census': ['cellxgene-census'], deeptools: ['deeptools'], arboreto: ['arboreto'],
  cobrapy: ['cobra'], flowio: ['flowio'], histolab: ['histolab'], pathml: ['pathml'],
  pydicom: ['pydicom'], pyhealth: ['pyhealth'], pyopenms: ['pyopenms'], neurokit2: ['neurokit2'],
  geopandas: ['geopandas'], astropy: ['astropy'], aeon: ['aeon'], simpy: ['simpy'],
  qiskit: ['qiskit'], cirq: ['cirq'], pennylane: ['pennylane'], qutip: ['qutip'],
  pymatgen: ['pymatgen'], fluidsim: ['fluidsim'], openpiv: ['openpiv'], matchms: ['matchms'],
  lamindb: ['lamindb'], etetoolkit: ['ete4'], 'fair-esm2': ['fair-esm'],
  'singlecell-qc': ['scanpy[leiden]'], 'bulk-rnaseq': ['pydeseq2'],
}
const audit = []
const catalog = []
const sourceRecords = []
const licenseRecords = []
await mkdir(root, { recursive: true })
await mkdir(join(root, 'skills'), { recursive: true })
// Integrity execution code and report schemas are maintained in this package.
const maintainedSkills = new Set(['zerowall-image-dup', 'research-integrity'])
for (const entry of await readdir(join(root, 'skills'))) {
  if (!maintainedSkills.has(entry)) await rm(join(root, 'skills', entry), { recursive: true, force: true })
}

function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text)
  if (!match) throw new Error('Skill frontmatter missing')
  return { metadata: parse(match[1]), body: text.slice(match[0].length) }
}
function topic(name, entry) {
  if (core.has(name)) return 'core'
  if (remote.has(name)) return 'remote-research'
  if (ars.has(name) || name.startsWith('ars-')) return 'academic-research'
  if (entry.startsWith('paper-download/')) return 'paper-download'
  if (name === 'zerowall-image-dup') return 'research-integrity'
  if (/omic|singlecell|scanpy|scvi|cell|rnaseq|genom|bio|gget|pysam|scvelo|scgpt|depmap|gtars|pathway/iu.test(name)) return 'omics'
  if (/chem|mol|drug|protein|esm|fold|boltz|chai|docking|mpnn|glyco|rdkit/iu.test(name)) return 'molecular-science'
  if (/markitdown|liteparse|pdf|paper|latex|venue|mermaid|report/iu.test(name)) return 'documents'
  if (/torch|transformers|gpu|model|hugging|dask|polars|zarr|vaex|remote-compute|nextflow/iu.test(name)) return 'computing'
  return 'specialist-science'
}
function adapt(body) {
  return body
    .replace(/## ZeroWall execution contract\r?\n[\s\S]*?(?=\r?\n# )/u, '')
    .replaceAll('默认先加载 `mineru-document-parser`', '默认先加载 MinerU 插件提供的 `mineru-document-parser`')
    .replaceAll('显式传 `isOcr: true`，', '显式传 `mode: "precision", isOcr: true`；需要逐页引用时增加 `anchor: true`，')
    .replaceAll('PDF 正文仍可通过 `mineru-document-parser` 解析', 'PDF 正文通过 MinerU 插件的 `mineru-document-parser` 解析，显式使用 `mode: "precision", isOcr: true`，缺少 Token 时报告限制并停止依赖解析的分析')
    .replaceAll('可按需调用 `mineru_parse` 补充识别', '可按需调用 `mineru_parse`（`mode: "precision", isOcr: true`）补充识别')
    .replaceAll('search_skills', 'skill discovery').replaceAll('use_skill', 'skill')
    .replaceAll('`zerowall-python-packages`', '`python_environment`')
    .replaceAll('`publication-figures`', '`figure-style`').replaceAll('`figure-composer`', '`figure-style`')
    .replaceAll('`zerowall-paper-analysis`', 'the paper-analysis workflow in this skill').replaceAll('`zerowall-paper-compare`', 'the paper-comparison workflow in this skill').replaceAll('`zerowall-integrity-report`', 'the integrity-report workflow in this skill')
    .replaceAll('`zerowall-rmcp`', 'the MCP plugin help').replaceAll('`zerowall-mcp-guide`', 'the MCP plugin help')
    .replaceAll('`zerowall-r-files`', 'the `r_files` tool').replaceAll('`zerowall-r-packages`', 'the remote R package operations')
    .replaceAll('`zerowall-rplatform`', 'the remote R compute operations')
    .replaceAll('run_in_context', 'shell').replaceAll('monitor_run', 'job_status')
    .replaceAll('read_uploaded_file', 'read_file').replaceAll('extract_uploaded_file', 'read_file')
    .replace(/`inspect_project_provenance(?:\([^`]*\))?`/gu, 'the artifact manifest and its recorded input/script hashes')
    .replaceAll('call the artifact manifest', 'inspect the artifact manifest')
    .replaceAll('Call the artifact manifest', 'Inspect the artifact manifest')
    .replace(/Data is stored at `C:[^\n]+/gu, 'Set PRIMEKG_DATA_PATH to the downloaded kg.csv file before running the query.')
    .replaceAll('PRIMEKG_DATA', 'PRIMEKG_DATA_PATH').replaceAll('PRIMEKG_DATA_PATH_PATH', 'PRIMEKG_DATA_PATH')
    .replaceAll('/home/me/', '$WORKSPACE_ROOT/')
    .replace(/C:[/\\]softworks[/\\]gpt-tools[/\\]paper-trail/gu, 'the original paper-trail source project')
    .replaceAll('共享 Python 依赖更新功能检查签名清单、预览变更并应用更新', 'Python 依赖管理器准备当前 Skill 的隔离依赖环境')
    .replace(/^.*(?:shared Python.*no.*venv|不得.*创建.*(?:venv|环境)|不要创建.*(?:venv|环境)|不要创建 venv|不创建.*venv).*\r?\n/gmu, '')
    .replace(/\(Windows usually[^\n]+/gu, '')
}
const runtime = '\n## ZeroWall runtime\n\nUse only the tools exposed by the active DSH session. Load skills with the `skill` tool. Local Python dependencies are managed through `python_environment`; the executable and dependency paths come from the Host runtime service. Resource scripts read `ZEROWALL_PYTHON_EXECUTABLE`, `ZEROWALL_PYTHON_SITE_PACKAGES` and `ZEROWALL_PYTHON_ENV_ROOT` when they need explicit runtime paths. Never reconstruct an installation path or alter system Python. Remote workflows use the live `research_workflow` and `r_files` schemas; missing remote capabilities remain unavailable. Loading instructions does not execute code, install dependencies, enable external models or activate upstream CLI hooks.\n'

const ignoredNames = new Set(['.git', '.hg', '.svn', '__pycache__', 'node_modules', '.venv', 'venv', 'dist', 'build', 'evals', 'evaluation', 'benchmarks', 'outputs', 'runs'])
function copyFilter(path) {
  const name = basename(path)
  return !ignoredNames.has(name) && !name.endsWith('.pyc') && !name.endsWith('.pyo') && !name.endsWith('.log')
}
async function hashDirectory(path) {
  const hash = createHash('sha256')
  async function visit(current) {
    const entries = (await readdir(current, { withFileTypes: true })).filter(entry => copyFilter(join(current, entry.name))).sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const full = join(current, entry.name)
      const rel = relative(path, full).replaceAll('\\', '/')
      if (entry.isDirectory()) await visit(full)
      else { hash.update(rel); hash.update(await readFile(full)) }
    }
  }
  await visit(path)
  return hash.digest('hex')
}
function sourceLicense(sourceId) {
  if (sourceId === 'nature') return 'Apache-2.0 (repository); per-skill metadata applies'
  if (sourceId === 'bionemo') return 'Apache-2.0 AND CC-BY-4.0; RFD4 helpers retain BSD-3-Clause'
  return 'See upstream notices'
}
async function collect(sourceConfig) {
  const source = resolve(sourceConfig.path)
  const sourceId = String(sourceConfig.id)
  const sourceHash = await hashDirectory(source)
  sourceRecords.push({ id: sourceId, root: source, sha256: sourceHash, license: sourceConfig.license ?? sourceLicense(sourceId), upstream: sourceConfig.upstream ?? null })
  const noticeRoot = resolve(sourceConfig.licenseRoot ?? source)
  const sourceNoticeCandidates = ['LICENSE', 'LICENSE.md', 'LICENSE-APACHE-2.0', 'LICENSE-CC-BY-4.0', 'NOTICE']
  for (const notice of sourceNoticeCandidates) {
    try {
      const text = await readFile(join(noticeRoot, notice), 'utf8')
      licenseRecords.push({ source: sourceId, file: notice, sha256: createHash('sha256').update(text).digest('hex'), text })
    } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
  }
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (!copyFilter(join(path, entry.name))) continue
      const full = join(path, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.name === 'SKILL.md') {
      const rel = relative(source, full).replaceAll('\\','/')
      const raw = await readFile(full, 'utf8')
      const { metadata, body } = frontmatter(raw)
      const name = String(metadata.name)
      const base = rel.split('/')[0]
      let target = merged[name]
      if (name.startsWith('ars-')) target = name === 'ars-reviewer' ? 'academic-paper-reviewer' : name.includes('deep-research') ? 'deep-research' : name.includes('pipeline') ? 'academic-pipeline' : 'academic-paper'
      const internalResource = (sourceId === 'nature' && name === 'nature-shared') || name === 'academic-research-shared'
      const isBioNemo = sourceId === 'bionemo'
      const disposition = internalResource ? 'resource' : plugin[name] ? 'plugin' : target ? 'merged' : excluded.has(name) ? 'excluded' : 'retained'
      const runtimeRequirements = isBioNemo ? {
        gpu: /GPU|CUDA|cuEquivariance|TensorRT/iu.test(raw),
        docker: /Docker|container|NIM/iu.test(raw),
        network: /API|endpoint|hosted|internet|download|HTTP/iu.test(raw),
        credentials: /API_KEY|NGC_API_KEY|credential|token/iu.test(raw),
      } : undefined
      const skillHash = createHash('sha256').update(raw).digest('hex')
      audit.push({ source: sourceId, legacyPath: rel, name, disposition, target: plugin[name] ?? target ?? (disposition === 'retained' ? name : ''), reason: plugin[name] ? 'Owned plugin supplies the capability and its usage guidance.' : target ? 'Shared workflow is maintained under one entry.' : internalResource ? 'Internal shared resources are available only through dependent skills.' : excluded.has(name) ? 'Required legacy execution or native viewer integration is not included.' : 'Distinct reusable workflow.', requirements: requirements[name] ?? [], ...(runtimeRequirements ? { runtime: runtimeRequirements } : {}), sha256: skillHash, issues: [...new Set((raw.match(/\\b(?:run_in_context|research_study|science_viewer_panel|method_check_evaluate|inspect_project_provenance|read_uploaded_file|use_skill)\\b/gu) ?? []))] })
      if (disposition !== 'retained' && disposition !== 'resource') continue
      const destination = join(root, 'skills', sourceId === 'zerowall-legacy' ? rel : join(sourceId, rel))
      await mkdir(dirname(destination), { recursive: true })
      if (rel.split('/').length === 2 && !maintainedSkills.has(name)) await cp(dirname(full), dirname(destination), { recursive: true, filter: copyFilter })
      if (disposition === 'resource') continue
      const normalized = { ...metadata, name, description: String(metadata.description) }
      if (typeof normalized.user_invocable === 'boolean') { normalized['user-invocable'] = normalized.user_invocable; delete normalized.user_invocable }
      delete normalized['allowed-tools']; delete normalized.fold_cue
      if (normalized.compatibility) normalized.compatibility = String(normalized.compatibility).replace(/.*OPENROUTER_API_KEY.*/u, 'Analytical guidance is local; optional execution dependencies are managed by the Host.')
      let text = adapt(body)
      if (isBioNemo) text += '\n\n## Runtime preflight\n\nThis bundled instruction set does not install CUDA, Docker, model weights, NIM containers or credentials. Check only whether required environment variables and executables are present; never print secret values. Hosted calls and downloads require explicit user authorization and a declared source.\n'
      if (name === 'zerowall-mr') text += '\nUse current `research_workflow` operations in `r.genetics`; read the live schema before submitting prepared MR or complete-region coloc inputs. Local Study or Gate services are not required. Keep source harmonization, LD applicability, priors and result limitations explicit.\n'
      if (!maintainedSkills.has(name)) await writeFile(destination, `---\n${stringify(normalized).trimEnd()}\n---\n${runtime}\n${text.trim()}\n`)
      else await readFile(destination)
      const group = sourceId === 'nature' ? (name === 'nature-ref-verifier' || name === 'nature-academic-search' ? 'research-integrity' : topic(name, rel)) : sourceId === 'bionemo' ? 'bionemo' : topic(name, rel)
      const deps = core.has(name) ? coreRequirements : requirements[name] ?? sdkRequirements[name] ?? (remote.has(name) || group === 'academic-research' ? [] : name === 'paper-download' || rel.startsWith('paper-download/') ? requirements['paper-download'] : [])
      const capabilityId = core.has(name) ? 'skill-core' : name === 'zerowall-image-dup' ? 'skill-integrity' : name === 'paper-download' || rel.startsWith('paper-download/') ? 'skill-paper-download' : `skill-${name}`
      catalog.push({ name, path: `skills/${sourceId === 'zerowall-legacy' ? rel : `${sourceId}/${rel}`}`, description: String(metadata.description), topic: group, core: core.has(name) || name === 'research-integrity', license: String(metadata.license ?? metadata.source?.license ?? sourceConfig.license ?? (group === 'academic-research' ? 'CC-BY-NC-4.0; additional authorization supplied by distributor' : 'See upstream notices')), capabilityId, requirements: deps, source: sourceId, sourceHash, sha256: skillHash, ...(runtimeRequirements ? { runtime: runtimeRequirements } : {}) })
      }
    }
  }
  await walk(source)
}
for (const sourceConfig of sourceRoots) await collect(sourceConfig)

const integrityPath = join(root, 'skills', 'research-integrity', 'SKILL.md')
await mkdir(dirname(integrityPath), { recursive: true })
await writeFile(integrityPath, await readFile(new URL('./templates/research-integrity.md', import.meta.url)))
catalog.push({
  name: 'research-integrity', path: 'skills/research-integrity/SKILL.md',
  description: '对话式科研可信度核查，覆盖文献、图片、图表、数据、统计和来源追溯。',
  topic: 'research-integrity', core: true, license: 'Apache-2.0', capabilityId: 'skill-integrity-report', requirements: ['python-docx==1.2.0', 'Pillow'],
  source: 'zerowall-native', sourceHash: 'native', sha256: createHash('sha256').update(await readFile(integrityPath)).digest('hex'),
})

for (const { source: sourceId, name: from, target: to } of audit.filter(row => row.disposition === 'merged')) {
  if (from === 'paper-download-pdf-cascade') continue
  if (maintainedSkills.has(to)) continue
  const src = join(resolve(sourceRoots.find(row => row.id === sourceId)?.path ?? legacySource), from)
  try {
    const original = frontmatter(await readFile(join(src, 'SKILL.md'),'utf8'))
    const targetRow = catalog.find(row => row.name === to)
    if (!targetRow) continue
    const destRoot = join(root, dirname(targetRow.path), 'references', 'merged', from)
    await mkdir(destRoot, { recursive: true })
    await cp(src, destRoot, { recursive: true })
    await rm(join(destRoot, 'SKILL.md'))
    await writeFile(join(destRoot, 'workflow.md'), adapt(original.body).trim() + '\n')
    await writeFile(join(root, targetRow.path), (await readFile(join(root, targetRow.path),'utf8')).trimEnd() + `\n\nRelated workflow: [${from}](references/merged/${from}/workflow.md). Read its resources only when needed.\n`)
  } catch (error) { if (error.code !== 'ENOENT') throw error }
}
const mr = catalog.find(row => row.name === 'zerowall-mr')
if (mr) {
  const path = join(root, mr.path)
  const existing = frontmatter(await readFile(path, 'utf8'))
  const body = '# Mendelian randomization and colocalization\n\nDiscover the live `research_workflow` schema and the connected `r.genetics` operations before submitting work. Use `r_files` for registered remote inputs and outputs. No local Study, Gate or viewer service is required. A missing remote operation is unavailable, even when this package contains its documentation.\n\nValidate ancestry, genome build, sample overlap, effect units, harmonized alleles and instrument strength from source evidence. Prepared MR supports Wald, IVW and MR-Egger when the live server declares them; colocalization requires complete-region summary data and explicit priors. Do not represent clumping, raw harmonization, MVMR, two-step MR or SuSiE as implemented without the matching live schema.\n\nPersist request/job identifiers from the actual response. Poll or recover the existing job rather than resubmitting after a timeout. Verify manifests, file sizes and hashes before interpreting result tables. Preserve partial methods and stop reasons. Numeric completion is not evidence of a causal claim.\n\nRead [genetics execution](references/genetics-runner.md) for the input and recovery checklist. [Colocalization](references/merged/zerowall-colocalization/workflow.md) is a related workflow.\n'
  await writeFile(path, `---\n${stringify(existing.metadata).trimEnd()}\n---\n${runtime}\n${body}`)
  const geneticsPath = join(root, dirname(mr.path), 'references', 'genetics-runner.md')
  await mkdir(dirname(geneticsPath), { recursive: true })
  await writeFile(geneticsPath, '# Genetics execution\\n\\nRead the connected research_workflow schema for r.genetics. Submit only operations that the server currently advertises.\\n')
}
const statistical = catalog.find(row => row.name === 'statistical-analysis')
if (statistical) {
  const methodPath = join(root, dirname(statistical.path), 'references', 'merged', 'method-choice', 'workflow.md')
  await mkdir(dirname(methodPath), { recursive: true })
  await writeFile(methodPath, '# Method fit review\\n\\nRecord design, units, tests, uncertainty and limitations from source evidence.\\n')
}
const dataContractRow = catalog.find(row => row.name === 'exploratory-data-analysis')
if (dataContractRow) {
  const dataContract = join(root, dirname(dataContractRow.path), 'references', 'merged', 'zerowall-data-contract', 'workflow.md')
  try { await writeFile(dataContract, (await readFile(dataContract,'utf8')).replace('用 method_check_evaluate 检查已提取的设计字段，保存缺口而非假装通过。','逐项人工核对已提取的设计字段并记录依据；保存缺口，不把信息不全写成通过。')) } catch (error) { if (!(error instanceof Error && 'code' in error && error.code !== 'ENOENT')) throw error }
}
const paperDownload = catalog.find(row => row.name === 'paper-download')
if (paperDownload) {
  const copiedProvenance = join(root, dirname(paperDownload.path), 'PROVENANCE-ZEROWALL.md')
  try { await writeFile(copiedProvenance, adapt(await readFile(copiedProvenance,'utf8'))) } catch (error) { if (!(error instanceof Error && 'code' in error && error.code !== 'ENOENT')) throw error }
}
const primekg = catalog.find(row => row.name === 'primekg')
if (primekg) {
  const primekgQuery = join(root, dirname(primekg.path), 'scripts', 'query_primekg.py')
  try { await writeFile(primekgQuery, (await readFile(primekgQuery,'utf8')).replaceAll('PRIMEKG_DATA', 'PRIMEKG_DATA_PATH').replaceAll('PRIMEKG_DATA_PATH_PATH','PRIMEKG_DATA_PATH')) } catch (error) { if (!(error instanceof Error && 'code' in error && error.code !== 'ENOENT')) throw error }
}
for (const row of catalog) row.sha256 = createHash('sha256').update(await readFile(join(root, row.path))).digest('hex')
await writeFile(join(root,'catalog.json'), JSON.stringify(catalog.sort((a,b)=>a.name.localeCompare(b.name)),null,2)+'\n')
await writeFile(join(root,'audit.json'), JSON.stringify(audit.sort((a,b)=>`${a.source}/${a.legacyPath}`.localeCompare(`${b.source}/${b.legacyPath}`)),null,2)+'\n')
const capabilityMap = {}
for (const row of catalog) capabilityMap[row.capabilityId] = [...new Set([...(capabilityMap[row.capabilityId]??[]), ...row.requirements])]
await writeFile(join(root,'capabilities.json'), JSON.stringify(capabilityMap,null,2)+'\n')
await writeFile(join(root, 'sources.json'), JSON.stringify(sourceRecords.map(({ root: _root, ...record }) => record), null, 2) + '\n')
await writeFile(join(root, 'THIRD-PARTY-LICENSES'), licenseRecords.map(record => `===== ${record.source}/${record.file} (${record.sha256}) =====\n${record.text.trim()}\n`).join('\n'))
console.log(JSON.stringify({ audited:audit.length, retained:catalog.length, core:catalog.filter(row=>row.core).length, topics:[...new Set(catalog.map(row=>row.topic))], dispositions:audit.reduce((counts,row)=>({...counts,[row.disposition]:(counts[row.disposition]??0)+1}),{}) }))
