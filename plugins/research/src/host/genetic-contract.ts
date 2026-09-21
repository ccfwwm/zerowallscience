import type { JsonObject } from '@zerowallscience/research-store/types'

export const GENETIC_CONTRACT_VERSION = '7.0.0-genetic-contract.1'

export function validateGeneticContract(input: JsonObject): JsonObject {
  const findings: JsonObject[] = []; const missing: string[] = []; const errors: string[] = []
  const add = (code: string, message: string): void => { findings.push({ code, message }) }
  const text = (value: unknown): string => typeof value === 'string' ? value.trim().toLowerCase() : ''
  const number = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined
  const method = text(input.method)
  if (!['mr', 'ivw', 'wald-ratio', 'mr-egger', 'coloc', 'susie-coloc', 'mvmr', 'two-step-mr'].includes(method)) missing.push('method')
  for (const field of ['exposureDefinition', 'outcomeDefinition', 'ancestry', 'genomeBuild', 'effectUnit']) if (!text(input[field])) missing.push(field)
  if (input.sampleOverlapChecked !== true) missing.push('sampleOverlapChecked')
  if (input.harmonized !== true) missing.push('harmonized')
  const instruments = number(input.instrumentCount)
  if (['mr', 'ivw', 'wald-ratio', 'mr-egger', 'mvmr', 'two-step-mr'].includes(method)) {
    if (instruments === undefined) missing.push('instrumentCount')
    else if (!Number.isInteger(instruments) || instruments < 1) errors.push('instrumentCount must be a positive integer.')
    if (method === 'wald-ratio' && instruments !== undefined && instruments !== 1) add('wald-ratio-tool-count', 'Wald ratio 只适用于单个有效工具；多工具需按冻结方案选择合并方法。')
    if (method === 'mr-egger' && instruments !== undefined && instruments < 3) add('egger-insufficient-instruments', 'MR-Egger 至少需要适用的多个工具；单工具或两个工具不得自动运行。')
    const f = number(input.minimumFStatistic); if (f === undefined) missing.push('minimumFStatistic'); else if (f < 10) add('weak-instrument', '最低 F 统计量低于 10，需保留弱工具限制；F≥10 也不替代条件强度检查。')
  }
  if (['coloc', 'susie-coloc'].includes(method)) {
    if (input.completeRegion !== true) missing.push('completeRegion')
    if (input.requiredFields !== true) missing.push('requiredFields')
    if (input.leadSnpOnly === true) add('lead-snp-only', '只有 lead SNP 不能执行区域共定位。')
    if (method === 'susie-coloc' && input.matchedLd !== true) missing.push('matchedLd')
  }
  if (method === 'mvmr' && input.conditionalFStatistic === undefined) missing.push('conditionalFStatistic')
  if (method === 'two-step-mr' && input.mediationEstimand === undefined) missing.push('mediationEstimand')
  if (input.sampleOverlap === 'unknown') add('sample-overlap-unknown', '样本重叠未知时只能登记限制，不能把 MR 结果写成无偏因果证据。')
  const status = errors.length || findings.some(item => item.code === 'lead-snp-only' || item.code === 'wald-ratio-tool-count') ? 'not-applicable' : missing.length ? 'pending' : 'usable'
  return { contract: GENETIC_CONTRACT_VERSION, status, errors, missing: [...new Set(missing)], findings, scope: '仅检查遗传分析声明元数据；usable 不证明汇总统计、LD、祖源、样本重叠、因果方向或数值结果正确。' }
}
