import { useEffect, useRef, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '../../lib/typert.remote-client.js'
import type {} from '../../../base/src/client/desktop-api.js'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'

export function LocalAssetPanel({ remote, sessionId, onImported }: { remote: TypertRemoteNamespaceMap['zerowallResearch']; sessionId: string; onImported?: (assetId: string, sourcePath: string, name: string) => void }): JSX.Element {
  const [path, setPath] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('')
  const generation = useRef(0); const locked = useRef(false)
  useEffect(() => { generation.current++; locked.current = false; setBusy(false); setMessage(''); setPath(''); return () => { generation.current++ } }, [sessionId])
  const register = async () => {
    if (locked.current) return
    const current = generation.current; locked.current = true; setBusy(true); setMessage('')
    try {
      const asset = unwrapRemoteResult('registerLocalAsset', await remote.registerLocalAsset({ sessionId, path }))
      if (generation.current === current) { setMessage(`已登记 ${asset.name}。${asset.mediaType === 'application/vnd.ome.zarr' ? '已记录元数据指纹；像素分块尚未全量校验。' : '源文件已记录 SHA-256。'}`); setPath(''); onImported?.(asset.id, path, asset.name) }
    } catch (error) { if (generation.current === current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { if (generation.current === current) { locked.current = false; setBusy(false) } }
  }
  const importExternal = async (sourcePath: string | null) => {
    if (!sourcePath || locked.current) return
    if (!remote.importLocalAsset) { setMessage('科研 Host 尚不支持项目外文件导入，请更新 Host。'); return }
    const current = generation.current; locked.current = true; setBusy(true); setMessage('正在复制并校验科研文件…')
    try {
      const asset = unwrapRemoteResult('importLocalAsset', await remote.importLocalAsset({ sessionId, sourcePath }))
      if (generation.current === current) { setMessage(`已复制、校验并登记 ${asset.name}。`); onImported?.(asset.id, sourcePath, asset.name) }
    } catch (error) { if (generation.current === current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { if (generation.current === current) { locked.current = false; setBusy(false) } }
  }
  const chooseZarr = async () => {
    const sourcePath = await window.zerowallDesktop?.chooseDirectory()
    await importExternal(sourcePath ?? null)
  }
  return <section aria-label="登记本地科研文件" style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
    <h3>登记项目内资产</h3><p>输入当前项目内的相对路径或完整路径。文件保留原位并记录 SHA-256；目录数据集通过专用选择器导入项目。</p>
    <label>文件路径<input aria-label="科研文件路径" value={path} disabled={busy} onChange={event => setPath(event.target.value)} placeholder="data/example.gbk" style={{ width: 'min(480px, 100%)' }} /></label>
    <button type="button" disabled={busy || !path.trim()} onClick={() => void register()}>{busy ? '校验并登记中…' : '登记文件资产'}</button>
    <button type="button" disabled={busy || !window.zerowallDesktop?.chooseDirectory || !remote.importLocalAsset} onClick={() => void chooseZarr()}>选择并导入 OME-Zarr 文件夹</button>
    {message && <p role="status">{message}</p>}
  </section>
}
