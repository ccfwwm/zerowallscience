import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, open, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import { dirname, extname, join, relative, resolve, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
import { ToolCallId, type ContentBlock } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { ScTenifoldAcquisitionPlan, ScTenifoldAcquisitionStatus, ScTenifoldDataContract, ScTenifoldDatasetCandidate, ScTenifoldGeneCandidate, ScTenifoldIntakeRequest, ScTenifoldIntakeResult, ScTenifoldProvider, ScTenifoldExecution, ScTenifoldPlanResult, ScTenifoldProjectConfig, ScTenifoldReviewResult, ScTenifoldRunResult, ScTenifoldValidationResult, ScTenifoldStudyState, ScTenifoldQcResult, ScTenifoldInterpretation, ScTenifoldFigureManifest, ScTenifoldRunManifest, ScTenifoldConclusion, ScTenifoldHostToolInstruction } from '../shared/types.js'

export type * from '../shared/types.js'
export const name = 'zerowall-singlecell'
export const inject = ['tools', 'sessions']
const CENSUS_VERSION = '2025-11-08'
const DEFAULT_MAX_CANDIDATES = 3
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024
const plans = new Map<string, ScTenifoldAcquisitionPlan>()
const statuses = new Map<string, ScTenifoldAcquisitionStatus>()
const studies = new Map<string, ScTenifoldIntakeResult>()
interface SinglecellRunRecord { result: ScTenifoldRunResult; projectRoot: string; output: string; validation?: ScTenifoldValidationResult; child?: ChildProcess }
const scRuns = new Map<string, SinglecellRunRecord>()
const R_MCP_RUNTIME = 'mcp__rdatalinux_r_platform__r_validate_sc_tenifold_runtime'

function defaultDshHome(): string {
  const configured = process.env.DSH_HOME?.trim()
  if (configured) return resolve(configured)
  const appData = process.env.APPDATA?.trim() || process.env.LOCALAPPDATA?.trim()
  if (appData) return resolve(appData, 'zerowall-science', 'workspace')
  return resolve(process.env.TEMP || process.env.TMP || '.', 'zerowall-science-workspace')
}
function sessionCwd(ctx: Context, sessionId: string): string {
  const cwd = ctx.get('sessions')?.get(SessionId(sessionId))?.header.cwd
  // A workspace is optional for intake. The fallback is app-controlled and
  // keeps downloaded public data away from arbitrary process directories.
  return resolve(cwd?.trim() || defaultDshHome())
}
function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel === '' || (!rel.startsWith('..') && !/^(?:[A-Za-z]:[\\/]|[\\/])/u.test(rel))
}
function safePath(root: string, value: string): string {
  const path = resolve(root, value)
  if (!inside(root, path)) throw new Error('单细胞数据路径必须位于当前工作区。')
  return path
}
async function persistJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}
async function findPersisted(root: string, fileName: string, id: string): Promise<unknown | undefined> {
  const queue = [root]
  let visited = 0
  while (queue.length > 0 && visited < 2000) {
    const current = queue.shift()!
    visited += 1
    let entries
    try { entries = await readdir(current, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) { queue.push(path); continue }
      if (entry.name !== fileName && entry.name !== `${id}.json`) continue
      try {
        const value = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
        if (value.planId === id || value.studyId === id || value.runId === id) return value
      } catch { /* ignore partial or unrelated files */ }
    }
  }
  return undefined
}
export function isDirectDataUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return false
    if (url.username || url.password) return false
    const host = url.hostname.toLowerCase()
    const officialHosts = ['cellxgene.cziscience.com', 'datasets.cellxgene.cziscience.com', 'ftp.ncbi.nlm.nih.gov', 'www.ncbi.nlm.nih.gov', 'ftp.ebi.ac.uk', 'www.ebi.ac.uk']
    return officialHosts.includes(host) && /\.(?:h5ad|h5|mtx(?:\.gz)?|csv|tsv|zip|rds)(?:$|\?)/iu.test(url.pathname)
  } catch { return false }
}
function sanitizedSourceUrl(value: string): string {
  const url = new URL(value)
  url.search = ''
  url.hash = ''
  return url.href
}
function censusH5adUrl(datasetVersionId: unknown): string | undefined {
  if (typeof datasetVersionId !== 'string' || !/^[0-9a-f-]{36}$/iu.test(datasetVersionId)) return undefined
  return `https://datasets.cellxgene.cziscience.com/${datasetVersionId}.h5ad`
}
export function normalizeGene(value: string): string {
  return value.trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9._-]+$/gu, '').toUpperCase()
}
function extractGenes(input: ScTenifoldIntakeRequest): string[] {
  return [...new Set([...(input.targetGenes ?? []), ...(input.referenceGenes ?? [])].map(normalizeGene).filter(Boolean))]
}
export function geneCandidates(input: ScTenifoldIntakeRequest): ScTenifoldGeneCandidate[] {
  const directValues = (input.targetGenes ?? []).map(String).map(normalizeGene).filter(Boolean)
  const referenceValues = (input.referenceGenes ?? []).map(String).map(normalizeGene).filter(Boolean)
  const direct = [...new Set(directValues)]
  const references = [...new Set(referenceValues)]
  const topic = input.researchQuestion?.trim() ?? ''
  // Topic-only recommendations must come from a connected gene/literature or
  // expression adapter. Never present hard-coded biology as evidence.
  const inferred: string[] = []
  const symbols = [...new Set([...direct, ...references, ...inferred])]
  const limit = Math.max(1, Math.min(input.maxCandidates ?? DEFAULT_MAX_CANDIDATES, 20))
  // Explicit targets are never dropped by the recommendation limit.
  const selected = [...direct, ...symbols.filter(symbol => !direct.includes(symbol))].slice(0, Math.max(limit, direct.length))
  return selected.map((symbol, index): ScTenifoldGeneCandidate => {
    const explicit = direct.includes(symbol)
    const reference = references.includes(symbol)
    const score = explicit ? 100 : reference ? 60 : Math.max(20, 35 - index * 3)
    return {
      symbol,
      inputAliases: [...new Set([
        ...(input.targetGenes ?? []).filter(value => normalizeGene(String(value)) === symbol).map(String),
        ...(input.referenceGenes ?? []).filter(value => normalizeGene(String(value)) === symbol).map(String),
        symbol,
      ])],
      score,
      confidence: explicit ? 'high' : reference ? 'medium' : 'low',
      evidence: [{ source: explicit ? 'user-input' : reference ? 'user-reference' : 'gene-evidence-adapter-required', claim: explicit ? '用户明确指定的目标基因。' : reference ? '由用户提供的参考基因，尚未完成外部证据核验。' : '当前未连接基因、文献或表达数据库，无法从主题生成候选。' }],
      rationale: [explicit ? '用户明确指定' : reference ? '参考基因（待外部证据确认）' : '主题启发候选（待外部证据确认）', ...(input.cellTypes?.length ? [`目标细胞群：${input.cellTypes.join(', ')}`] : []), ...(input.tissue ? [`组织：${input.tissue}`] : [])],
    }
  }).sort((a, b) => b.score - a.score)
}
async function geneCandidatesWithEvidence(ctx: Context, request: ScTenifoldIntakeRequest, exec: any): Promise<ScTenifoldGeneCandidate[]> {
  const existing = geneCandidates(request)
  if (!request.researchQuestion?.trim() || existing.some(item => request.targetGenes?.map(normalizeGene).includes(item.symbol))) return existing
  if (!exec) return existing
  const schemas = ctx.tools.schemas()
  const schema = schemas.find(item => /gene.*(search|recommend|lookup)|(?:search|recommend|lookup).*gene/iu.test(item.name) && !item.name.startsWith('sc_tenifold'))
  if (!schema) return existing
  try {
    const value = await callRemoteTool(ctx, exec, schema.name, { query: request.researchQuestion.trim(), organism: request.organism ?? 'auto', tissue: request.tissue })
    const rows = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).results) ? (value as Record<string, unknown>).results as unknown[] : []
    const evidence = rows.flatMap(row => {
      if (!row || typeof row !== 'object') return []
      const item = row as Record<string, unknown>
      const symbol = normalizeGene(String(item.symbol ?? item.gene ?? item.gene_symbol ?? ''))
      return symbol ? [{ symbol, claim: String(item.description ?? item.summary ?? '来自已连接基因/表达数据库的主题检索结果。') }] : []
    }).slice(0, 20)
    if (!evidence.length) return existing
    const direct = new Set((request.targetGenes ?? []).map(normalizeGene))
    return [...existing, ...evidence.filter(item => !direct.has(item.symbol)).map((item, index) => ({ symbol: item.symbol, inputAliases: [item.symbol], score: Math.max(25, 55 - index), confidence: 'medium' as const, evidence: [{ source: schema.name, claim: item.claim }], rationale: ['由已连接的基因/表达数据库根据研究主题返回；需要数据集覆盖和 R MCP 验证。'] }))].slice(0, Math.max(1, Math.min(request.maxCandidates ?? DEFAULT_MAX_CANDIDATES, 20)))
  } catch { return existing }
}
function fallbackDatasetCandidates(input: ScTenifoldIntakeRequest, genes: string[], warning?: string): ScTenifoldDatasetCandidate[] {
  // Never return synthetic accessions. Callers can show this warning while
  // retaining the discovery action, but no placeholder may be downloaded or
  // presented as an actual dataset.
  void input; void genes
  return warning ? [] : []
}
function textLabel(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return value.map(textLabel).filter(Boolean).join(', ')
  if (value && typeof value === 'object' && 'label' in value) return textLabel((value as { label?: unknown }).label)
  return ''
}
async function fetchJson(url: string, timeoutMs = 20_000): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally { clearTimeout(timer) }
}
async function fetchDataResponse(url: string, timeoutMs = 120_000): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { accept: '*/*', 'user-agent': 'ZeroWallScience/scTenifoldKnk' } })
      if (response.ok && response.body) return response
      lastError = new Error(`HTTP ${response.status}`)
      if (response.status < 500 && response.status !== 429) break
    } catch (error) {
      lastError = error
    } finally { clearTimeout(timer) }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 1_000 * (attempt + 1)))
  }
  throw lastError instanceof Error ? lastError : new Error('数据下载连接失败。')
}
async function downloadWithCurl(url: string, target: string, maxBytes: number): Promise<void> {
  await new Promise<void>((resolveDownload, rejectDownload) => {
    const child = spawn(process.env.ZEROWALL_CURL?.trim() || 'curl', ['--fail', '--location', '--retry', '3', '--retry-delay', '2', '--connect-timeout', '30', '--max-time', '3600', '--max-filesize', String(maxBytes), '--output', target, url], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', chunk => { stderr += String(chunk).slice(-2000) })
    child.once('error', rejectDownload)
    child.once('exit', code => code === 0 ? resolveDownload() : rejectDownload(new Error(`curl 下载失败（exit ${code}）：${stderr.trim()}`)))
  })
}
async function discoverDatasetCandidates(input: ScTenifoldIntakeRequest, genes: string[]): Promise<ScTenifoldDatasetCandidate[]> {
  const organism = input.organism === 'mouse' ? 'Mus musculus' : 'Homo sapiens'
  const tissue = input.tissue?.trim().toLowerCase()
  const requestedTypes = (input.cellTypes ?? []).map(value => value.toLowerCase())
  const queryTokens = [tissue, ...requestedTypes, input.condition?.toLowerCase()].filter(Boolean) as string[]
  // A target gene alone is a valid intake. Use a broad public-data query and
  // let preview/validation score target-gene coverage instead of returning an
  // empty result that forces the user to provide tissue metadata first.
  const searchCensus = async (): Promise<ScTenifoldDatasetCandidate[]> => {
    const found: ScTenifoldDatasetCandidate[] = []
    const raw = await fetchJson('https://api.cellxgene.cziscience.com/curation/v1/collections')
    const collections = Array.isArray(raw) ? raw : []
    for (const value of collections.slice(0, 300)) {
      if (!value || typeof value !== 'object') continue
      const collection = value as Record<string, unknown>
      const datasets = Array.isArray(collection.datasets) ? collection.datasets : []
      const links = Array.isArray(collection.links) ? collection.links : []
      const haystack = JSON.stringify({ name: collection.name, description: collection.description, datasets }).toLowerCase()
      if (queryTokens.length > 0 && !queryTokens.every(token => haystack.includes(token))) continue
      const matching = datasets.filter(item => item && typeof item === 'object' && textLabel((item as Record<string, unknown>).organism).toLowerCase().includes(organism.toLowerCase()))
      if (matching.length === 0 && organism !== 'Homo sapiens') continue
      const first = (matching[0] ?? datasets[0]) as Record<string, unknown> | undefined
      if (!first) continue
      const accession = String(first.dataset_id ?? collection.collection_id ?? '').trim()
      if (!accession) continue
      const sourceLink = links.find(link => link && typeof link === 'object' && String((link as Record<string, unknown>).link_type ?? '').toUpperCase() === 'RAW_DATA') as Record<string, unknown> | undefined
      const sourceUrl = censusH5adUrl(first.dataset_version_id) ?? (typeof sourceLink?.link_url === 'string' && isDirectDataUrl(sourceLink.link_url) ? sourceLink.link_url : undefined)
      const datasetTypes = datasets.slice(0, 20).map(item => textLabel((item as Record<string, unknown>)?.tissue)).filter(Boolean)
      const cellTypes = requestedTypes.length > 0 ? (input.cellTypes ?? []) : ['metadata cell type pending']
      found.push({
        provider: 'cellxgene', accession, title: String(collection.name ?? `CELLxGENE ${accession}`), organism,
        ...(tissue ? { tissue: input.tissue } : {}), cellTypes, condition: input.condition ?? 'normal/non-tumor filter pending',
        datasetCount: datasets.length,
        // Collection metadata is not proof that the raw layer or target gene
        // is available. Only a resolved, allow-listed source can be acquired;
        // the slice still needs a runtime preview before becoming runnable.
        hasRawCounts: false, ...(sourceUrl ? {} : {}),
        downloadProducts: ['h5ad'], score: sourceUrl ? 45 : 20,
        warnings: [
          ...(sourceUrl ? ['该 H5AD 地址来自 CELLxGENE dataset_version_id；raw layer、文件大小和目标基因覆盖仍需预览校验。'] : ['当前集合仅提供元数据或外部页面，尚未解析为可自动下载的稳定 H5AD/MTX URL。']),
          '目标基因覆盖率、raw layer、donor/sample 数和下载大小需通过 Census slice 预览确认。',
          ...(datasetTypes.length ? [`集合组织标签：${datasetTypes.slice(0, 4).join(', ')}`] : []),
        ],
        provenance: { metadataUrl: String(collection.collection_url ?? `https://cellxgene.cziscience.com/collections/${collection.collection_id ?? accession}`), ...(sourceUrl ? { sourceUrl } : {}), censusVersion: CENSUS_VERSION },
      })
      if (found.length >= 5) break
    }
    return found
  }
  const searchGeo = async (): Promise<ScTenifoldDatasetCandidate[]> => {
    const found: ScTenifoldDatasetCandidate[] = []
    const term = encodeURIComponent([input.tissue, ...(input.cellTypes ?? []), input.condition, 'single cell'].filter(Boolean).join(' '))
    const search = await fetchJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gds&term=${term}&retmode=json&retmax=5`)
    const ids = search && typeof search === 'object' && 'esearchresult' in search ? (search as { esearchresult?: { idlist?: unknown } }).esearchresult?.idlist : []
    if (Array.isArray(ids) && ids.length > 0) {
      const summary = await fetchJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gds&id=${ids.map(String).join(',')}&retmode=json`)
      const result = summary && typeof summary === 'object' && 'result' in summary ? (summary as { result?: Record<string, Record<string, unknown>> }).result : undefined
      for (const id of ids.map(String)) {
        const item = result?.[id]
        if (!item) continue
        const accession = String(item.accession ?? item.nuccore ?? `GDS${id}`)
        found.push({ provider: 'geo', accession, title: String(item.title ?? `GEO ${accession}`), organism, ...(tissue ? { tissue: input.tissue } : {}), cellTypes: input.cellTypes ?? ['metadata cell type pending'], ...(input.condition ? { condition: input.condition } : {}), datasetCount: 1, hasRawCounts: false, downloadProducts: ['matrix', 'supplementary', 'fastq'], score: 25, warnings: ['GEO 处理矩阵和 raw counts 需要进一步解析补充文件；当前仅有元数据，不能自动下载或运行。FASTQ 默认需要审批。'], provenance: { metadataUrl: `https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${encodeURIComponent(accession)}` } })
      }
    }
    return found
  }
  // The two public discovery tracks are independent. Run them concurrently so
  // an unavailable provider cannot serialize the whole intake experience.
  const [census, geo] = await Promise.allSettled([searchCensus(), searchGeo()])
  const found = [
    ...(census.status === 'fulfilled' ? census.value : []),
    ...(geo.status === 'fulfilled' ? geo.value : []),
  ]
  return found.sort((a, b) => b.score - a.score).slice(0, 10)
}
export function dataContract(inputPath: string, targets: string[]): ScTenifoldDataContract {
  const lower = inputPath.toLowerCase()
  const format = lower.endsWith('.mtx.gz') ? 'mtx.gz' : extname(inputPath).slice(1).toLowerCase() || 'file'
  if (['h5ad', 'rds', 'rda', 'rdata'].includes(format)) return { state: 'raw_counts_unverified', inputPath, format, targets, missingTargets: [], warnings: ['该格式必须在授权的 Python/R 运行时读取 raw layer 后确认；未验证前不可运行 scTenifoldKnk。'], errors: [] }
  if (format === 'mtx' || format === 'mtx.gz') return { state: 'raw_counts_unverified', inputPath, format, targets, missingTargets: [], warnings: ['MatrixMarket 必须同时验证同目录 features/genes、barcodes 和矩阵维度后才能运行。'], errors: [] }
  if (!['csv', 'tsv', 'txt'].includes(format)) return { state: 'raw_counts_unverified', inputPath, format, targets, missingTargets: [], warnings: ['该格式需要在选定 R/Python 环境中验证 raw layer。'], errors: [] }
  const text = readFileSync(inputPath, 'utf8')
  const lines = text.split(/\r?\n/u).map(line => line.trimEnd()).filter(Boolean)
  if (lines.length < 2) return { state: 'dataset_not_suitable', inputPath, format, targets, missingTargets: targets, warnings: [], errors: ['表达矩阵为空。'] }
  const delimiter = format === 'csv' ? ',' : '\t'
  const header = (lines[0] ?? '').split(delimiter)
  if (header.length < 2 || !header.slice(1).every(value => value.trim())) return { state: 'dataset_not_suitable', inputPath, format, targets, missingTargets: targets, warnings: [], errors: ['表达矩阵必须包含细胞列名。'] }
  const genes = new Set<string>()
  const missing = new Set(targets)
  let nonInteger = false
  for (const line of lines.slice(1)) {
    const cells = line.split(delimiter)
    if (cells.length !== header.length) return { state: 'dataset_not_suitable', inputPath, format, targets, missingTargets: [...missing], warnings: [], errors: ['表达矩阵列数不一致。'] }
    const gene = normalizeGene(cells[0] ?? '')
    if (!gene || genes.has(gene)) return { state: 'dataset_not_suitable', inputPath, format, targets, missingTargets: [...missing], warnings: [], errors: ['基因名为空或重复。'] }
    genes.add(gene); missing.delete(gene)
    if (cells.slice(1).some(value => !/^\d+(?:\.0+)?$/u.test(value.trim()))) nonInteger = true
  }
  if (missing.size) return { state: 'target_missing', inputPath, format, genes: genes.size, cells: header.length - 1, targets, missingTargets: [...missing], warnings: [], errors: [`目标基因不存在：${[...missing].join(', ')}`] }
  if (nonInteger) return { state: 'raw_counts_unverified', inputPath, format, genes: genes.size, cells: header.length - 1, targets, missingTargets: [], warnings: ['存在非整数、负数或空表达值，可能不是 raw counts；必须由运行时复核。'], errors: [] }
  return { state: 'ready_for_qc', inputPath, format, genes: genes.size, cells: header.length - 1, targets, missingTargets: [], warnings: ['矩阵语法上符合整数 counts；样本重复、QC 和细胞群分层仍需在正式运行前审核。'], errors: [] }
}

async function transposeDelimitedIfNeeded(source: string, target: string, targets: string[], format: string): Promise<boolean> {
  if (!['csv', 'tsv', 'txt'].includes(format)) return false
  const delimiter = format === 'csv' ? ',' : '\t'
  const lines = readFileSync(source, 'utf8').split(/\r?\n/u).filter(Boolean).map(line => line.split(delimiter))
  if (lines.length < 2 || lines[0]!.length < 2) return false
  const headerGenes = new Set(lines[0]!.slice(1).map(normalizeGene))
  if (!targets.some(targetGene => headerGenes.has(targetGene))) return false
  if (lines.slice(1).some(row => row.length !== lines[0]!.length)) return false
  const output: string[][] = [[lines[0]![0]!, ...lines.slice(1).map(row => row[0] ?? '')]]
  for (let column = 1; column < lines[0]!.length; column += 1) output.push([lines[0]![column]!, ...lines.slice(1).map(row => row[column] ?? '')])
  await writeFile(target, `${output.map(row => row.join(delimiter)).join('\n')}\n`, { flag: 'wx' })
  return true
}

export function validationFromContract(contract: ScTenifoldDataContract): ScTenifoldValidationResult {
  const rawCounts = contract.state === 'ready_for_qc' ? 'verified' : contract.state === 'dataset_not_suitable' || contract.state === 'target_missing' ? 'invalid' : 'not_verified'
  const errors = rawCounts === 'verified' ? contract.errors : [...contract.errors, 'raw counts 尚未完成运行时验证；必须先通过 Python/R 数据校验和 QC。']
  return { ok: errors.length === 0 && contract.missingTargets.length === 0 && rawCounts === 'verified', input: contract.inputPath, inputType: contract.format, ...(contract.genes === undefined ? {} : { genes: contract.genes }), ...(contract.cells === undefined ? {} : { cells: contract.cells }), targets: contract.targets, missingTargets: contract.missingTargets, rawCounts, warnings: contract.warnings, errors, review: errors.length ? 'blocked' : contract.warnings.length ? 'pass_with_warnings' : 'requires_human_review' }
}
function runReview(validation: ScTenifoldValidationResult | undefined, output: string): ScTenifoldReviewResult {
  const data = validation ?? { ok: true, warnings: ['尚未执行输入校验。'], errors: [], review: 'requires_human_review' as const }
  const gates: ScTenifoldReviewResult['gates'] = {
    data: { state: data.errors.length ? 'blocked' : data.warnings.length ? 'pass_with_warnings' : 'pass', messages: [...data.errors, ...data.warnings] },
    compute: { state: existsSync(join(output, 'manifest.json')) ? 'pass_with_warnings' : 'requires_human_review', messages: existsSync(join(output, 'manifest.json')) ? [] : ['尚未发现运行 manifest。'] },
    biology: { state: 'requires_human_review', messages: ['虚拟敲除只产生 scGRN 计算假设，必须结合公开证据和实验验证。'] },
    manuscript: { state: 'requires_human_review', messages: ['不得将计算结果表述为真实基因敲除或确定因果关系。'] },
  }
  const states = Object.values(gates).map(gate => gate.state)
  return { state: states.includes('blocked') ? 'blocked' : states.includes('requires_human_review') ? 'requires_human_review' : states.includes('pass_with_warnings') ? 'pass_with_warnings' : 'pass', gates, warnings: states.includes('pass_with_warnings') ? ['结果需要人工复核。'] : [] }
}
function singlecellRunnerPath(): string | undefined {
  const resources = process.env.ZEROWALL_RESOURCES_ROOT?.trim() || process.env.ZEROWALL_PACKAGED_RESOURCES?.trim()
  const candidates = [resources ? join(resources, 'skills', 'sc-tenifold-knockout', 'scripts', 'run_scTenifoldKnk.R') : undefined, typeof (process as NodeJS.Process & { resourcesPath?: unknown }).resourcesPath === 'string' ? join(String((process as NodeJS.Process & { resourcesPath?: unknown }).resourcesPath), 'skills', 'sc-tenifold-knockout', 'scripts', 'run_scTenifoldKnk.R') : undefined, resolve(process.cwd(), 'resources/skills/sc-tenifold-knockout/scripts/run_scTenifoldKnk.R')]
  return candidates.find(path => path !== undefined && existsSync(path))
}
async function createProject(ctx: Context, sessionId: string, studyId: string): Promise<string> {
  const root = sessionCwd(ctx, sessionId)
  const project = join(root, 'projects', studyId)
  await Promise.all(['data/raw', 'data/metadata', 'data/processed', 'data/public', 'scripts', 'figures', 'tables', 'reports', 'runs', 'protocols', 'environment', 'provenance'].map(dir => mkdir(join(project, dir), { recursive: true })))
  await writeFile(join(project, 'project.yaml'), ['schema: 1', `study_id: ${studyId}`, 'raw_data_read_only: true', 'computational_only: true', ''].join('\n'), { flag: 'wx' }).catch(() => undefined)
  return project
}
async function persistStudyStatus(projectPath: string, status: { studyId: string; state: ScTenifoldStudyState; updatedAt: string; currentDataset?: string; progress?: number; error?: string }): Promise<void> {
  await persistJson(join(projectPath, 'provenance', 'status.json'), status)
}
async function discover(input: ScTenifoldIntakeRequest, ctx?: Context, exec?: any): Promise<{ candidates: ScTenifoldGeneCandidate[]; datasets: ScTenifoldDatasetCandidate[] }> {
  const candidates = ctx ? await geneCandidatesWithEvidence(ctx, input, exec) : geneCandidates(input)
  const datasets = await discoverDatasetCandidates(input, candidates.map(item => item.symbol))
  return { candidates, datasets }
}
function jsonOutput(render: (value: unknown) => string) { return { schema: { type: 'object', additionalProperties: true }, render: (_args: unknown, value: unknown) => [{ type: 'text', text: render(value) }], presentationMeta: (_args: unknown, value: unknown) => value } as any }
async function callRemoteTool(ctx: Context, exec: any, name: string, args: Record<string, unknown>): Promise<any> {
  const result = await ctx.tools.execute({ signal: exec?.signal, callId: ToolCallId(`singlecell-${Date.now()}-${Math.random().toString(16).slice(2)}`), name, arguments: args, parent: exec?.token, agent: exec?.agent })
  if (result?.isError) {
    const message = (result.content as ContentBlock[] | undefined)?.map(block => block.type === 'text' ? block.text : '').filter(Boolean).join('\n')
    throw new Error(message || `${name} failed`)
  }
  return result?.value ?? (result as any)?.structuredContent ?? result
}
function findRemoteJobId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value
  if (!value || typeof value !== 'object') return undefined
  const object = value as Record<string, unknown>
  for (const key of ['job_id', 'jobId', 'id']) if (typeof object[key] === 'string' && object[key]) return String(object[key])
  for (const child of Object.values(object)) { const found = findRemoteJobId(child); if (found) return found }
  return undefined
}

async function requireRemoteR(ctx: Context, exec: any): Promise<void> {
  if (!exec) throw new Error('missing_runtime: 当前操作必须通过 rdatalinux R MCP 执行。')
  const schemas = ctx.tools.schemas()
  if (!schemas.some(schema => schema.name === R_MCP_RUNTIME || schema.name === 'mcp__rdatalinux_r_platform__r_submit_sc_tenifold_knockout' || schema.name === 'mcp__rdatalinux_r_platform__r_submit_script')) throw new Error('missing_runtime: rdatalinux R MCP 未连接或未注册。')
  if (schemas.some(schema => schema.name === R_MCP_RUNTIME)) {
    const runtime = await callRemoteTool(ctx, exec, R_MCP_RUNTIME, {})
    if (runtime && typeof runtime === 'object' && (runtime as Record<string, unknown>).available === false) throw new Error('missing_runtime: 远程 R 环境未发现 scTenifoldKnk。')
  }
}
function runManifestPath(root: string, runId: string): string { return join(root, 'runs', runId, 'manifest.json') }
async function writeChineseReport(projectRoot: string, studyId: string, runId: string, interpretation?: ScTenifoldInterpretation, review?: ScTenifoldReviewResult): Promise<string> {
  const reportPath = join(projectRoot, 'reports', `${runId}-study-report.zh-CN.md`)
  await mkdir(dirname(reportPath), { recursive: true })
  const rows = interpretation?.observedChanges ?? []
  const observed = rows.length ? rows.slice(0, 30).map(item => `| ${item.gene} | ${item.direction} | ${item.effectSize ?? '未提供'} | ${item.adjustedP ?? '未提供'} |`).join('\n') : '| - | 尚未获得 R MCP 定量结果 | - | - |'
  const conclusions = interpretation?.conclusions?.length ? interpretation.conclusions.map(item => `### ${item.title}\n\n- 分类：${item.category}\n- 置信度：${item.confidence}\n- 结论：${item.statement}\n- 证据：${item.evidence.join('；') || '暂无'}\n- 需要实验验证：${item.requiresValidation ? '是' : '否'}`).join('\n\n') : 'R MCP 结果尚未收集，不能生成生物学结论。'
  const reviewState = review?.state ?? 'requires_human_review'
  await writeFile(reportPath, [`# 单细胞虚拟敲除科研报告`, ``, `- study_id: ${studyId}`, `- run_id: ${runId}`, `- 审核状态：${reviewState}`, ``, `## 研究范围`, ``, `本报告描述基于 scTenifoldKnk 的计算网络扰动假设，不等同于真实基因敲除或因果证明。所有定量结果必须来自远程 R MCP。`, ``, `## 统计观察`, ``, `| 基因 | 方向 | 效应量 | 调整后 P 值 |`, `| --- | --- | --- | --- |`, observed, ``, `## 机制与改变原因`, ``, conclusions, ``, `## 图表与过程`, ``, `请查看 runs/${runId}/figures/ 中由 R MCP 生成的 PDF/PNG，以及 process-diagram.mmd。`, ``, `## 限制与后续验证`, ``, ...(interpretation?.limitations ?? ['需要完成 R MCP 运行、稳定性分析、公开数据库证据和人工审核。']), ``, `该结果仅用于提出可检验的科研假设，湿实验必须由研究人员审核和执行。`, ``].join('\n'), 'utf8')
  return reportPath
}

export class ZeroWallSinglecellService extends TypertRemoteService {
  static inject = inject
  private readonly context: Context
  constructor(ctx: Context) {
    super(ctx, 'zerowallSinglecell')
    this.context = ctx
    const output = jsonOutput(value => JSON.stringify(value))
    const register = (options: unknown): void => { ctx.tools.register(defineTool(options as any) as any) }
    register({ name: 'sc_tenifold_knockout_intake', description: '根据基因或研究主题启动自动单细胞数据工作流。', parameters: { request: { type: 'object', additionalProperties: true, required: true } }, output, execute: async (args: any, exec: any) => this.intakeInternal({ sessionId: String(exec.agent?.session.id ?? ''), request: args.request as ScTenifoldIntakeRequest }, exec) as unknown as Record<string, JsonValue> })
    register({ name: 'sc_tenifold_knockout_search_genes', description: '标准化并推荐虚拟敲除候选基因；主题输入优先调用已连接的基因/表达数据库。', parameters: { request: { type: 'object', additionalProperties: true, required: true } }, output, execute: async (args: any, exec: any) => geneCandidatesWithEvidence(this.context, args.request as ScTenifoldIntakeRequest, exec) as unknown as Record<string, JsonValue> })
    register({
      name: 'sc_tenifold_knockout_search_datasets', description: '双轨搜索 CELLxGENE 与 GEO/ENA 单细胞候选数据集。', parameters: { request: { type: 'object', additionalProperties: true, required: true } }, output,
      execute: async (args: any) => {
        const request = args.request as ScTenifoldIntakeRequest
        return await discoverDatasetCandidates(request, extractGenes(request)) as unknown as Record<string, JsonValue>
      },
    })
    register({ name: 'sc_tenifold_knockout_preview_dataset', description: '预览候选数据集规模、raw counts、样本和下载产品。', parameters: { candidate: { type: 'object', additionalProperties: true, required: true } }, output, execute: async (args: any) => ({ candidate: args.candidate }) as unknown as Record<string, JsonValue> })
    register({ name: 'sc_tenifold_knockout_create_acquisition_plan', description: '为候选公开数据集创建可审计下载计划。', parameters: { studyId: { type: 'string', required: true }, candidate: { type: 'object', additionalProperties: true, required: true }, maxBytes: { type: 'number' } }, output, execute: async (args: any, exec: any) => this.createAcquisitionPlan({ sessionId: String(exec.agent?.session.id ?? ''), studyId: String(args.studyId), candidate: args.candidate as ScTenifoldDatasetCandidate, ...(typeof args.maxBytes === 'number' ? { maxBytes: args.maxBytes } : {}) }) as unknown as Record<string, JsonValue> })
    register({ name: 'sc_tenifold_knockout_start_acquisition', description: '在审批通过后下载公开处理矩阵或 H5AD，并记录 checksum。', parameters: { planId: { type: 'string', required: true } }, output, execute: async (args: any) => this.startAcquisition(String(args.planId)) as unknown as Record<string, JsonValue> })
    register({ name: 'sc_tenifold_knockout_acquisition_status', description: '查询公开数据获取进度。', parameters: { planId: { type: 'string', required: true } }, output, execute: async (args: any) => this.acquisitionStatus(String(args.planId)) as unknown as Record<string, JsonValue> })
    register({ name: 'sc_tenifold_knockout_validate_dataset', description: '校验自动获取的数据是否满足 raw counts 和目标基因要求。', parameters: { inputPath: { type: 'string', required: true }, targets: { type: 'array', required: true, items: { type: 'string' } } }, output, execute: async (args: any, exec: any) => this.validateDataset({ sessionId: String(exec.agent?.session.id ?? ''), inputPath: String(args.inputPath), targets: Array.isArray(args.targets) ? args.targets.map(String) : [] }) as unknown as Record<string, JsonValue> })
    register({ name: 'sc_tenifold_knockout_validate', description: '校验 scTenifoldKnk 输入和研究元数据。', parameters: { config: { type: 'object', required: true } }, output, execute: async (args: any, exec: any) => this.scTenifoldValidate({ sessionId: String(exec.agent?.session.id ?? ''), config: args.config as ScTenifoldProjectConfig }) as unknown as Record<string, JsonValue> })
    register({ name: 'sc_tenifold_knockout_plan', description: '创建可审计的 scTenifoldKnk 分析计划。', parameters: { config: { type: 'object', required: true } }, output, execute: async (args: any, exec: any) => this.scTenifoldPlan({ sessionId: String(exec.agent?.session.id ?? ''), config: args.config as ScTenifoldProjectConfig }) as unknown as Record<string, JsonValue> })
    register({ name: 'sc_tenifold_knockout_run', description: '运行或提交 scTenifoldKnk 虚拟敲除。', parameters: { config: { type: 'object', required: true }, target: { type: 'string' } }, output, execute: async (args: any, exec: any) => this.runInternal({ sessionId: String(exec.agent?.session.id ?? ''), config: args.config as ScTenifoldProjectConfig, ...(args.target ? { target: String(args.target) } : {}) }, exec) as unknown as Record<string, JsonValue> })
    register({ name: 'sc_tenifold_knockout_qc', description: '通过远程 R MCP 执行单细胞 QC、非肿瘤筛选和细胞群分层。', parameters: { runId: { type: 'string', required: true } }, output, execute: async (args: any, exec: any) => this.scTenifoldQcInternal(String(args.runId), exec) as unknown as Record<string, JsonValue> })
    register({ name: 'sc_tenifold_knockout_status', description: '查询虚拟敲除运行状态。', parameters: { runId: { type: 'string', required: true } }, output, execute: async (args: any, exec: any) => this.statusInternal(String(args.runId), exec) as unknown as Record<string, JsonValue> })
    register({ name: 'sc_tenifold_knockout_cancel', description: '取消正在运行的虚拟敲除任务。', parameters: { runId: { type: 'string', required: true } }, output, execute: async (args: any, exec: any) => this.cancelInternal(String(args.runId), exec) as unknown as Record<string, JsonValue> })
    register({ name: 'sc_tenifold_knockout_collect', description: '收集虚拟敲除输出文件。', parameters: { runId: { type: 'string', required: true } }, output, execute: async (args: any, exec: any) => this.collectInternal(String(args.runId), exec) as unknown as Record<string, JsonValue> })
    register({ name: 'sc_tenifold_knockout_review', description: '执行数据、计算、生物学和文稿审核门禁。', parameters: { runId: { type: 'string', required: true } }, output, execute: async (args: any) => this.scTenifoldReview(String(args.runId)) as unknown as Record<string, JsonValue> })
    register({ name: 'sc_tenifold_knockout_report', description: '生成虚拟敲除审核报告。', parameters: { runId: { type: 'string', required: true } }, output, execute: async (args: any) => this.scTenifoldReport(String(args.runId)) as unknown as Record<string, JsonValue> })
    register({ name: 'sc_tenifold_knockout_interpret', description: '读取 R MCP 结果并生成统计观察、机制证据和可检验假设。', parameters: { runId: { type: 'string', required: true } }, output, execute: async (args: any, exec: any) => this.scTenifoldInterpretInternal(String(args.runId), exec) as unknown as Record<string, JsonValue> })
    register({ name: 'sc_tenifold_knockout_figures', description: '通过 R MCP 生成并登记出版级图表和科研流程图。', parameters: { runId: { type: 'string', required: true } }, output, execute: async (args: any, exec: any) => this.scTenifoldFiguresInternal(String(args.runId), exec) as unknown as Record<string, JsonValue> })
    register({ name: 'sc_tenifold_knockout_experimental_design', description: '根据计算结果生成供研究人员审核的基因干预验证方案。', parameters: { runId: { type: 'string', required: true } }, output, execute: async (args: any) => this.scTenifoldExperimentalDesign(String(args.runId)) as unknown as Record<string, JsonValue> })
  }
  private async intakeInternal(input: { sessionId: string; request: ScTenifoldIntakeRequest }, exec?: any): Promise<ScTenifoldIntakeResult> {
    const studyId = `study-${Date.now()}-${randomUUID().slice(0, 8)}`
    const projectPath = await createProject(this.context, input.sessionId, studyId)
    await persistStudyStatus(projectPath, { studyId, state: 'intake', updatedAt: new Date().toISOString(), progress: 0 })
    let inputValidation: ScTenifoldValidationResult | undefined
    let suppliedInputPath = input.request.inputPath
    if (input.request.attachmentId !== undefined) {
      const files = this.context.get('zerowallFiles') as { materializeOriginal(input: { sessionId: string; attachmentId: string }): Promise<{ path: string; name: string }> } | undefined
      if (!files) {
        inputValidation = { ok: false, input: input.request.attachmentId, inputType: 'attachment', targets: extractGenes(input.request), missingTargets: [], rawCounts: 'invalid', warnings: [], errors: ['文件附件服务未注册，无法读取上传文件。'], review: 'blocked' }
      } else {
        const materialized = await files.materializeOriginal({ sessionId: input.sessionId, attachmentId: input.request.attachmentId })
        suppliedInputPath = materialized.path
      }
    }
    if (suppliedInputPath !== undefined && inputValidation === undefined) {
      const workspace = sessionCwd(this.context, input.sessionId)
      const supplied = input.request.attachmentId === undefined ? safePath(workspace, suppliedInputPath) : resolve(suppliedInputPath)
      if (!existsSync(supplied)) {
        inputValidation = { ok: false, input: suppliedInputPath, inputType: 'missing', targets: extractGenes(input.request), missingTargets: [], rawCounts: 'invalid', warnings: [], errors: ['提供的输入文件不存在或已失效。'], review: 'blocked' }
      } else {
        const targetPath = join(projectPath, 'data', 'raw', basename(supplied))
        await copyFile(supplied, targetPath)
        const metadata = input.request.metadataPath === undefined ? undefined : safePath(workspace, input.request.metadataPath)
        const normalizedTargets = extractGenes(input.request)
        const format = targetPath.toLowerCase().endsWith('.csv') ? 'csv' : targetPath.toLowerCase().endsWith('.tsv') || targetPath.toLowerCase().endsWith('.txt') ? 'tsv' : ''
        let contractPath = targetPath
        if (format !== '' && await transposeDelimitedIfNeeded(targetPath, `${targetPath}.genes-rows.${format}`, normalizedTargets, format)) contractPath = `${targetPath}.genes-rows.${format}`
        const contract = dataContract(contractPath, normalizedTargets)
        if (contractPath !== targetPath) contract.warnings = [...contract.warnings, '检测到输入为细胞×基因方向，已生成 genes×cells 的独立副本；原始文件保持不变。']
        if (metadata !== undefined && existsSync(metadata)) await copyFile(metadata, join(projectPath, 'data', 'metadata', basename(metadata)))
        inputValidation = validationFromContract(contract)
      }
    }
    if (inputValidation !== undefined && extractGenes(input.request).length === 0) {
      inputValidation = { ...inputValidation, ok: false, errors: [...inputValidation.errors, '至少需要一个目标基因；上传文件本身不能替代敲除目标。'], review: 'blocked' }
    }
    const supportedInputs = new Set(['csv', 'tsv', 'txt', 'mtx', 'mtx.gz', 'h5ad', 'rds', 'rda', 'rdata'])
    if (inputValidation !== undefined && !supportedInputs.has(inputValidation.inputType)) {
      const result: ScTenifoldIntakeResult = { studyId, state: 'failed', projectPath, targetGenes: extractGenes(input.request), candidates: geneCandidates(input.request), datasets: [], nextAction: '该文件不是单细胞表达矩阵；请使用 MinerU/文件解析工具，或提供 H5AD、RDS、MTX、CSV/TSV counts。', warnings: ['sc-tenifold-knockout 不会把 PDF、DOCX、PPTX、XLSX 或普通文档误当作表达矩阵。'], inputValidation }
      studies.set(studyId, result)
      await persistJson(join(projectPath, 'provenance', 'intake.json'), { ...result, censusVersion: CENSUS_VERSION, request: input.request })
      await persistStudyStatus(projectPath, { studyId, state: 'failed', updatedAt: new Date().toISOString(), progress: 100, error: result.nextAction })
      return result
    }
    const found = inputValidation !== undefined
      ? { candidates: geneCandidates(input.request), datasets: [] }
      : await discover(input.request, this.context, exec)
    const result: ScTenifoldIntakeResult = { studyId, state: inputValidation?.ok ? 'validating' : 'datasets_discovered', projectPath, targetGenes: (input.request.targetGenes ?? []).map(normalizeGene).filter(Boolean), candidates: found.candidates, datasets: found.datasets, nextAction: inputValidation?.ok ? '已登记输入矩阵；请继续完成 metadata/QC 验证后再运行。' : '请先检查候选数据集和下载规模；只有已确认 raw counts、官方直接 URL 且小于 2GB 的处理矩阵才会自动获取。', ...(found.datasets.length === 0 && inputValidation === undefined ? { warnings: ['未提供组织、细胞类型或条件线索；为避免返回无关数据，暂不自动选择公开数据集。请补充研究主题/组织/细胞群，或显式选择数据集。'] } : {}), ...(inputValidation === undefined ? {} : { inputValidation }), ...(inputValidation?.input && inputValidation.input !== input.request.attachmentId && inputValidation.input.startsWith(projectPath) ? { inputPath: relative(projectPath, inputValidation.input).replaceAll('\\', '/') } : {}) }
    studies.set(studyId, result)
    await persistJson(join(projectPath, 'provenance', 'intake.json'), { ...result, censusVersion: CENSUS_VERSION, request: input.request })
    await persistStudyStatus(projectPath, { studyId, state: 'datasets_discovered', updatedAt: new Date().toISOString(), progress: 20 })
    if (input.request.autoExecute === true) {
      const candidate = found.datasets.find(item => Boolean(item.provenance.sourceUrl) && item.estimatedBytes !== undefined && item.estimatedBytes < DEFAULT_MAX_BYTES && !item.downloadProducts.includes('fastq'))
      if (candidate) {
        try {
          const plan = await this.createAcquisitionPlan({ sessionId: input.sessionId, studyId, candidate })
          if (plan.approval === 'approved') {
            const status = await this.startAcquisition(plan.planId)
            result.state = status.status === 'acquired' ? 'acquired' : status.status === 'acquiring' ? 'acquiring' : 'failed'
            result.acquisitionPlanId = plan.planId
            result.nextAction = status.status === 'acquired' ? '数据已获取，请执行 validate_dataset 和 QC。' : (status.error ?? '数据获取失败，请查看 acquisition status。')
          } else {
            result.state = 'acquisition_planned'; result.acquisitionPlanId = plan.planId; result.nextAction = '该数据获取计划需要用户审批。'
          }
        } catch (error) {
          result.state = 'failed'; result.warnings = [error instanceof Error ? error.message : String(error)]
        }
      } else {
        result.warnings = ['没有同时满足真实官方直接数据 URL、非 FASTQ 且小于 2GB 的候选；未执行自动下载。下载后仍必须完成 raw counts 验证和 QC。']
      }
      await persistJson(join(projectPath, 'provenance', 'intake.json'), { ...result, censusVersion: CENSUS_VERSION, request: input.request })
      await persistStudyStatus(projectPath, { studyId, state: result.state, updatedAt: new Date().toISOString(), progress: result.state === 'acquired' ? 100 : 25, ...(result.warnings?.[0] ? { error: result.warnings[0] } : {}) })
    }
    return result
  }
  @Remote('intake') async intake(input: { sessionId: string; request: ScTenifoldIntakeRequest }): Promise<ScTenifoldIntakeResult> { return this.intakeInternal(input) }
  @Remote('searchGenes') searchGenes(request: ScTenifoldIntakeRequest): ScTenifoldGeneCandidate[] { return geneCandidates(request) }
  @Remote('searchDatasets') async searchDatasets(request: ScTenifoldIntakeRequest): Promise<ScTenifoldDatasetCandidate[]> { return discoverDatasetCandidates(request, extractGenes(request)) }
  @Remote('previewDataset') async previewDataset(candidate: ScTenifoldDatasetCandidate): Promise<ScTenifoldDatasetCandidate> {
    const sourceUrl = candidate?.provenance?.sourceUrl
    if (!sourceUrl || !isDirectDataUrl(sourceUrl)) return { ...candidate, hasRawCounts: false, warnings: [...candidate.warnings, '没有可校验的官方直接数据 URL。'] }
    try {
      const response = await fetch(sourceUrl, { method: 'HEAD', signal: AbortSignal.timeout(15_000) })
      const bytes = Number(response.headers.get('content-length') ?? 0)
      const estimatedBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : candidate.estimatedBytes
      return { ...candidate, ...(estimatedBytes === undefined ? {} : { estimatedBytes }), hasRawCounts: false, warnings: [...new Set([...candidate.warnings, response.ok ? '已确认 URL 可访问；raw layer 和目标基因仍需读取 H5AD 后验证。' : `数据源预览失败（HTTP ${response.status}）。`])] }
    } catch (error) {
      return { ...candidate, hasRawCounts: false, warnings: [...new Set([...candidate.warnings, `数据源预览失败：${error instanceof Error ? error.message : String(error)}`])] }
    }
  }
  @Remote('createAcquisitionPlan') async createAcquisitionPlan(input: { sessionId: string; studyId: string; candidate: ScTenifoldDatasetCandidate; maxBytes?: number }): Promise<ScTenifoldAcquisitionPlan> {
    const { sessionId, studyId, maxBytes = DEFAULT_MAX_BYTES } = input
    const candidate = input.candidate
    if (!candidate || !candidate.provider || !candidate.accession || candidate.accession.includes('/') || candidate.accession.includes('\\')) throw new Error('数据集候选缺少有效 accession。')
    const sourceUrl = candidate.provenance.sourceUrl
    if (sourceUrl !== undefined && !isDirectDataUrl(sourceUrl)) throw new Error('数据源 URL 不是允许的官方直接数据地址。')
    const warnings = candidate.downloadProducts.some(product => product === 'fastq')
      ? [...new Set([...candidate.warnings, 'FASTQ/SRA 仅可在明确审批后执行；本下载器不会自动获取原始测序数据。'])]
      : candidate.warnings
    const persistedCandidate: ScTenifoldDatasetCandidate = { ...candidate, warnings, provenance: { ...candidate.provenance, ...(sourceUrl ? { sourceUrl: sanitizedSourceUrl(sourceUrl) } : {}) } }
    const root = sessionCwd(this.context, sessionId)
    const outputDirectory = safePath(root, `projects/${studyId}/data/public/${persistedCandidate.provider}/${persistedCandidate.accession}`)
    const planId = `acq-${Date.now()}-${randomUUID().slice(0, 8)}`
    const now = new Date().toISOString()
    // Raw-count verification happens after acquisition. Do not require a
    // metadata-only boolean here or every legitimate public H5AD remains
    // permanently pending before it can be inspected.
    const needsApproval = (persistedCandidate.estimatedBytes ?? 0) >= maxBytes || persistedCandidate.downloadProducts.some(product => product === 'fastq') || !persistedCandidate.provenance.sourceUrl
    const plan: ScTenifoldAcquisitionPlan = { planId, studyId, candidate: persistedCandidate, outputDirectory, manifestPath: join(outputDirectory, 'manifest.json'), maxBytes, resume: true, overwrite: false, approval: needsApproval ? 'pending' : 'approved', status: needsApproval ? 'planned' : 'approved', createdAt: now, updatedAt: now }
    await mkdir(outputDirectory, { recursive: true })
    await persistJson(join(outputDirectory, 'acquisition-plan.json'), plan)
    await persistJson(join(root, `projects/${studyId}/provenance/${planId}.json`), plan)
    plans.set(planId, plan)
    return plan
  }
  @Remote('approveAcquisition') async approveAcquisition(planId: string): Promise<ScTenifoldAcquisitionPlan> { const plan = await this.loadPlan(planId); if (!plan) throw new Error(`获取计划不存在：${planId}`); plan.approval = 'approved'; plan.status = 'approved'; plan.updatedAt = new Date().toISOString(); await persistJson(join(plan.outputDirectory, 'acquisition-plan.json'), plan); plans.set(planId, plan); return plan }
  private async loadPlan(planId: string): Promise<ScTenifoldAcquisitionPlan | undefined> { const cached = plans.get(planId); if (cached) return cached; const value = await findPersisted(defaultDshHome(), 'acquisition-plan.json', planId); if (!value || typeof value !== 'object') return undefined; const plan = value as ScTenifoldAcquisitionPlan; plans.set(planId, plan); return plan }
  @Remote('startAcquisition') async startAcquisition(planId: string): Promise<ScTenifoldAcquisitionStatus> {
    const plan = await this.loadPlan(planId)
    if (!plan) throw new Error(`获取计划不存在：${planId}`)
    if (plan.approval !== 'approved') throw new Error('该下载计划需要先审批。')
    const sourceUrl = plan.candidate.provenance.sourceUrl
    if (!sourceUrl || !isDirectDataUrl(sourceUrl)) return this.failAcquisition(plan, '候选数据集尚未解析稳定的官方直接数据 URL；未执行下载。')
    if (plan.candidate.downloadProducts.some(product => product === 'fastq')) return this.failAcquisition(plan, '原始 FASTQ/SRA 不会由自动下载器获取，请使用受控远程流程并单独审批。')
    const target = join(plan.outputDirectory, 'files', basenameFromUrl(sourceUrl))
    await mkdir(dirname(target), { recursive: true })
    const status: ScTenifoldAcquisitionStatus = { ...plan, status: 'acquiring', progress: 0, bytesDownloaded: 0, files: [] }
    statuses.set(planId, status)
    await persistJson(join(plan.outputDirectory, 'status.json'), status)
    try {
      if (plan.resume && existsSync(target)) {
        const info = await stat(target)
        const checksum = createHash('sha256').update(await readFile(target)).digest('hex')
        await this.finishAcquisition(plan, status, target, info.size, checksum)
        return status
      }
      const partial = `${target}.partial`
      let response: Response | undefined
      try { response = await fetchDataResponse(sourceUrl) } catch (error) {
        // Some rdatalinux/Windows Node installations fail the TLS handshake
        // while the system curl trust store succeeds. Keep the same allowlist
        // and size limit, but provide a bounded command-line fallback.
        try {
          await downloadWithCurl(sourceUrl, partial, plan.maxBytes)
          const downloaded = await stat(partial)
          if (downloaded.size > plan.maxBytes) throw new Error('下载文件超过计划大小限制。')
          const checksum = createHash('sha256').update(await readFile(partial)).digest('hex')
          await rename(partial, target)
          await this.finishAcquisition(plan, status, target, downloaded.size, checksum)
          return status
        } catch (fallbackError) {
          return this.failAcquisition(plan, `下载失败：${error instanceof Error ? error.message : String(error)}；curl 回退也失败：${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`)
        }
      }
      if (!response.ok || !response.body) return this.failAcquisition(plan, `下载失败（HTTP ${response.status} 或响应为空）。`)
      const advertised = Number(response.headers.get('content-length') ?? 0)
      if (Number.isFinite(advertised) && advertised > plan.maxBytes) return this.failAcquisition(plan, '服务器声明的文件大小超过计划限制，未开始下载。')
      const handle = await open(partial, 'w')
      const hash = createHash('sha256')
      let total = 0
      try {
        const reader = response.body.getReader()
        for (;;) {
          const next = await reader.read()
          if (next.done) break
          const chunk = next.value
          total += chunk.byteLength
          if (total > plan.maxBytes) throw new Error('下载文件超过计划大小限制。')
          hash.update(chunk)
          await handle.write(chunk)
          status.bytesDownloaded = total
          status.progress = advertised > 0 ? Math.min(99, Math.floor(total / advertised * 100)) : 0
          statuses.set(planId, status)
          await persistJson(join(plan.outputDirectory, 'status.json'), status)
        }
      } finally { await handle.close() }
      await rename(partial, target)
      await this.finishAcquisition(plan, status, target, total, hash.digest('hex'))
      return status
    } catch (error) {
      status.status = 'failed'
      status.error = error instanceof Error ? error.message : String(error)
      status.updatedAt = new Date().toISOString()
      statuses.set(planId, status)
      await persistJson(join(plan.outputDirectory, 'status.json'), status)
      return status
    }
  }
  private async failAcquisition(plan: ScTenifoldAcquisitionPlan, error: string): Promise<ScTenifoldAcquisitionStatus> {
    const status: ScTenifoldAcquisitionStatus = { ...plan, status: 'failed', progress: 0, bytesDownloaded: 0, files: [], error, updatedAt: new Date().toISOString() }
    statuses.set(plan.planId, status)
    await persistJson(join(plan.outputDirectory, 'status.json'), status)
    return status
  }
  private async finishAcquisition(plan: ScTenifoldAcquisitionPlan, status: ScTenifoldAcquisitionStatus, target: string, bytes: number, checksum: string): Promise<void> {
    await persistJson(plan.manifestPath, { provider: plan.candidate.provider, accession: plan.candidate.accession, metadataUrl: plan.candidate.provenance.metadataUrl, ...(plan.candidate.provenance.sourceUrl ? { sourceUrl: sanitizedSourceUrl(plan.candidate.provenance.sourceUrl) } : {}), retrievedAt: new Date().toISOString(), files: [{ path: relative(plan.outputDirectory, target).replaceAll('\\', '/'), bytes, sha256: checksum }] })
    status.status = 'acquired'; status.progress = 100; status.bytesDownloaded = bytes; status.files = [target]; status.updatedAt = new Date().toISOString()
    statuses.set(plan.planId, status)
    await persistJson(join(plan.outputDirectory, 'status.json'), status)
  }
  @Remote('getAcquisitionStatus') async acquisitionStatus(planId: string): Promise<ScTenifoldAcquisitionStatus | undefined> { const cached = statuses.get(planId); if (cached) return cached; const value = await findPersisted(defaultDshHome(), 'status.json', planId); if (!value || typeof value !== 'object') return undefined; const status = value as ScTenifoldAcquisitionStatus; statuses.set(planId, status); return status }
  @Remote('scTenifoldValidate') async scTenifoldValidate(input: { sessionId: string; config: ScTenifoldProjectConfig }): Promise<ScTenifoldValidationResult> {
    const targets = input.config.targets.map(normalizeGene).filter(Boolean)
    if (targets.length === 0) return { ok: false, input: input.config.input ?? '', inputType: input.config.input ? 'unknown' : 'auto', targets: [], missingTargets: [], rawCounts: 'not_verified', warnings: [], errors: ['至少需要一个目标基因；请在 intake 中提供 targetGenes，或先完成候选基因选择。'], review: 'blocked' }
    if (!input.config.input) return { ok: false, input: '', inputType: 'auto', targets, missingTargets: [], rawCounts: 'not_verified', warnings: ['未提供本地输入；请先完成自动数据获取。'], errors: ['当前计划尚未绑定已获取的数据集。'], review: 'blocked' }
    const root = sessionCwd(this.context, input.sessionId); const project = safePath(root, input.config.projectPath); const matrix = safePath(project, input.config.input); if (!existsSync(matrix)) throw new Error('scTenifoldKnk 输入文件不存在。')
    const metadata = input.config.metadata ? safePath(project, input.config.metadata) : undefined
    const contract = dataContract(matrix, targets)
    if (metadata !== undefined) {
      if (!existsSync(metadata)) {
        contract.state = 'metadata_incomplete'
        contract.errors = [...contract.errors, '元数据文件不存在。']
      } else {
        try {
          const metadataText = readFileSync(metadata, 'utf8')
          const metadataLines = metadataText.split(/\r?\n/u).filter(Boolean)
          const delimiter = /\.csv$/iu.test(metadata) ? ',' : '\t'
          const header = metadataLines[0]?.split(delimiter) ?? []
          const required = ['sample', 'condition', 'cell_type']
          const missing = required.filter(column => !header.includes(column))
          const rows = Math.max(0, metadataLines.length - 1)
          if (contract.cells !== undefined && rows !== contract.cells) {
            contract.state = 'metadata_incomplete'
            contract.errors = [...contract.errors, `元数据行数（${rows}）与矩阵细胞数（${contract.cells}）不一致。`]
          }
          if (missing.length > 0) {
            contract.warnings = [...contract.warnings, `元数据缺少字段：${missing.join(', ')}；结果只能作为探索性分析。`]
          }
        } catch (error) {
          contract.state = 'metadata_incomplete'
          contract.errors = [...contract.errors, `元数据读取失败：${error instanceof Error ? error.message : String(error)}`]
        }
      }
    }
    return validationFromContract(contract)
  }
  @Remote('scTenifoldPlan') async scTenifoldPlan(input: { sessionId: string; config: ScTenifoldProjectConfig }): Promise<ScTenifoldPlanResult> {
    const root = sessionCwd(this.context, input.sessionId); const projectPath = safePath(root, input.config.projectPath); await mkdir(projectPath, { recursive: true }); await Promise.all(['data/raw', 'data/metadata', 'data/processed', 'scripts', 'figures', 'tables', 'reports', 'runs', 'protocols', 'environment', 'provenance'].map(dir => mkdir(join(projectPath, dir), { recursive: true })))
    const validation = await this.scTenifoldValidate(input); const execution = input.config.execution ?? 'r-mcp'; const plan = { schema: 1, method: 'scTenifoldKnk', computationalOnly: true, createdAt: new Date().toISOString(), config: { ...input.config, targets: input.config.targets.map(normalizeGene) }, validation, status: validation.ok ? 'requires_human_review' : 'blocked' }; const encoded = JSON.stringify(plan); const planSha256 = createHash('sha256').update(encoded).digest('hex'); const planPath = join(projectPath, 'plan.json'); const manifestPath = join(projectPath, 'project.yaml'); await writeFile(planPath, JSON.stringify({ ...plan, plan_sha256: planSha256 }, null, 2) + '\n'); await writeFile(manifestPath, [`schema: 1`, `study_id: ${basename(projectPath)}`, `method: scTenifoldKnk`, `computational_only: true`, `raw_data_read_only: true`, ''].join('\n')); return { ok: validation.ok, projectPath, planPath, manifestPath, validation, planSha256, execution }
  }
  @Remote('scTenifoldRun') scTenifoldRun(input: { sessionId: string; config: ScTenifoldProjectConfig; target?: string }): Promise<ScTenifoldRunResult> { return this.runInternal(input) }
  private async runInternal(input: { sessionId: string; config: ScTenifoldProjectConfig; target?: string }, exec?: any): Promise<ScTenifoldRunResult> {
    const cfg = input.config
    const validation = await this.scTenifoldValidate({ sessionId: input.sessionId, config: cfg })
    const target = normalizeGene(input.target ?? cfg.targets[0] ?? '')
    if (!target) throw new Error('至少需要一个目标基因。')
    const root = sessionCwd(this.context, input.sessionId)
    const projectPath = safePath(root, cfg.projectPath)
    const runId = `sc-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
    const runPath = join(projectPath, 'runs', runId)
    await mkdir(runPath, { recursive: true })
    const execution: ScTenifoldExecution = cfg.execution ?? 'r-mcp'
    const result: ScTenifoldRunResult = { ok: true, runId, projectPath, runPath, state: 'planned', execution, target, startedAt: new Date().toISOString(), progress: 0 }
    scRuns.set(runId, { result, projectRoot: projectPath, output: runPath, validation })
    if (execution !== 'r-mcp' && execution !== 'auto') {
      result.ok = false
      result.state = 'failed'
      result.error = 'missing_runtime: 生产 scTenifoldKnk 工作流只允许通过 rdatalinux R MCP 执行；local-r/remote-run 仅保留给开发兼容，不会在生产路由运行。'
      result.finishedAt = new Date().toISOString()
      return result
    }
    await writeFile(join(runPath, 'manifest.json'), JSON.stringify({ runId, target, config: cfg, validation, computationalOnly: true }, null, 2))
    if (!validation.ok) {
      result.ok = false
      result.state = 'failed'
      result.error = `输入审核未通过：${[...validation.errors, ...validation.warnings].join(' ')}`
      result.finishedAt = new Date().toISOString()
      return result
    }
    if (execution === 'r-mcp' || execution === 'auto') {
      const schemas = this.context.tools.schemas()
      const structuredSubmit = schemas.some(schema => schema.name === 'mcp__rdatalinux_r_platform__r_submit_sc_tenifold_knockout')
      const genericSubmit = schemas.some(schema => schema.name === 'mcp__rdatalinux_r_platform__r_submit_script')
      if (!structuredSubmit && !genericSubmit) {
        result.ok = false
        result.state = 'failed'
        result.error = 'missing_runtime: rdatalinux R MCP 未连接或未注册 scTenifoldKnk/R 提交工具；未伪造排队状态。'
        result.finishedAt = new Date().toISOString()
        return result
      }
      if (structuredSubmit && exec !== undefined) {
        const runtime = await callRemoteTool(this.context, exec, 'mcp__rdatalinux_r_platform__r_validate_sc_tenifold_runtime', {})
        if (runtime && typeof runtime === 'object' && (runtime as Record<string, unknown>).available === false) throw new Error('missing_runtime: 远程 R 环境未发现 scTenifoldKnk；未上传数据或创建任务。')
        const remoteProjectId = `zerowall-${basename(projectPath).replace(/[^A-Za-z0-9._-]/gu, '-').slice(0, 100)}`
        await callRemoteTool(this.context, exec, 'mcp__rdatalinux_r_platform__r_register_project', { project_id: remoteProjectId, name: `ZeroWall scTenifoldKnk ${basename(projectPath)}` })
        const inputAbsolute = safePath(projectPath, cfg.input!)
        const sessionRoot = sessionCwd(this.context, input.sessionId)
        const localPath = relative(sessionRoot, inputAbsolute).replaceAll('\\', '/')
        const remoteInput = cfg.remoteInput ?? `data/raw/${basename(inputAbsolute)}`
        if (!cfg.remoteInput) await callRemoteTool(this.context, exec, 'r_upload_workspace_file', { project_id: remoteProjectId, local_path: localPath, remote_path: remoteInput, confirm: true })
        let remoteMetadata: string | undefined
        if (cfg.metadata) {
          const metadataAbsolute = safePath(projectPath, cfg.metadata)
          if (!existsSync(metadataAbsolute)) throw new Error('元数据文件不存在。')
          const metadataLocalPath = relative(sessionRoot, metadataAbsolute).replaceAll('\\', '/')
          remoteMetadata = `data/metadata/${basename(metadataAbsolute)}`
          await callRemoteTool(this.context, exec, 'r_upload_workspace_file', { project_id: remoteProjectId, local_path: metadataLocalPath, remote_path: remoteMetadata, confirm: true })
        }
        const remoteOutput = cfg.remoteOutput ?? `runs/${runId}`
        const submitted = await callRemoteTool(this.context, exec, 'mcp__rdatalinux_r_platform__r_submit_sc_tenifold_knockout', {
          project_id: remoteProjectId, input_path: remoteInput, output_path: remoteOutput, target,
          ...(remoteMetadata ? { metadata_path: remoteMetadata } : {}),
          parameters: { seed: cfg.seed ?? 123, ...(cfg.seeds ? { seeds: cfg.seeds } : {}), nc_nNet: cfg.nc_nNet ?? 10, nc_nCells: cfg.nc_nCells ?? 500, fdr: cfg.fdr ?? 0.05 }, timeout_ms: 3_600_000, confirm: true,
        })
        const remoteJobId = findRemoteJobId(submitted)
        if (!remoteJobId) throw new Error('rdatalinux R MCP 未返回有效的 scTenifoldKnk job id。')
        result.remoteProjectId = remoteProjectId; result.remoteJobId = remoteJobId; result.state = 'queued'; result.progress = 1; result.error = '已提交至 rdatalinux R MCP；可通过 runId 查询异步状态。'
        await persistJson(join(runPath, 'remote-submit.json'), { remoteProjectId, remoteJobId, inputPath: remoteInput, outputPath: remoteOutput, target, submittedAt: new Date().toISOString() })
        return result
      }
      result.state = 'queued'
      result.error = '已准备 R MCP 运行目录，请由 Skill 调用 r_submit_script 执行并用 runId 追踪。'
      return result
    }
    return result
  }
  @Remote('scTenifoldStatus') scTenifoldStatus(runId: string): Promise<ScTenifoldRunResult | undefined> { return this.statusInternal(runId) }
  private async statusInternal(runId: string, exec?: any): Promise<ScTenifoldRunResult | undefined> { const record = scRuns.get(runId); if (!record) return undefined; if (record.result.remoteJobId && record.result.remoteProjectId && exec !== undefined) { try { const remote = await callRemoteTool(this.context, exec, 'mcp__rdatalinux_r_platform__r_get_sc_tenifold_run', { project_id: record.result.remoteProjectId, job_id: record.result.remoteJobId }); const status = String((remote as Record<string, unknown>)?.status ?? ''); if (status === 'succeeded') { record.result.state = 'succeeded'; record.result.progress = 100; record.result.finishedAt = record.result.finishedAt ?? new Date().toISOString() } else if (status === 'failed' || status === 'timed_out') { record.result.state = 'failed'; record.result.error = String((remote as Record<string, unknown>)?.error ?? status); record.result.finishedAt = record.result.finishedAt ?? new Date().toISOString() } else if (status === 'cancelled') { record.result.state = 'cancelled'; record.result.finishedAt = record.result.finishedAt ?? new Date().toISOString() } } catch (error) { record.result.error = error instanceof Error ? error.message : String(error) } } return record.result }
  @Remote('scTenifoldCancel') scTenifoldCancel(runId: string): Promise<ScTenifoldRunResult> { return this.cancelInternal(runId) }
  private async cancelInternal(runId: string, exec?: any): Promise<ScTenifoldRunResult> { const record = scRuns.get(runId); if (!record) throw new Error(`scTenifoldKnk 运行不存在：${runId}`); if (record.result.remoteJobId && record.result.remoteProjectId && exec !== undefined) await callRemoteTool(this.context, exec, 'mcp__rdatalinux_r_platform__r_cancel_sc_tenifold_run', { project_id: record.result.remoteProjectId, job_id: record.result.remoteJobId, confirm: true }); if (record.result.state === 'queued' || record.result.state === 'running') { record.result.state = 'cancelled'; record.result.progress = 0; record.result.finishedAt = new Date().toISOString(); record.child?.kill() } return record.result }
  @Remote('scTenifoldCollect') scTenifoldCollect(runId: string): Promise<{ run: ScTenifoldRunResult; files: string[] }> { return this.collectInternal(runId) }
  private async collectInternal(runId: string, exec?: any): Promise<{ run: ScTenifoldRunResult; files: string[] }> { const record = scRuns.get(runId); if (!record) throw new Error(`scTenifoldKnk 运行不存在：${runId}`); const files: string[] = []; const visit = async (dir: string): Promise<void> => { for (const entry of await readdir(dir, { withFileTypes: true })) { const path = join(dir, entry.name); if (entry.isDirectory()) await visit(path); else files.push(path) } }; if (existsSync(record.output)) await visit(record.output); if (record.result.remoteJobId && record.result.remoteProjectId && exec !== undefined) { await callRemoteTool(this.context, exec, 'mcp__rdatalinux_r_platform__r_get_sc_tenifold_manifest', { project_id: record.result.remoteProjectId, job_id: record.result.remoteJobId }); } return { run: record.result, files } }
  @Remote('scTenifoldReview') scTenifoldReview(runId: string): ScTenifoldReviewResult { const record = scRuns.get(runId); if (!record) throw new Error(`scTenifoldKnk 运行不存在：${runId}`); return runReview(record.validation, record.output) }
  private async remotePostprocess(runId: string, exec: any, stage: string, code: string): Promise<Record<string, unknown>> {
    const record = scRuns.get(runId)
    if (!record) throw new Error(`scTenifoldKnockout 运行不存在：${runId}`)
    await requireRemoteR(this.context, exec)
    const projectId = record.result.remoteProjectId
    if (!projectId) throw new Error('missing_runtime: 运行尚未登记远程 R MCP 项目。')
    const schemas = this.context.tools.schemas()
    if (!schemas.some(schema => schema.name === 'mcp__rdatalinux_r_platform__r_submit_script')) throw new Error('missing_runtime: 远程 R MCP 未提供后处理脚本工具。')
    const submitted = await callRemoteTool(this.context, exec, 'mcp__rdatalinux_r_platform__r_submit_script', { project_id: projectId, code, working_directory: '.', timeout_ms: 600_000, confirm: true })
    const remoteJobId = findRemoteJobId(submitted)
    await persistJson(join(record.output, `${stage}-submit.json`), { stage, remoteProjectId: projectId, remoteJobId, submittedAt: new Date().toISOString() })
    record.result.stage = stage === 'qc' ? 'qc_running' : stage === 'interpret' ? 'interpreting' : 'figures_generating'
    return { runId, stage, remoteProjectId: projectId, ...(remoteJobId ? { remoteJobId } : {}), state: 'queued', artifactPath: relative(record.projectRoot, record.output).replaceAll('\\', '/') }
  }
  private async remoteInput(record: SinglecellRunRecord): Promise<string> {
    try { const value = JSON.parse(await readFile(join(record.output, 'remote-submit.json'), 'utf8')) as { inputPath?: string }; return value.inputPath ?? 'data/raw/input' } catch { return 'data/raw/input' }
  }
  private async scTenifoldQcInternal(runId: string, exec?: any): Promise<Record<string, unknown>> {
    const record = scRuns.get(runId); if (!record) throw new Error(`scTenifoldKnk 运行不存在：${runId}`)
    const inputPath = await this.remoteInput(record)
    const outputPath = `runs/${runId}`
    const code = `if (!requireNamespace('jsonlite', quietly=TRUE)) stop('missing_runtime: jsonlite is required')\ninput_path <- ${JSON.stringify(inputPath)}\nout <- ${JSON.stringify(outputPath)}\ndir.create(file.path(out, 'figures'), recursive=TRUE, showWarnings=FALSE)\nmetrics <- list(input=input_path, cells=NA_integer_, genes=NA_integer_, raw_counts='requires_runtime_validation', strata=list(), excluded=list(), warnings=character())\nif (grepl('\\\\.(csv|tsv|txt)$', input_path, ignore.case=TRUE)) { sep <- ifelse(grepl('\\\\.csv$', input_path, ignore.case=TRUE), ',', '\\t'); x <- tryCatch(utils::read.table(input_path, header=TRUE, sep=sep, check.names=FALSE, row.names=1, comment.char=''), error=function(e) NULL); if (!is.null(x)) { metrics$cells <- ncol(x); metrics$genes <- nrow(x); pdf(file.path(out, 'figures', 'qc-library-size.pdf')); hist(colSums(as.matrix(x)), main='Library size', xlab='Counts'); dev.off(); png(file.path(out, 'figures', 'qc-library-size.png'), width=1800, height=1400, res=300); hist(colSums(as.matrix(x)), main='Library size', xlab='Counts'); dev.off() } }\njsonlite::write_json(metrics, file.path(out, 'qc-summary.json'), auto_unbox=TRUE, pretty=TRUE)\nwriteLines(c('# QC and non-tumor stratification', '', paste0('- Input: ', input_path), '- QC is executed in the selected remote R MCP.', '- Raw-count, sample/donor replication and non-tumor labels require runtime metadata review.'), file.path(out, 'qc-report.zh-CN.md'))`
    return this.remotePostprocess(runId, exec, 'qc', code)
  }
  private async scTenifoldInterpretInternal(runId: string, exec?: any): Promise<Record<string, unknown>> {
    const record = scRuns.get(runId); if (!record) throw new Error(`scTenifoldKnk 运行不存在：${runId}`)
    const outputPath = `runs/${runId}`
    const code = `if (!requireNamespace('jsonlite', quietly=TRUE)) stop('missing_runtime: jsonlite is required')\nout <- ${JSON.stringify(outputPath)}\nf <- file.path(out, 'diff-regulation.tsv')\nrows <- if (file.exists(f)) tryCatch(utils::read.delim(f, check.names=FALSE), error=function(e) data.frame()) else data.frame()\nif (nrow(rows) > 0) { names(rows) <- tolower(names(rows)); gene <- if ('gene' %in% names(rows)) as.character(rows[['gene']]) else as.character(seq_len(nrow(rows))); fc <- if ('fc' %in% names(rows)) as.numeric(rows[['fc']]) else rep(NA_real_, nrow(rows)); padj <- if ('p.adj' %in% names(rows)) as.numeric(rows[['p.adj']]) else rep(NA_real_, nrow(rows)); direction <- ifelse(fc > 0, 'up', ifelse(fc < 0, 'down', 'mixed')); observed <- data.frame(gene=gene, direction=direction, effectSize=fc, adjustedP=padj); utils::write.table(observed, file.path(out, 'interpretation-observed.tsv'), sep='\\t', quote=FALSE, row.names=FALSE); utils::write.table(observed[seq_len(min(1,nrow(observed))),], file.path(out, 'target-gene-summary.tsv'), sep='\\t', quote=FALSE, row.names=FALSE); utils::write.table(data.frame(seed=c(123,456), concordance=NA_real_, note='需要独立种子运行后由 R MCP 汇总'), file.path(out, 'stability-summary.tsv'), sep='\\t', quote=FALSE, row.names=FALSE); utils::write.table(data.frame(control='non-targeting', status='not_run', note='需要单独提交阴性对照'), file.path(out, 'negative-control.tsv'), sep='\\t', quote=FALSE, row.names=FALSE); conclusions <- list(list(category='observed', title='R 统计观察', statement=paste0('R MCP 输出包含 ', nrow(rows), ' 个网络调控结果；方向和效应量见 interpretation-observed.tsv。'), evidence=c('diff-regulation.tsv'), confidence='medium', requiresValidation=TRUE)) } else { observed <- data.frame(); conclusions <- list(list(category='limitation', title='结果尚未可解释', statement='未找到 diff-regulation.tsv，不能判断敲除后的改变。', evidence=character(), confidence='low', requiresValidation=TRUE)) }\njsonlite::write_json(list(state='completed_with_warnings', observedChanges=unname(split(observed, seq_len(nrow(observed)))), pathwayEvidence=list(), conclusions=conclusions, limitations=c('GO/Reactome/PubMed 证据需要通过已连接的 Bio Tools MCP 补充。','虚拟敲除不等同于真实因果实验。')), file.path(out, 'interpretation.json'), auto_unbox=TRUE, pretty=TRUE)`
    return this.remotePostprocess(runId, exec, 'interpret', code)
  }
  @Remote('scTenifoldQc') async scTenifoldQc(runId: string): Promise<ScTenifoldHostToolInstruction> { return { runId, state: 'requires_host_tool', message: '请调用 sc_tenifold_knockout_qc，由 Host 通过远程 R MCP 提交 QC。' } }
  @Remote('scTenifoldInterpret') async scTenifoldInterpret(runId: string): Promise<ScTenifoldHostToolInstruction> { return { runId, state: 'requires_host_tool', message: '请调用 sc_tenifold_knockout_interpret，由 Host 通过远程 R MCP 提交解释。' } }
  @Remote('scTenifoldReport') async scTenifoldReport(runId: string): Promise<{ path: string; review: ScTenifoldReviewResult }> { const record = scRuns.get(runId); if (!record) throw new Error(`scTenifoldKnk 运行不存在：${runId}`); const review = runReview(record.validation, record.output); let interpretation: ScTenifoldInterpretation | undefined; try { interpretation = JSON.parse(await readFile(join(record.output, 'interpretation.json'), 'utf8')) as ScTenifoldInterpretation } catch { /* interpretation may still be queued in R MCP */ } const path = await writeChineseReport(record.projectRoot, record.result.studyId ?? basename(record.projectRoot), runId, interpretation, review); return { path, review } }
  @Remote('scTenifoldFigures') async scTenifoldFigures(runId: string): Promise<ScTenifoldFigureManifest> { const record = scRuns.get(runId); if (!record) throw new Error(`scTenifoldKnk 运行不存在：${runId}`); const figureDir = join(record.output, 'figures'); await mkdir(figureDir, { recursive: true }); const processPath = join(record.output, 'process-diagram.mmd'); await writeFile(processPath, ['flowchart LR', 'A[研究问题/目标基因] --> B[基因标准化与候选建议]', 'B --> C[公开单细胞数据发现与评分]', 'C --> D[获取与 raw counts 校验]', 'D --> E[QC 与非肿瘤筛选]', 'E --> F[按细胞群分层]', 'F --> G[R MCP scTenifoldKnk]', 'G --> H[稳定性与阴性对照]', 'H --> I[机制证据与统计解释]', 'I --> J[图表、报告、实验设计]', ''].join('\n'), 'utf8'); const files: ScTenifoldFigureManifest['figures'] = []; for (const name of ['qc-library-size.pdf', 'qc-library-size.png', 'top-differential-regulation.pdf', 'top-differential-regulation.png', 'volcano.pdf', 'volcano.png']) { if (existsSync(join(figureDir, name))) files.push({ path: relative(record.projectRoot, join(figureDir, name)).replaceAll('\\', '/'), kind: name.split('.')[0]!, format: name.endsWith('.pdf') ? 'pdf' : 'png', sourceRunIds: [runId], title: name }) } return { studyId: record.result.studyId ?? basename(record.projectRoot), runIds: [runId], state: files.length ? 'completed_with_warnings' : 'failed', figures: files, processDiagramPath: relative(record.projectRoot, processPath).replaceAll('\\', '/'), artifactPaths: [relative(record.projectRoot, processPath).replaceAll('\\', '/')], createdAt: new Date().toISOString() } }
  private async scTenifoldFiguresInternal(runId: string, exec: any): Promise<Record<string, unknown>> { const code = `out <- ${JSON.stringify(`runs/${runId}`)}\ndir.create(file.path(out, 'figures'), recursive=TRUE, showWarnings=FALSE)\nf <- file.path(out, 'diff-regulation.tsv')\nif (file.exists(f)) { d <- tryCatch(utils::read.delim(f, check.names=FALSE), error=function(e) data.frame()); if (nrow(d) > 0) { names(d) <- tolower(names(d)); gene <- if ('gene' %in% names(d)) as.character(d[['gene']]) else as.character(seq_len(nrow(d))); fc <- if ('fc' %in% names(d)) as.numeric(d[['fc']]) else rep(0, nrow(d)); top <- order(abs(fc), decreasing=TRUE)[seq_len(min(20, nrow(d)))]; for (ext in c('pdf','png')) { fn <- file.path(out, 'figures', paste0('top-differential-regulation.', ext)); if (ext == 'pdf') pdf(fn, width=7, height=5) else png(fn, width=2100, height=1500, res=300); barplot(fc[top], names.arg=gene[top], las=2, col=ifelse(fc[top] >= 0, '#2F6B9A', '#C54B4B'), main='Top differential regulation', ylab='FC'); dev.off() }; for (ext in c('pdf','png')) { fn <- file.path(out, 'figures', paste0('volcano.', ext)); if (ext == 'pdf') pdf(fn, width=7, height=5) else png(fn, width=2100, height=1500, res=300); plot(fc, -log10(seq_along(fc)/length(fc)), pch=16, col='#4C78A8', main='Virtual knockout regulation', xlab='FC', ylab='-log10(p)'); dev.off() } } }`; const queued = await this.remotePostprocess(runId, exec, 'figures', code); const manifest = await this.scTenifoldFigures(runId); return { ...queued, ...manifest } }
  @Remote('scTenifoldExperimentalDesign') async scTenifoldExperimentalDesign(runId: string): Promise<{ paths: string[] }> { const record = scRuns.get(runId); if (!record) throw new Error(`scTenifoldKnk 运行不存在：${runId}`); const dir = join(record.projectRoot, 'protocols'); await mkdir(dir, { recursive: true }); const files: Array<[string, string]> = [['validation-plan.md', '# 计算结果后续验证方案\n\n本文件只提供供研究人员审核的 CRISPRi、siRNA 或药理抑制验证思路，不执行湿实验。\n'], ['controls.tsv', 'control\tpurpose\nnon-targeting\t阴性对照\nrescue\t特异性验证\n'], ['replicate-plan.tsv', 'replicate_type\tminimum\nbiological\t3\ntechnical\t2\n'], ['readout-plan.md', '# 读出建议\n\n根据 R MCP 发现的显著基因和通路，选择 qPCR、流式、蛋白或 CITE-seq 读出，并预先定义效应量与接受标准。\n'], ['acceptance-criteria.md', '# 接受标准\n\n真实实验前由研究人员审核靶向效率、阴性对照、重复数、统计功效和生物安全要求。\n']]; await Promise.all(files.map(([name, body]) => writeFile(join(dir, name), body, 'utf8'))); return { paths: files.map(([name]) => relative(record.projectRoot, join(dir, name)).replaceAll('\\', '/')) } }
  @Remote('validateDataset') async validateDataset(input: { sessionId: string; inputPath: string; targets: string[] }): Promise<ScTenifoldDataContract> { const root = sessionCwd(this.context, input.sessionId); const path = safePath(root, input.inputPath); const contract = dataContract(path, input.targets.map(normalizeGene)); contract.checksum = createHash('sha256').update(await readFile(path)).digest('hex'); return contract }
}

declare module '@deepseek-ai/cordis' {
  interface Context { zerowallSinglecell: ZeroWallSinglecellService }
}

function basenameFromUrl(value: string): string { try { const name = new URL(value).pathname.split('/').pop() || 'dataset.bin'; return name.replace(/[^A-Za-z0-9._-]/gu, '_') } catch { return 'dataset.bin' } }
export function apply(ctx: Context): void { ctx.plugin(ZeroWallSinglecellService) }
export default { name, inject, apply }
