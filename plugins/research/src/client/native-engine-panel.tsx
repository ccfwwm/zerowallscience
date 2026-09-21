import { useEffect, useRef, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '../../lib/typert.remote-client.js'
import type { DataAssetRecord } from '@zerowallscience/research-store/types'
import type { ScientificEngineId, ScientificEngineLaunchResult } from '../shared/types.js'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']
const labels = { starting: '正在启动', spawned: '进程已启动，窗口待检查', exited: '启动进程已退出', failed: '进程失败', unobserved: '窗口状态待核对' }

export function NativeEnginePanel({ remote, sessionId }: { remote: Remote; sessionId: string }): JSX.Element {
  const [assets, setAssets] = useState<DataAssetRecord[]>([])
  const [assetId, setAssetId] = useState('')
  const [launches, setLaunches] = useState<ScientificEngineLaunchResult[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const locked = useRef(false)

  const refresh = async (current: number) => {
    const records = unwrapRemoteResult('listScientificEngineLaunches', await remote.listScientificEngineLaunches({ sessionId }))
    if (current === generation.current) setLaunches(records)
  }
  useEffect(() => {
    const current = ++generation.current
    let timer: ReturnType<typeof setTimeout> | undefined
    setAssets([]); setAssetId(''); setLaunches([]); setMessage(''); setBusy(false); locked.current = false
    const poll = async () => {
      try { await refresh(current) } catch (error) { if (current === generation.current) setMessage(String(error)) }
      if (current === generation.current) timer = setTimeout(() => void poll(), 4000)
    }
    void remote.scienceViewer({ sessionId, action: 'list' }).then(value => {
      const result = unwrapRemoteResult('scienceViewer', value)
      if (current === generation.current) setAssets(result.assets ?? [])
    }).catch(error => { if (current === generation.current) setMessage(String(error)) })
    void poll()
    return () => { generation.current++; clearTimeout(timer) }
  }, [remote, sessionId])

  const launch = async (engine: ScientificEngineId) => {
    if (locked.current) return
    locked.current = true; setBusy(true); setMessage('')
    const current = generation.current
    try {
      const result = unwrapRemoteResult('launchScientificEngine', await remote.launchScientificEngine({ sessionId, engine, ...(assetId ? { assetId } : {}) }))
      if (current !== generation.current) return
      setMessage(result.message)
      await refresh(current)
    } catch (error) { if (current === generation.current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { if (current === generation.current) { locked.current = false; setBusy(false) } }
  }

  return <section aria-label="原生图像工具" style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
    <h3>Fiji / napari 原生图像工具</h3>
    <p>在本机窗口查看和分析图像。切换工作台页面不会关闭原生窗口；请在原生工具中另存修改。标注自动回传尚未接入。</p>
    <fieldset disabled={busy} style={{ border: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <label>图像资产 <select aria-label="原生图像资产" value={assetId} onChange={event => setAssetId(event.target.value)}>
        <option value="">启动空白窗口</option>
        {assets.filter(asset => asset.location === 'local' && /\.(tiff?|png|jpe?g|bmp)$/iu.test(asset.uri)).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
      </select></label>
      <button type="button" onClick={() => void launch('fiji')}>打开 Fiji</button>
      <button type="button" onClick={() => void launch('napari')}>打开 napari</button>
    </fieldset>
    {message && <p role="status">{message}</p>}
    {launches.length > 0 && <ul aria-label="原生引擎启动记录">{launches.map(item => <li key={item.launchId}>
      <strong>{item.id} · {labels[item.status]}</strong> · {item.assetId ? assets.find(asset => asset.id === item.assetId)?.name ?? '已登记资产' : '空白窗口'}
      <p>{item.message}</p>
      {item.diagnosticTail && <details><summary>启动日志</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.diagnosticTail}</pre></details>}
    </li>)}</ul>}
  </section>
}
