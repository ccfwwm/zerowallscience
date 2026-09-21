import { useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { FijiExperimentId } from '../shared/fiji-experiments.js'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']
const examples: Record<FijiExperimentId, string> = {
  'scratch-wound': '[{"sampleId":"S1","time":"0h","initialArea":100,"remainingArea":100}]',
  'colony-formation': '[{"wellId":"A1","independentCount":12}]',
  'bacterial-cfu': '[{"plateId":"P1","colonyCount":50,"dilutionFactor":1000,"platedVolumeMl":0.1}]',
  'tube-formation': '[{"sampleId":"S1","unit":"um","unitScale":0.5,"length":240,"endpoints":8,"junctions":5,"segments":12,"meshes":3}]',
}

export function FijiExperimentPanel({ remote, sessionId }: { remote: Remote; sessionId: string }): JSX.Element {
  const [experiment, setExperiment] = useState<FijiExperimentId>('scratch-wound')
  const [text, setText] = useState(examples['scratch-wound'])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (): Promise<void> => {
    if (busy) return
    setBusy(true); setMessage('')
    try {
      const values = JSON.parse(text)
      if (!Array.isArray(values)) throw new Error('实验测量必须是 JSON 数组。')
      const result = unwrapRemoteResult('fijiExperiment', await remote.fijiExperiment({ sessionId, action: 'analyze', experiment, requestId: `workbench-${Date.now()}`, measurements: values })) as { run?: { status: string }; result?: { measurements: unknown[] }; artifacts?: Array<{ uri: string; checksum?: string }> }
      setMessage(`状态：${result.run?.status ?? 'unknown'}；测量行：${result.result?.measurements?.length ?? 0}；产物：${result.artifacts?.[0]?.uri ?? '无'}`)
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <section style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 14, marginTop: 14 }}><h3 style={{ marginTop: 0 }}>Fiji 实验指标 Runner</h3><p>划痕、克隆形成和成管保留确定性参数协议；细菌菌落支持项目内灰度图 ROI 分割（在 JSON 中传 sourceAssetId 与 image 配置）。其余图像分割掩膜与原生 Fiji 字段仍需随对应版本化 Run 登记。</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><select aria-label="Fiji 实验" value={experiment} onChange={event => { const next = event.target.value as FijiExperimentId; setExperiment(next); setText(examples[next]) }}>{Object.keys(examples).map(id => <option key={id} value={id}>{id}</option>)}</select><button type="button" onClick={() => void run()} disabled={busy}>{busy ? '计算中…' : '运行实验指标'}</button></div><textarea aria-label="Fiji 实验测量 JSON" value={text} onChange={event => setText(event.target.value)} rows={5} style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, fontFamily: 'ui-monospace, monospace' }} />{message && <pre style={{ whiteSpace: 'pre-wrap' }} role="status">{message}</pre>}</section>
}
