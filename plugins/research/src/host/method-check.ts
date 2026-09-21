import type { JsonObject } from '@zerowallscience/research-store/types'

export const METHOD_CHECK_VERSION = '7.0.0-method-fit.1'

/** A bounded fit check of reported metadata, never a certification of raw data. */
export function evaluateMethod(context: JsonObject): JsonObject {
  const findings: JsonObject[] = []
  const missing: string[] = []
  const add = (code: string, message: string): void => { findings.push({ code, message }) }
  const text = (key: string): string => typeof context[key] === 'string' ? (context[key] as string).trim().toLowerCase() : ''
  const number = (key: string): number | undefined => typeof context[key] === 'number' && Number.isFinite(context[key]) ? context[key] as number : undefined
  const test = text('testUsed')
  const design = text('design')
  const paired = /paired|repeated|within.subject|crossover|pre.post/u.test(design) && !/unpaired/u.test(design)
  const independent = /independent|between.subject|parallel/u.test(design)
  const outcome = text('outcomeType')
  const groups = number('groups')
  const count = number('instrumentCount')
  const recognized = /t.?test|anova|mann.whitney|kruskal.wallis|wilcoxon|chi.square|regression|mr|wald.ratio|coloc|pseudobulk|survey/u.test(test)
  if (!test || !recognized) missing.push('supported testUsed')
  if (!design) missing.push('design')
  if (!outcome) missing.push('outcomeType')
  if (paired && /independent t|unpaired t|mann.whitney|one.way anova/u.test(test)) add('paired-design-independent-test', '配对或重复测量数据不能按独立组检验；核验供者/时间映射并选择适用模型。')
  if (independent && /paired t|signed.rank|repeated.measures/u.test(test) && !/unpaired/u.test(test)) add('independent-design-paired-test', '独立组数据缺少配对关系，不能使用配对检验。')
  if (groups !== undefined && groups > 2 && /t.?test|mann.whitney|signed.rank/u.test(test)) add('more-than-two-groups', '两组检验不能直接表示多组总体比较；需说明预设对比与多重比较范围。')
  if (outcome && outcome !== 'continuous' && /t.?test|anova|linear regression/u.test(test)) add('outcome-model-mismatch', '当前连续结局方法与所报结局类型不匹配。')
  if (outcome && outcome !== 'binary' && /logistic regression/u.test(test)) add('binary-model-mismatch', '普通二项 logistic 模型需要二元结局；其他类型需明确模型族。')
  if (/t.?test|anova/u.test(test) && ['unknown', '', 'assumed'].includes(text('normality'))) missing.push('distribution/residual diagnostics')
  const comparisons = number('nComparisons')
  if (comparisons !== undefined && comparisons > 1) {
    if (context.correctionApplied === false) add('multiple-testing', '多个检验未记录校正，需核对预设比较族及错误率控制。')
    else if (context.correctionApplied !== true) missing.push('correctionApplied')
  }
  if (/mr|wald.ratio/u.test(test)) {
    if (count === undefined) missing.push('instrumentCount')
    else if (!Number.isInteger(count) || count < 1) add('no-valid-instrument', '缺少有效遗传工具。')
    else if (count < 3 && /egger/u.test(test)) add('egger-insufficient-instruments', 'MR-Egger 不能用于单工具或仅两个工具。')
    else if (count === 1 && !/wald|ratio/u.test(test)) add('single-instrument-method', '单工具需适用的比值估计，不能按多工具合并或稳健分析执行。')
    const f = number('minimumFStatistic')
    if (f === undefined) missing.push('minimumFStatistic')
    else if (f < 10) add('weak-instrument-warning', 'F < 10 触发常规弱工具告警；不代表 F ≥ 10 即充分，也不替代 MVMR 条件强度。')
    for (const field of ['ancestryChecked', 'buildChecked', 'harmonized', 'sampleOverlapChecked']) if (context[field] !== true) missing.push(field)
  }
  if (/coloc/u.test(test)) {
    if (context.leadSnpOnly === true) add('lead-snp-only', '只有 lead SNP 不能执行区域共定位。')
    for (const field of ['completeRegion', 'requiredFields']) if (context[field] !== true) missing.push(field)
    if (/susie/u.test(test) && context.matchedLd !== true) missing.push('matchedLd')
  }
  if (/single.cell|pseudobulk/u.test(test)) {
    if (context.observationUnit === 'cell') add('cell-pseudoreplication', '细胞不能替代独立供者作为组间推断重复。')
    if (context.donorMetadata !== true) missing.push('donorMetadata')
  }
  if (/survey/u.test(test)) for (const field of ['componentWeight', 'cycleStrategy', 'strata', 'psu', 'domainDesign']) if (!text(field)) missing.push(field)
  return { checker: METHOD_CHECK_VERSION, status: findings.length ? 'flagged' : missing.length ? 'insufficient_information' : 'no_listed_issue', findings, missing, scope: 'Checks supplied metadata only; no_listed_issue does not certify applicability, provenance, power, or correctness.' }
}
