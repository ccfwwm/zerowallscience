import { useEffect, useRef, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '../../lib/typert.remote-client.js'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'

type Document = { id: string; kind: string; version: number; payload: Record<string, unknown> }
type Task = { id: string; name: string; exploratory: boolean; status: string; runId?: string }
type Result = { status?: string; methodStatus?: string; analysisComplete?: boolean; inputsCurrent?: boolean; run?: { id?: string }; artifacts?: Array<{ id: string; name: string; uri: string }>; evidence?: { id: string } | null; result?: Record<string, unknown>; error?: string; artifactError?: string; errors?: string[] }
type Remote = TypertRemoteNamespaceMap['zerowallResearch']
const refs = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const numeric = (value: unknown): string => typeof value === 'number' && Number.isFinite(value) ? value.toPrecision(7) : '未提供'

function Estimates({ result }: { result: Record<string, unknown> }): JSX.Element {
  if (result.analysis === 'contrast_scan') {
    const layers = object(result.layers)
    const landscape = object(layers.landscape)
    const adjusted = object(layers.adjusted)
    const univariableRows = (Array.isArray(landscape.results) ? landscape.results : []).map(object)
    const adjustedRows = (Array.isArray(adjusted.results) ? adjusted.results : []).map(object)
    const coverage = object(result.coverage)
    const estimateCells = (value: Record<string, unknown>): JSX.Element => <>{['beta', 'se', 'ci_low', 'ci_high', 'p_value'].map(key => <td key={key}>{numeric(value[key])}</td>)}</>
    return <>
      <p>结果面板：{String(object(result.outcome_panel).id ?? '未知')} · UVMR {String(coverage.completed_univariable ?? 0)}/{String(coverage.expected_univariable ?? 0)} · MVMR {String(coverage.completed_mvmr ?? 0)}/{String(coverage.expected_mvmr ?? 0)} · 差异检验 {String(coverage.completed_contrasts ?? 0)}/{String(coverage.expected_contrasts ?? 0)}</p>
      <h4>第一层：暴露 × 结局的 IVW UVMR 全景扫描</h4>
      {univariableRows.length > 0 && <table aria-label="UVMR 面板扫描"><thead><tr><th>结局</th><th>暴露</th><th>状态</th><th>β</th><th>SE</th><th>CI 下限</th><th>CI 上限</th><th>P 值</th><th>工具数</th></tr></thead><tbody>{univariableRows.map((row, index) => <tr key={`${String(row.outcome_id)}-${String(row.exposure_id)}-${index}`}><td>{String(row.outcome_trait ?? row.outcome_id ?? '未知')}</td><td>{String(row.exposure_trait ?? row.exposure_id ?? '未知')}</td><td>{String(row.status ?? '未知')}</td>{estimateCells(row)}<td>{String(row.instruments ?? '未提供')}</td></tr>)}</tbody></table>}
      <h4>第二层：同一结局中的联合 MVMR 与条件差异检验</h4>
      {adjustedRows.map((row, index) => {
        const effects = (Array.isArray(row.effects) ? row.effects : []).map(object)
        const strengths = (Array.isArray(row.conditional_f_statistics) ? row.conditional_f_statistics : []).map(object)
        const difference = object(row.difference_test)
        return <section key={`${String(row.outcome_id)}-${index}`} aria-label={`MVMR ${String(row.outcome_id ?? index + 1)}`}>
          <h5>{String(row.outcome_trait ?? row.outcome_id ?? '未知')} · 联合模型工具数 {String(row.instruments ?? '未提供')} · Q={numeric(row.heterogeneity_Q)}, df={String(row.heterogeneity_df ?? '未提供')}, P={numeric(row.heterogeneity_p)}</h5>
          <table aria-label={`MVMR 独立效应 ${String(row.outcome_id ?? index + 1)}`}><thead><tr><th>暴露</th><th>条件 F</th><th>β</th><th>SE</th><th>CI 下限</th><th>CI 上限</th><th>P 值</th></tr></thead><tbody>{effects.map((effect, effectIndex) => <tr key={String(effect.exposure_id ?? effectIndex)}><td>{String(effect.trait ?? effect.exposure_id ?? '未知')}</td><td>{numeric(strengths[effectIndex]?.f_statistic)}</td>{estimateCells(effect)}</tr>)}</tbody></table>
          {difference.beta !== undefined && <p>同一 MVMR 模型内系数差（{String(difference.contrast ?? '暴露 A − 暴露 B')}，单位 {String(difference.unit ?? '未提供')}）：β={numeric(difference.beta)}，SE={numeric(difference.se)}，95% CI [{numeric(difference.ci_low)}, {numeric(difference.ci_high)}]，P={numeric(difference.p_value)}，统计量={numeric(difference.statistic)}</p>}
          {row.status !== 'succeeded' && <p>此结局联合模型未完成：{String(row.code ?? row.status)}</p>}
        </section>
      })}
      {univariableRows.length === 0 && adjustedRows.length === 0 && <p>尚无已取回的面板数值结果。</p>}
      {Array.isArray(result.limitations) && result.limitations.length > 0 && <ul>{result.limitations.map((value, index) => <li key={index}>{String(value)}</li>)}</ul>}
    </>
  }
  const rows = Object.entries(object(result.analyses)).flatMap(([method, value]) => method === 'egger' ? ['slope', 'intercept'].map(term => [`${method} ${term}`, object(object(value)[term])] as const) : [[method, object(value)] as const])
    .filter(([, value]) => typeof value.beta === 'number' && Number.isFinite(value.beta))
  const probabilities = Object.entries(object(result.summary)).filter(([name, value]) => /^PP\.H[0-4]\.abf$/u.test(name) && typeof value === 'number' && Number.isFinite(value))
  return <>
    {rows.length > 0 && <table aria-label="遗传分析数值"><thead><tr><th>方法</th><th>效应</th><th>标准误</th><th>置信下限</th><th>置信上限</th><th>P 值</th></tr></thead><tbody>{rows.map(([name, value]) => <tr key={name}><td>{name}</td>{['beta', 'se', 'ci_low', 'ci_high', 'p_value'].map(key => <td key={key}>{numeric(value[key])}</td>)}</tr>)}</tbody></table>}
    {probabilities.length > 0 && <table aria-label="共定位后验概率"><thead><tr><th>假设</th><th>后验概率</th></tr></thead><tbody>{probabilities.map(([name, value]) => <tr key={name}><td>{name}</td><td>{numeric(value)}</td></tr>)}</tbody></table>}
    {!rows.length && !probabilities.length && <p>尚无已取回的数值结果。</p>}
    {Object.keys(object(result.stoppedMethods)).length > 0 && <details open><summary>停止的方法</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(result.stoppedMethods, null, 2)}</pre></details>}
    {Array.isArray(result.errors) && result.errors.length > 0 && <ul>{result.errors.map((value, index) => <li key={index}>{String(value)}</li>)}</ul>}
    {Array.isArray(result.limitations) && result.limitations.length > 0 && <ul>{result.limitations.map((value, index) => <li key={index}>{String(value)}</li>)}</ul>}
  </>
}

export function GeneticAnalysisPanel({ remote, sessionId, study, documents, tasks, onChanged }: {
  remote: Remote; sessionId: string; study: { id: string; currentPlanId?: string; gate1: string; currentFreezeId?: string }; documents: Document[]; tasks: Task[]; onChanged: () => Promise<void>
}): JSX.Element {
  const plans = documents.filter(item => item.kind === 'analysis-plan' && item.payload.genetics)
  const [planId, setPlanId] = useState(''); const [contractId, setContractId] = useState(''); const [taskId, setTaskId] = useState('')
  const plan = plans.find(item => item.id === planId) ?? plans.find(item => item.id === study.currentPlanId) ?? plans[0]
  const contracts = documents.filter(item => item.kind === 'dataset-contract' && refs(plan?.payload.inputs).includes(item.id))
  const contract = contracts.find(item => item.id === contractId) ?? (contracts.length === 1 ? contracts[0] : undefined)
  const eligibleTasks = tasks.filter(item => refs(plan?.payload.taskIds ?? plan?.payload.researchTaskIds).includes(item.id))
  const task = eligibleTasks.find(item => item.id === taskId) ?? (eligibleTasks.length === 1 ? eligibleTasks[0] : undefined)
  const boundTasks = tasks.filter(item => item.runId)
  const [runId, setRunId] = useState(''); const [result, setResult] = useState<Result>(); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false)
  const savedRunId = boundTasks.find(item => item.runId === runId)?.runId ?? task?.runId ?? (boundTasks.length === 1 ? boundTasks[0]?.runId : undefined)
  const refreshRunId = savedRunId ?? result?.run?.id
  const lock = useRef(false); const generation = useRef(0)
  useEffect(() => { generation.current++; lock.current = false; setBusy(false); setResult(undefined); setMessage(''); return () => { generation.current++ } }, [sessionId, study.id])
  const blocked = Boolean(task && !task.exploratory && (study.gate1 !== 'approved' || !study.currentFreezeId || plan?.id !== study.currentPlanId))
  const requestId = plan && contract && task ? `genetics-${task.id}-${plan.id}-v${plan.version}-c${contract.version}` : ''
  const execute = async (refresh: boolean): Promise<void> => {
    if (lock.current) return
    const current = generation.current; lock.current = true; setBusy(true); setMessage('')
    try {
      let value: Result
      if (refresh) {
        if (!refreshRunId || !remote.refreshGeneticAnalysis) throw new Error('请选择已绑定的遗传 Run，并连接支持遗传分析的 Host。')
        value = unwrapRemoteResult('refreshGeneticAnalysis', await remote.refreshGeneticAnalysis({ sessionId, studyId: study.id, runId: refreshRunId })) as Result
      } else {
        if (!plan || !contract || !task || !remote.runGeneticAnalysis) throw new Error('请先选择遗传分析计划、数据契约和计划内任务。')
        value = unwrapRemoteResult('runGeneticAnalysis', await remote.runGeneticAnalysis({ sessionId, studyId: study.id, planId: plan.id, contractId: contract.id, taskId: task.id, requestId, expectedPlanVersion: plan.version })) as Result
      }
      if (current !== generation.current) return
      setResult(value)
      if (value.run?.id) setRunId(value.run.id)
      setMessage(value.analysisComplete ? '数值结果已取回。证据与核心主张仍待科学复核。' : '任务状态已更新；未完成或停止的分析保留原始状态。')
      await onChanged()
    } catch (error) { if (current === generation.current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { if (current === generation.current) { lock.current = false; setBusy(false) } }
  }
  const reset = (): void => { setResult(undefined); setMessage(''); setRunId('') }
  return <section aria-label="遗传确定性分析" style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 14, marginTop: 14 }}>
    <h3>UVMR、MVMR 与区域共定位</h3>
    <p>使用已协调的汇总统计执行单变量 MR、联合 MVMR、固定结局面板扫描或 coloc.abf。面板扫描逐一计算暴露 × 结局的 IVW，再在每个结局内联合拟合两暴露并检验模型内系数差；要求远端 Runner 提供匹配版本及完整结果产物。</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <label>分析计划<select aria-label="遗传分析计划" value={plan?.id ?? ''} disabled={busy} onChange={event => { setPlanId(event.target.value); setContractId(''); setTaskId(''); reset() }}><option value="">选择计划</option>{plans.map(item => <option key={item.id} value={item.id}>{String(item.payload.method ?? '遗传分析')} · v{item.version} · {item.id}</option>)}</select></label>
      <label>数据契约<select aria-label="遗传数据契约" value={contract?.id ?? ''} disabled={busy} onChange={event => { setContractId(event.target.value); reset() }}><option value="">选择契约</option>{contracts.map(item => <option key={item.id} value={item.id}>{item.id} · v{item.version}</option>)}</select></label>
      <label>研究任务<select aria-label="遗传研究任务" value={task?.id ?? ''} disabled={busy} onChange={event => { setTaskId(event.target.value); reset() }}><option value="">选择任务</option>{eligibleTasks.map(item => <option key={item.id} value={item.id}>{item.name} · {item.exploratory ? '探索' : '验证'} · {item.status}</option>)}</select></label>
    </div>
    {!plans.length && <p>暂无包含 genetics 参数的分析计划。先保存数据契约的 geneticInput、计划的 inputs 和 taskIds。</p>}
    {plan && <details><summary>查看保存的遗传分析参数</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(plan.payload.genetics, null, 2)}</pre><p>请求标识：<code>{requestId || '请完成选择'}</code></p></details>}
    {blocked && <p>此确认性任务需先通过门禁一并冻结当前方案。</p>}
    <button type="button" disabled={busy || !plan || !contract || !task || blocked} onClick={() => void execute(false)}>提交遗传分析</button>
    <div style={{ marginTop: 12 }}><label>已绑定 Run<select aria-label="遗传已绑定 Run" value={savedRunId ?? ''} disabled={busy} onChange={event => { setRunId(event.target.value); setResult(undefined); setMessage('') }}><option value="">选择已有任务</option>{boundTasks.map(item => <option key={item.id} value={item.runId}>{item.name} · {item.runId}</option>)}</select></label> <button type="button" disabled={busy || !refreshRunId} onClick={() => void execute(true)}>刷新遗传状态与产物</button></div>
    <p>刷新从持久化 Run 恢复，即使计划已修订也可取回历史产物；Host 会核对遗传任务归属。关闭视图不会取消远程任务。</p>
    {busy && <p role="status">正在提交或取回遗传分析…</p>}{message && <p role="status">{message}</p>}
    {result && <div aria-label="遗传执行结果"><p>任务状态：{result.status ?? '未知'} · 方法状态：{result.methodStatus ?? '尚未取回'} · 严格分析完成：{result.analysisComplete ? '是' : '否'}</p>{result.run?.id && <p>Run：<code>{result.run.id}</code></p>}{result.inputsCurrent === false && <p>研究输入或批准已变化，历史结果不能直接作为当前方案的证据。</p>}{result.error && <p>{result.error}</p>}{result.artifactError && <p>产物校验失败：{result.artifactError}</p>}{result.errors?.length ? <ul>{result.errors.map((error, index) => <li key={index}>{error}</li>)}</ul> : null}{result.result && <Estimates result={result.result} />}{result.evidence?.id ? <p>证据记录：<code>{result.evidence.id}</code> · 待科学复核</p> : <p>本次未登记新的科学证据。</p>}{result.artifacts?.length ? <details><summary>取回的产物</summary><ul>{result.artifacts.map(artifact => <li key={artifact.id}>{artifact.name}：<code>{artifact.uri}</code></li>)}</ul></details> : null}</div>}
  </section>
}
