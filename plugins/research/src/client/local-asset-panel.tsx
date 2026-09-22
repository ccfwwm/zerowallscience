import { useEffect, useRef, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '../../lib/typert.remote-client.js'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'

export function LocalAssetPanel({ remote, sessionId }: { remote: TypertRemoteNamespaceMap['zerowallResearch']; sessionId: string }): JSX.Element {
  const [path, setPath] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('')
  const generation = useRef(0); const locked = useRef(false)
  useEffect(() => { generation.current++; locked.current = false; setBusy(false); setMessage(''); setPath(''); return () => { generation.current++ } }, [sessionId])
  const register = async () => {
    if (locked.current) return
    const current = generation.current; locked.current = true; setBusy(true); setMessage('')
    try {
      const asset = unwrapRemoteResult('registerLocalAsset', await remote.registerLocalAsset({ sessionId, path }))
      if (generation.current === current) { setMessage(`已登记 ${asset.name}。在专业工具中刷新资产后打开。${asset.mediaType === 'application/vnd.ome.zarr' ? '已记录元数据指纹；像素分块尚未全量校验。' : '源文件已记录 SHA-256。'}`); setPath('') }
    } catch (error) { if (generation.current === current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { if (generation.current === current) { locked.current = false; setBusy(false) } }
  }
  return <section aria-label="登记本地科研文件" style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
    <h3>登记本地文件</h3><p>输入当前项目内的相对路径或完整路径。文件保留原位，按块校验；单文件上限 20 GiB。也支持 .zarr 目录，登记时仅核验元数据。查看文件不要求创建研究方案。</p>
    <label>文件路径<input aria-label="科研文件路径" value={path} disabled={busy} onChange={event => setPath(event.target.value)} placeholder="data/example.gbk" style={{ width: 'min(480px, 100%)' }} /></label>
    <button type="button" disabled={busy || !path.trim()} onClick={() => void register()}>{busy ? '校验并登记中…' : '登记文件资产'}</button>
    {message && <p role="status">{message}</p>}
  </section>
}
