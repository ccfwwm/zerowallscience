import { useEffect, useState } from 'react'
import type { DesktopUpdateStatus } from './desktop-api.js'
import css from './AboutSection.module.css'
const labels = { idle: '检查官方更新', checking: '正在检查更新…', available: '发现新版本', downloading: '正在下载更新', downloaded: '更新已下载，安装将重启应用。请先保存工作。', upToDate: '当前已是最新版本', error: '更新失败，请重试', unavailable: '当前运行方式不支持在线更新' }
export function AboutSection() {
  const api = window.zerowallDesktop
  const [info, setInfo] = useState<{ version: string; platform: string; architecture: string }>()
  const [status, setStatus] = useState<DesktopUpdateStatus>({phase: 'idle', currentVersion: ''})
  useEffect(() => {
    if (!api) { setStatus({phase: 'unavailable', currentVersion: ''}); return }
    let active = true
    const fail = () => { if (active) setStatus(s => ({...s, phase: 'error'})) }
    void api.info().then(v => { if (active) setInfo(v) }).catch(fail)
    void api.getUpdateStatus().then(v => { if (active) setStatus(v) }).catch(fail)
    const off = api.onUpdateStatus(v => { if (active) setStatus(v) })
    return () => { active = false; off() }
  }, [api])
  const action = async () => {
    if (!api) return
    try {
      if (status.phase === 'available') setStatus(await api.downloadUpdate())
      else if (status.phase === 'downloaded') await api.installUpdate()
      else setStatus(await api.checkForUpdates())
    } catch { setStatus(s => ({...s, phase: 'error'})) }
  }
  return <section className={css.root}>
    <div className={css.hero}><img src="/zerowall-icon.png" alt="ZeroWall Science" /><div><h2>ZeroWall Science</h2><p>本地优先的科学研究工作台，集成 AI 对话、MCP 工具、Python 科学环境和可扩展插件，辅助文献研究、数据分析与科学创作。</p></div></div>
    <dl className={css.meta}><div><dt>当前版本</dt><dd>{info?.version || status.currentVersion || '—'}</dd></div><div><dt>运行平台</dt><dd>{info ? `${info.platform} · ${info.architecture}` : '—'}</dd></div></dl>
    <div className={css.update}><div><h3>软件更新{status.version ? ` · ${status.version}` : ''}</h3><p role="status">{status.message ?? labels[status.phase]}</p>{status.phase === 'downloading' && <progress max={100} value={status.percent ?? 0} aria-label="下载进度" />}</div><button type="button" onClick={() => void action()} disabled={!api || ['checking','downloading','unavailable'].includes(status.phase)}>{status.phase === 'available' ? '下载更新' : status.phase === 'downloaded' ? '重启安装' : status.phase === 'checking' ? '正在检查…' : status.phase === 'downloading' ? `${Math.round(status.percent ?? 0)}%` : '检查更新'}</button></div>
    {!!status.notes?.length && <section><h3>版本更新说明</h3><ul>{status.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></section>}
    <p><a href="https://github.com/ccfwwm/zerowallscience/releases" target="_blank" rel="noreferrer">官方版本发布与更新记录</a></p>
  </section>
}
