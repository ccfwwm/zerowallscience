import { useEffect, useRef, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '../../lib/typert.remote-client.js'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'

type Document = { id: string; kind: string; version: number; payload: Record<string, unknown> }
type Task = { id: string; name: string; exploratory: boolean; status: string }
type Result = { status?: string; analysisComplete?: boolean; run?: { id?: string }; artifact?: { uri?: string; id?: string }; evidence?: { id?: string }; error?: string; errors?: string[] }
type Remote = TypertRemoteNamespaceMap['zerowallResearch']
const refs = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

export function NhanesSurveyPanel({ remote, sessionId, study, documents, tasks, onChanged }: {
  remote: Remote; sessionId: string; study: { id: string; currentPlanId?: string; gate1: string; currentFreezeId?: string }; documents: Document[]; tasks: Task[]; onChanged: () => Promise<void>
}): JSX.Element {
  const plans = documents.filter(item => item.kind === 'analysis-plan' && item.payload.nhanesSurvey)
  const [planId, setPlanId] = useState('')
  const plan = plans.find(item => item.id === planId) ?? plans.find(item => item.id === study.currentPlanId) ?? plans[0]
  const contracts = documents.filter(item => item.kind === 'dataset-contract' && refs(plan?.payload.inputs).includes(item.id))
  const eligibleTasks = tasks.filter(item => refs(plan?.payload.taskIds ?? plan?.payload.researchTaskIds).includes(item.id))
  const [contractId, setContractId] = useState('')
  const contract = contracts.find(item => item.id === contractId) ?? (contracts.length === 1 ? contracts[0] : undefined)
  const [taskId, setTaskId] = useState('')
  const task = eligibleTasks.find(item => item.id === taskId) ?? (eligibleTasks.length === 1 ? eligibleTasks[0] : undefined)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<Result>()
  const generation = useRef(0)
  const lock = useRef(false)
  useEffect(() => { generation.current++; return () => { generation.current++ } }, [sessionId, study.id])
  const requestId = plan && contract && task ? `nhanes-${task.id}-${plan.id}-v${plan.version}-c${contract.version}` : ''
  const blocked = Boolean(task && !task.exploratory && (study.gate1 !== 'approved' || !study.currentFreezeId || plan?.id !== study.currentPlanId))
  const execute = async (): Promise<void> => {
    if (lock.current) return
    const current = generation.current
    lock.current = true; setBusy(true); setMessage('')
    try {
      if (!plan || !contract || !task || !remote.runNhanesSurvey) throw new Error('请先选择已登记的 NHANES 分析计划、数据契约和计划内任务，并连接支持此流程的 Host。')
      const value = unwrapRemoteResult('runNhanesSurvey', await remote.runNhanesSurvey({ sessionId, studyId: study.id, contractId: contract.id, planId: plan.id, taskId: task.id, requestId, expectedPlanVersion: plan.version })) as Result
      if (current !== generation.current) return
      setResult(value)
      setMessage(value.status === 'blocked' ? '适用性检查已停止分析。请核对下方原因，修订计划后再执行。' : '执行结果已登记；核心主张仍需证据审计与人工认可。')
      await onChanged()
    } catch (error) { if (current === generation.current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { if (current === generation.current) { lock.current = false; setBusy(false) } }
  }
  const resetResult = (): void => { setResult(undefined); setMessage('') }
  return <section aria-label="NHANES 确定性分析" style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 14, marginTop: 14 }}>
    <h3>NHANES 加权分析</h3>
    <p>使用保存的变量、调查设计、缺失码与子人群范围执行均值或回归。确认性分析要求已批准的冻结方案；重试同一请求会取回已有 Run。</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <label>分析计划<select aria-label="NHANES 分析计划" value={plan?.id ?? ''} disabled={busy} onChange={event => { setPlanId(event.target.value); setContractId(''); setTaskId(''); resetResult() }}><option value="">选择计划</option>{plans.map(item => <option key={item.id} value={item.id}>{String(item.payload.method ?? 'NHANES')} · v{item.version} · {item.id}</option>)}</select></label>
      <label>数据契约<select aria-label="NHANES 数据契约" value={contract?.id ?? ''} disabled={busy} onChange={event => { setContractId(event.target.value); resetResult() }}><option value="">选择契约</option>{contracts.map(item => <option key={item.id} value={item.id}>{item.id} · v{item.version}</option>)}</select></label>
      <label>研究任务<select aria-label="NHANES 研究任务" value={task?.id ?? ''} disabled={busy} onChange={event => { setTaskId(event.target.value); resetResult() }}><option value="">选择任务</option>{eligibleTasks.map(item => <option key={item.id} value={item.id}>{item.name} · {item.exploratory ? '探索' : '验证'} · {item.status}</option>)}</select></label>
    </div>
    {!plans.length && <p>暂无包含 nhanesSurvey 参数的已登记计划。先在数据与资料页保存契约与计划，并把研究任务 ID 加入计划的 taskIds。</p>}
    {plan && <details><summary>查看保存的分析参数</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(plan.payload.nhanesSurvey, null, 2)}</pre><p>计划版本 {plan.version} · 请求标识 <code>{requestId || '请完成选择'}</code></p></details>}
    {blocked && <p>此确认性任务需先通过门禁一并冻结当前方案。</p>}
    <button type="button" disabled={busy || !plan || !contract || !task || blocked} onClick={() => void execute()}>{busy ? 'NHANES 执行中…' : '执行 NHANES 分析'}</button>
    {message && <p role="status">{message}</p>}
    {result && <div aria-label="NHANES 执行结果"><p>计算状态：{result.status ?? '未知'} · 严格分析完成：{result.analysisComplete ? '是' : '否'} · 科学复核：待人工复核</p>{result.run?.id && <p>Run：<code>{result.run.id}</code></p>}{result.artifact?.uri && <p>结果清单：<code>{result.artifact.uri}</code></p>}{result.evidence?.id && <p>证据记录：<code>{result.evidence.id}</code></p>}{result.error && <p>{result.error}</p>}{result.errors?.length ? <ul>{result.errors.map((error, index) => <li key={index}>{error}</li>)}</ul> : null}</div>}
  </section>
}
