import type { JsonObject } from '@zerowallscience/research-store/types'

export const NHANES_CONTRACT_VERSION = '7.0.0-nhanes-contract.1'

export interface NhanesDatasetSpec {
  cycle: string
  component: string
  dataset: string
  weight: string
  variables?: string[]
  ageMin?: number
  ageMax?: number
}

export interface NhanesContractInput {
  datasets: NhanesDatasetSpec[]
  strata: string
  psu: string
  weight?: string
  component?: string
  cycleStrategy?: 'per-cycle' | 'official-combined'
  domainDesign?: 'survey-domain' | 'pre-filtered-subset'
  domainExpression?: string
  isolatedPsuHandling?: 'survey-option-recorded' | 'not-applicable'
  previewRows?: number
  analysisRows?: number
  previewTruncated?: boolean
  dxxH?: boolean
}

export function validateNhanesContract(input: JsonObject): JsonObject {
  const findings: JsonObject[] = []; const missing: string[] = []; const errors: string[] = []
  const add = (code: string, message: string, severity: 'error' | 'warning' = 'error'): void => { findings.push({ code, message, severity }) }
  const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
  const number = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined
  const datasets = Array.isArray(input.datasets) ? input.datasets : []
  if (datasets.length === 0) missing.push('datasets')
  const cycles = new Set<string>()
  const components = new Set<string>()
  for (const [index, raw] of datasets.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { errors.push(`datasets[${index}] must be an object.`); continue }
    const item = raw as Record<string, unknown>; const cycle = text(item.cycle); const component = text(item.component); const dataset = text(item.dataset); const weight = text(item.weight)
    if (!cycle) missing.push(`datasets[${index}].cycle`); else cycles.add(cycle)
    if (!component) missing.push(`datasets[${index}].component`); else components.add(component.toLowerCase())
    if (!dataset) missing.push(`datasets[${index}].dataset`)
    if (!weight) missing.push(`datasets[${index}].weight`)
    if (item.ageMin !== undefined && number(item.ageMin) === undefined) errors.push(`datasets[${index}].ageMin must be numeric.`)
    if (item.ageMax !== undefined && number(item.ageMax) === undefined) errors.push(`datasets[${index}].ageMax must be numeric.`)
  }
  const strata = text(input.strata); const psu = text(input.psu); const primaryWeight = text(input.weight)
  if (!strata) missing.push('strata'); if (!psu) missing.push('psu')
  if (!primaryWeight && datasets.length > 0) missing.push('weight')
  if (components.size > 1 && !text(input.componentWeightRationale)) add('mixed-components', '多个 NHANES 组件必须说明按最受限组件选择权重的依据，并核验连接与样本交集。')
  if (primaryWeight && datasets.some(raw => raw && typeof raw === 'object' && text((raw as Record<string, unknown>).weight) !== primaryWeight)) add('weight-mismatch', 'DatasetContract 的主权重与数据集声明不一致。')
  const strategy = text(input.cycleStrategy)
  if (cycles.size > 1 && !['per-cycle', 'official-combined'].includes(strategy)) missing.push('cycleStrategy')
  if (cycles.size > 1 && strategy === 'per-cycle') add('per-cycle-estimates', '多周期按周期分别估计；不得使用未经记录的“除以周期数”权重规则。', 'warning')
  if (cycles.size > 1 && strategy === 'official-combined' && input.combinedWeightSource === undefined) missing.push('combinedWeightSource')
  const domainExpression = text(input.domainExpression)
  if (domainExpression && text(input.domainDesign) !== 'survey-domain') add('domain-design-missing', '子人群必须在完整调查设计上使用 domain/subset；预过滤子样本不能替代设计记录。')
  if (text(input.domainDesign) === 'survey-domain' && !domainExpression) missing.push('domainExpression')
  if (strata && psu && input.isolatedPsuHandling === undefined) missing.push('isolatedPsuHandling')
  const previewRows = number(input.previewRows); const analysisRows = number(input.analysisRows)
  if (previewRows !== undefined && analysisRows !== undefined && previewRows < analysisRows) add('preview-is-truncated', '预览行数少于正式分析行数；必须确认正式任务没有复用预览截断数据。', 'warning')
  if (input.previewTruncated === true) add('preview-truncated', '当前输入明确标记为截断预览，不能作为完整调查分析数据。')
  const dxx = datasets.find(raw => raw && typeof raw === 'object' && text((raw as Record<string, unknown>).dataset).toUpperCase().replace(/\.[^.]+$/u, '') === 'DXX_H') as Record<string, unknown> | undefined
  if ((input.dxxH === true || dxx) && [...cycles].some(cycle => /2013.?2014/u.test(cycle))) {
    const ageMin = number(input.ageMin ?? dxx?.ageMin); const ageMax = number(input.ageMax ?? dxx?.ageMax)
    if (ageMin === undefined || ageMax === undefined) missing.push('dxxH.ageMin/dxxH.ageMax')
    else if (ageMin < 8 || ageMax > 69) add('dxxH-age-range', '2013–2014 DXX_H 仅适用于其规定年龄范围；当前契约超出 8–69 岁，标记为不适用。')
  }
  const status = errors.length || findings.some(item => item.severity === 'error') ? 'not-applicable' : missing.length ? 'pending' : 'usable'
  return { contract: NHANES_CONTRACT_VERSION, status, errors, missing: [...new Set(missing)], findings, cycles: [...cycles], components: [...components], scope: '仅检查声明的 DatasetContract 元数据；usable 不证明变量值、下载内容或模型结果正确。' }
}
