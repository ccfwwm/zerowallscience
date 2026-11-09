/** Build the owned curated resource tree and a row for every legacy instruction file. */
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { parse, stringify } from 'yaml'

const source = resolve(process.argv[2] ?? (() => { throw new Error('Pass the legacy skills source directory.'); })())
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
  'zerowall-image-dup': ['Pillow','numpy','scipy','scikit-image','opencv-python-headless','ImageHash','pikepdf','pypdf','pdfplumber','matplotlib','markdown','pydantic','easyocr','torch','torchvision'],
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
await mkdir(root, { recursive: true })
await mkdir(join(root, 'skills'), { recursive: true })

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

async function collect(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = join(path, entry.name)
    if (entry.isDirectory()) await collect(full)
    else if (entry.name === 'SKILL.md') {
      const rel = relative(source, full).replaceAll('\\','/')
      const raw = await readFile(full, 'utf8')
      const { metadata, body } = frontmatter(raw)
      const name = metadata.name
      const base = rel.split('/')[0]
      let target = merged[name]
      if (name.startsWith('ars-')) target = name === 'ars-reviewer' ? 'academic-paper-reviewer' : name.includes('deep-research') ? 'deep-research' : name.includes('pipeline') ? 'academic-pipeline' : 'academic-paper'
      const disposition = plugin[name] ? 'plugin' : target ? 'merged' : excluded.has(name) ? 'excluded' : name === 'academic-research-shared' ? 'resource' : 'retained'
      audit.push({ legacyPath: rel, name, disposition, target: plugin[name] ?? target ?? (disposition === 'retained' ? name : ''), reason: plugin[name] ? 'Owned plugin supplies the capability and its usage guidance.' : target ? 'Shared workflow is maintained under one entry.' : excluded.has(name) ? 'Required legacy execution or native viewer integration is not included.' : 'Distinct reusable workflow.', requirements: requirements[name] ?? [], issues: [...new Set((raw.match(/\b(?:run_in_context|research_study|science_viewer_panel|method_check_evaluate|inspect_project_provenance|read_uploaded_file|use_skill)\b/gu) ?? []))] })
      if (disposition !== 'retained' && disposition !== 'resource') continue
      const destination = join(root, 'skills', rel)
      await mkdir(dirname(destination), { recursive: true })
      if (rel.split('/').length === 2) await cp(dirname(full), dirname(destination), { recursive: true, filter: path => !path.endsWith('__pycache__') && !path.endsWith('.pyc') })
      if (disposition === 'resource') continue
      const normalized = { ...metadata, name, description: String(metadata.description) }
      if (typeof normalized.user_invocable === 'boolean') { normalized['user-invocable'] = normalized.user_invocable; delete normalized.user_invocable }
      delete normalized['allowed-tools']; delete normalized.fold_cue
      if (normalized.compatibility) normalized.compatibility = String(normalized.compatibility).replace(/.*OPENROUTER_API_KEY.*/u, 'Analytical guidance is local; optional execution dependencies are managed by the Host.')
      let text = adapt(body)
      if (name === 'zerowall-mr') text += '\nUse current `research_workflow` operations in `r.genetics`; read the live schema before submitting prepared MR or complete-region coloc inputs. Local Study or Gate services are not required. Keep source harmonization, LD applicability, priors and result limitations explicit.\n'
      await writeFile(destination, `---\n${stringify(normalized).trimEnd()}\n---\n${runtime}\n${text.trim()}\n`)
      const group = topic(name, rel)
      const deps = core.has(name) ? coreRequirements : requirements[name] ?? sdkRequirements[name] ?? (remote.has(name) || group === 'academic-research' ? [] : name === 'paper-download' || rel.startsWith('paper-download/') ? requirements['paper-download'] : [])
      catalog.push({ name, path: `skills/${rel}`, description: String(metadata.description), topic: group, core: core.has(name), license: String(metadata.license ?? metadata.source?.license ?? (group === 'academic-research' ? 'CC-BY-NC-4.0; additional authorization supplied by distributor' : 'See upstream notices')), capabilityId: core.has(name) ? 'skill-core' : name === 'zerowall-image-dup' ? 'skill-integrity' : name === 'paper-download' || rel.startsWith('paper-download/') ? 'skill-paper-download' : `skill-${name}`, requirements: deps })
    }
  }
}
await collect(source)

for (const { name: from, target: to } of audit.filter(row => row.disposition === 'merged')) {
  if (from === 'paper-download-pdf-cascade') continue
  const src = join(source, from)
  try {
    const original = frontmatter(await readFile(join(src, 'SKILL.md'),'utf8'))
    const destRoot = join(root, 'skills', to, 'references', 'merged', from)
    await mkdir(destRoot, { recursive: true })
    await cp(src, destRoot, { recursive: true })
    await rm(join(destRoot, 'SKILL.md'))
    await writeFile(join(destRoot, 'workflow.md'), adapt(original.body).trim() + '\n')
    const target = catalog.find(row => row.name === to)
    if (target) await writeFile(join(root, target.path), (await readFile(join(root, target.path),'utf8')).trimEnd() + `\n\nRelated workflow: [${from}](references/merged/${from}/workflow.md). Read its resources only when needed.\n`)
  } catch (error) { if (error.code !== 'ENOENT') throw error }
}
const mr = catalog.find(row => row.name === 'zerowall-mr')
if (mr) {
  const path = join(root, mr.path)
  const existing = frontmatter(await readFile(path, 'utf8'))
  const body = '# Mendelian randomization and colocalization\n\nDiscover the live `research_workflow` schema and the connected `r.genetics` operations before submitting work. Use `r_files` for registered remote inputs and outputs. No local Study, Gate or viewer service is required. A missing remote operation is unavailable, even when this package contains its documentation.\n\nValidate ancestry, genome build, sample overlap, effect units, harmonized alleles and instrument strength from source evidence. Prepared MR supports Wald, IVW and MR-Egger when the live server declares them; colocalization requires complete-region summary data and explicit priors. Do not represent clumping, raw harmonization, MVMR, two-step MR or SuSiE as implemented without the matching live schema.\n\nPersist request/job identifiers from the actual response. Poll or recover the existing job rather than resubmitting after a timeout. Verify manifests, file sizes and hashes before interpreting result tables. Preserve partial methods and stop reasons. Numeric completion is not evidence of a causal claim.\n\nRead [genetics execution](references/genetics-runner.md) for the input and recovery checklist. [Colocalization](references/merged/zerowall-colocalization/workflow.md) is a related workflow.\n'
  await writeFile(path, `---\n${stringify(existing.metadata).trimEnd()}\n---\n${runtime}\n${body}`)
  await writeFile(join(root,'skills','zerowall-mr','references','genetics-runner.md'), '# Genetics execution\n\nRead the connected research_workflow schema for r.genetics. Submit only operations that the server currently advertises. For MR, retain exposure/outcome definitions, beta/SE, effect and other alleles, ancestry, genome build, LD applicability and sample overlap. For coloc, retain the complete region, both trait types, quantitative sdY or case fractions, and explicit p1/p2/p12 priors.\n\nUse the actual submission response for job identifiers and recovery. Read status before retrying a submission; retrieve artifacts through the server-advertised r_files operations. Verify byte counts, SHA-256, runner version and input hash from the returned manifest. Preserve partial/blocked/failed outputs. Unknown remote outcomes must be resolved before a second submission.\n\nWald requires one valid instrument, IVW at least two, and Egger at least three plus declared strength diagnostics. These minimums do not establish scientific adequacy. A successful calculation does not validate the research hypothesis.\n')
}
await writeFile(join(root,'skills','statistical-analysis','references','merged','method-choice','workflow.md'), '# Method fit review\n\nExtract the actual design, outcome type, group count, sample size, repeated/paired relationships, distribution assumptions, tested model and multiplicity correction from the supplied plan, methods and code. Cite their source locations and leave missing fields unknown.\n\nReview whether the observed unit matches the experimental unit, the model represents repeated observations, distributional assumptions are supported, effect estimates include uncertainty, and multiplicity or model selection is addressed. MR additionally needs instrument strength, ancestry/build, harmonization and overlap checks; coloc needs complete-region information and explicit causal assumptions.\n\nRecord each finding as a reasoned review with its evidence and limitation. This workflow has no automatic deterministic verdict service. Missing metadata is insufficient information; no listed issue does not certify scientific validity.\n')
const dataContract = join(root,'skills','exploratory-data-analysis','references','merged','zerowall-data-contract','workflow.md')
await writeFile(dataContract, (await readFile(dataContract,'utf8')).replace('用 `method_check_evaluate` 检查已提取的设计字段，保存缺口而非假装通过。','逐项人工核对已提取的设计字段并记录依据；保存缺口，不把信息不全写成通过。'))
const copiedProvenance = join(root,'skills','paper-download','PROVENANCE-ZEROWALL.md')
await writeFile(copiedProvenance, adapt(await readFile(copiedProvenance,'utf8')))
const primekgQuery = join(root,'skills','primekg','scripts','query_primekg.py')
await writeFile(primekgQuery, (await readFile(primekgQuery,'utf8')).replaceAll('PRIMEKG_DATA', 'PRIMEKG_DATA_PATH').replaceAll('PRIMEKG_DATA_PATH_PATH','PRIMEKG_DATA_PATH'))
await writeFile(join(root,'catalog.json'), JSON.stringify(catalog.sort((a,b)=>a.name.localeCompare(b.name)),null,2)+'\n')
await writeFile(join(root,'audit.json'), JSON.stringify(audit.sort((a,b)=>a.legacyPath.localeCompare(b.legacyPath)),null,2)+'\n')
const capabilityMap = {}
for (const row of catalog) capabilityMap[row.capabilityId] = [...new Set([...(capabilityMap[row.capabilityId]??[]), ...row.requirements])]
await writeFile(join(root,'capabilities.json'), JSON.stringify(capabilityMap,null,2)+'\n')
console.log(JSON.stringify({ audited:audit.length, retained:catalog.length, core:catalog.filter(row=>row.core).length, topics:[...new Set(catalog.map(row=>row.topic))], dispositions:audit.reduce((counts,row)=>({...counts,[row.disposition]:(counts[row.disposition]??0)+1}),{}) }))
