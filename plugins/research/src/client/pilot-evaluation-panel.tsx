import { useEffect, useRef, useState } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import type { JsonObject } from '@zerowallscience/research-store/types'

interface PilotRemote { pilotEvaluation?: (input: { sessionId: string; studyId: string; action: 'catalog' | 'list' | 'freeze' | 'summary'; evaluationId?: string; spec?: JsonObject }) => Promise<RemoteResult<unknown>> }
interface Catalog { plannedTrialCount: number; conditions: string[]; tasks: Array<{ id: string; title: string; inputKind: string }> }
interface Summary { evaluationId: string; freezeHash: string; version: number; trials: Array<{ id: string; status: string }>; unknownCostTrials: number; scoredTrials: number; scientificComparison: string; recordedCosts: Record<string, number> }

export function PilotEvaluationPanel({ remote, sessionId, studyId }: { remote: PilotRemote; sessionId: string; studyId: string }): JSX.Element {
  const [catalog, setCatalog] = useState<Catalog>()
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [configuration, setConfiguration] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const load = async (current: number) => {
    if (!remote.pilotEvaluation) throw new Error('当前 Host 尚未提供先导评估入口。')
    const request = { sessionId, studyId }
    const [listed, records] = await Promise.all([
      remote.pilotEvaluation({ ...request, action: 'catalog' }), remote.pilotEvaluation({ ...request, action: 'list' }),
    ])
    if (current !== generation.current) return
    setCatalog(unwrapRemoteResult('pilotEvaluation', listed) as Catalog)
    setSummaries((unwrapRemoteResult('pilotEvaluation', records) as { evaluations: Summary[] }).evaluations)
  }
  useEffect(() => {
    const current = ++generation.current
    setCatalog(undefined); setSummaries([]); setConfiguration(''); setMessage(''); setBusy(false)
    void load(current).catch(error => { if (current === generation.current) setMessage(error instanceof Error ? error.message : String(error)) })
    return () => { generation.current++ }
  }, [remote, sessionId, studyId])
  const freeze = async () => {
    const current = generation.current
    setBusy(true); setMessage('')
    try {
      if (!remote.pilotEvaluation) throw new Error('当前 Host 不支持冻结评估。')
      const spec: unknown = JSON.parse(configuration)
      if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('请导入评估配置 JSON 对象。')
      await remote.pilotEvaluation({ sessionId, studyId, action: 'freeze', spec: spec as JsonObject }).then(value => unwrapRemoteResult('pilotEvaluation', value))
      await load(current)
      if (current === generation.current) setMessage('已冻结 48 个待运行单元。没有启动模型调用或生成评估成绩。')
    } catch (error) { if (current === generation.current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { if (current === generation.current) setBusy(false) }
  }
  return <section aria-label="先导对照评估" style={{ marginTop: 24 }}>
    <h3>12 项任务 × 4 个条件</h3>
    <p>先冻结真实输入、独立参考、评分规则、固定模型和统一预算。四条件实际执行与独立评分尚待接入；下方不会将待运行单元计作成功。</p>
    {catalog && <><p>计划试次：{catalog.plannedTrialCount}；条件：{catalog.conditions.join('、')}</p><details><summary>查看任务清单</summary><ol>{catalog.tasks.map(task => <li key={task.id}>{task.title}（{task.inputKind === 'real-data' ? '真实数据' : '错误注入'}）</li>)}</ol></details></>}
    <label>导入冻结配置 <input aria-label="导入先导配置" type="file" accept=".json,application/json" disabled={busy} onChange={event => {
      const file = event.target.files?.[0]; const current = generation.current
      if (!file) return
      if (file.size > 1_000_000) { setMessage('配置文件不能超过 1 MB。'); return }
      void file.text().then(text => { if (current === generation.current) setConfiguration(text) }).catch(() => { if (current === generation.current) setMessage('无法读取配置文件。') })
    }} /></label>
    <p>配置中的 Artifact 与规范审计记录必须属于当前项目和研究；参考答案不得与输入文件相同。</p>
    <textarea aria-label="先导冻结配置 JSON" value={configuration} onChange={event => setConfiguration(event.target.value)} rows={8} style={{ width: '100%' }} disabled={busy} />
    <button type="button" disabled={busy || !configuration.trim()} onClick={() => void freeze()}>{busy ? '校验中…' : '校验并冻结待运行矩阵'}</button>
    <button type="button" disabled={busy} onClick={() => void load(generation.current).catch(error => setMessage(String(error)))}>刷新评估状态</button>
    {message && <p role="status">{message}</p>}
    {summaries.map(summary => <div key={summary.evaluationId} style={{ marginTop: 16 }}><strong>评估 {summary.evaluationId}</strong><p>待运行 {summary.trials.filter(t => t.status === 'not-run').length} / {summary.trials.length}；执行完成 {summary.trials.filter(t => t.status === 'completed').length}；已评分 {summary.scoredTrials}；成本未知试次 {summary.unknownCostTrials}</p><p>冻结指纹：<code>{summary.freezeHash}</code></p><p>尚未形成平台比较结论。</p></div>)}
  </section>
}
