import { useEffect, useState } from 'react'
import { Save, Trash2, ExternalLink, Activity } from 'lucide-react'
import { DEFAULTS, SERVICES, SOURCES, type PubmedStatus, type PubmedConfig, type ServiceId } from '../../../pubmed/src/shared/types.js'
import css from './literature.module.css'

interface Props { remote: any; unwrap(value: any): Promise<any> }
const sourceLabel = { dedicated: '专用配置', variable: '自定义变量', environment: '启动环境', none: '未配置' }
const probeLabel = { available: '服务查询成功', anonymous: '匿名查询可用', 'authentication-failed': '认证失败', 'rate-limited': '请求受限', 'network-failed': '连接失败或超时', disabled: '已禁用' }
const toggleLabels = { AUTO_GRAPH: '自动积累会话图谱', PUBTATOR: 'PubTator 概念与关系', EUROPEPMC_ENABLED: 'Europe PMC', S2_ENABLED: 'Semantic Scholar', OPENALEX_ENABLED: 'OpenAlex', PUBTATOR_EDGE_EVIDENCE: '附带支持文献' }
export function LiteratureSettings({ remote, unwrap }: Props) {
  const [status, setStatus] = useState<PubmedStatus>()
  const [draft, setDraft] = useState<PubmedConfig>(DEFAULTS)
  const [values, setValues] = useState<Record<string, string>>({})
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let disposed = false
    if (!remote?.getConfigStatus) { setError('文献服务暂不可用'); return }
    void unwrap(remote.getConfigStatus()).then((value: PubmedStatus) => { if (!disposed) { setStatus(value); setDraft(value.config); setError('') } }).catch(() => { if (!disposed) setError('文献配置加载失败') })
    return () => { disposed = true }
  }, [remote, unwrap])
  const run = async (id: string, action: () => Promise<void>) => {
    setBusy(current => [...current, id]); setError('')
    try { await action() } catch (error) { setError(error instanceof Error ? error.message : '操作失败') }
    finally { setBusy(current => current.filter(key => key !== id)) }
  }
  const save = (service: typeof SERVICES[number]) => run(service.id, async () => {
    const result = await unwrap(remote.setKey({ name: service.key, value: values[service.id] ?? '' }))
    setStatus(result); setValues(current => ({ ...current, [service.id]: '' })); setMessages(current => ({ ...current, [service.id]: '已保存，尚未检测' }))
  })
  const clear = (service: typeof SERVICES[number]) => run(service.id, async () => {
    const result: PubmedStatus = await unwrap(remote.clearKey(service.key)); setStatus(result)
    const key = result.keys.find(k => k.name === service.key)
    setMessages(current => ({ ...current, [service.id]: key?.configured ? '已清除专用配置，当前使用' + sourceLabel[key.source] : '已清除，当前无 Key' }))
  })
  const probe = (id: ServiceId) => run(id, async () => {
    const result = await unwrap(remote.testConnection(id))
    setMessages(current => ({ ...current, [id]: probeLabel[result.state as keyof typeof probeLabel] ?? '检测完成' }))
  })
  return <section className={css.root} aria-labelledby="literature-settings-title">
    <div className={css.header}><h3 id="literature-settings-title">文献服务</h3><label><input aria-label="启用文献服务" type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />启用</label></div>
    {error && <p role="alert" className={css.error}>{error}</p>}
    <div className={css.tableWrap}><table className={css.table}><thead><tr><th>服务</th><th>配置项</th><th>配置状态</th><th>操作</th><th>获取地址</th></tr></thead><tbody>
      {SERVICES.map(service => {
        const key = status?.keys.find(k => k.name === service.key); const disabled = busy.includes(service.id) || !status
        return <tr key={service.id}><td>{service.label}</td><td>{service.key ? <><code>{service.key}</code><input aria-label={service.key} type="password" autoComplete="off" placeholder="可选 Key" value={values[service.id] ?? ''} onChange={e => setValues(current => ({ ...current, [service.id]: e.target.value }))} /></> : '无需 Key'}</td>
          <td><span>{!status ? '加载中' : service.key ? key?.configured ? '已配置 · ' + sourceLabel[key.source] : '未配置' : '公开服务'}</span><small role="status">{messages[service.id]}</small></td>
          <td><div className={css.actions}>{service.key && <><button type="button" title={`保存 ${service.label} Key`} aria-label={`保存 ${service.label} Key`} disabled={disabled || !values[service.id]?.trim()} onClick={() => void save(service)}><Save size={16} /></button><button type="button" title={`清除 ${service.label} Key`} aria-label={`清除 ${service.label} Key`} disabled={disabled || key?.source !== 'dedicated'} onClick={() => void clear(service)}><Trash2 size={16} /></button></>}<button type="button" title={`检测 ${service.label}`} aria-label={`检测 ${service.label}`} disabled={disabled} onClick={() => void probe(service.id)}><Activity size={16} /></button></div></td>
          <td><a href={service.url} target="_blank" rel="noreferrer" aria-label={`${service.label} ${service.key ? '获取 Key' : '官方文档'}`}>{service.key ? '获取 Key' : '官方文档'}<ExternalLink size={14} /></a></td></tr>
      })}
    </tbody></table></div>
    <details className={css.advanced}><summary>高级配置</summary><div className={css.fields}>
      <fieldset><legend>默认检索源</legend>{SOURCES.map(source => <label key={source}><input type="checkbox" checked={draft.defaultSources.includes(source)} onChange={e => setDraft({ ...draft, defaultSources: e.target.checked ? [...draft.defaultSources, source] : draft.defaultSources.filter(s => s !== source) })} />{SERVICES.find(s => s.id === source)?.label}</label>)}</fieldset>
      <fieldset><legend>能力与图谱</legend>{Object.entries(toggleLabels).map(([key, label]) => <label key={key}><input type="checkbox" checked={draft[key as keyof typeof toggleLabels]} onChange={e => setDraft({ ...draft, [key]: e.target.checked })} />{label}</label>)}</fieldset>
      <label>NCBI 联系邮箱<input type="email" value={draft.NCBI_ADMIN_EMAIL} onChange={e => setDraft({ ...draft, NCBI_ADMIN_EMAIL: e.target.value })} /></label>
      {(['EUTILS_BASE_URL', 'EPMC_BASE_URL', 'PUBTATOR_BASE_URL', 'S2_BASE_URL', 'OPENALEX_BASE_URL'] as const).map(key => <label key={key}>{key}<input type="url" value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>)}
      <label>每篇关系探测概念数<input type="number" min={1} max={6} value={draft.PUBTATOR_RELATION_PROBE} onChange={e => setDraft({ ...draft, PUBTATOR_RELATION_PROBE: Number(e.target.value) })} /></label>
      <label>每批关系探测文章数<input type="number" min={1} max={50} value={draft.PUBTATOR_RELATION_PROBE_ARTICLES} onChange={e => setDraft({ ...draft, PUBTATOR_RELATION_PROBE_ARTICLES: Number(e.target.value) })} /></label>
    </div></details>
    <div className={css.footer}><span>Key 均可选；各服务额度以官方账户为准。</span><button type="button" disabled={!status || busy.includes('config')} onClick={() => void run('config', async () => { const value = await unwrap(remote.updateConfig(draft)); setStatus(value); setDraft(value.config); setMessages({}) })}><Save size={16} />保存配置</button></div>
  </section>
}
