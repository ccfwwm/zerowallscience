import { useEffect, useState } from 'react'
import { BookOpen, Github, Globe } from 'lucide-react'
import type { DesktopUpdateStatus } from './desktop-api.js'
import css from './AboutSection.module.css'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.js'
export function AboutSection({ t }: PropsLocale<typeof NS>) {
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
    <div className={css.hero}><img src="/zerowall-icon.png" alt="ZeroWall Science" /><div><h2>ZeroWall Science</h2><p>{t('about.description')}</p></div></div>
    <dl className={css.meta}><div><dt>{t('about.version')}</dt><dd>{info?.version || status.currentVersion || '—'}</dd></div><div><dt>{t('about.platform')}</dt><dd>{info ? `${info.platform} · ${info.architecture}` : '—'}</dd></div></dl>
    <div className={css.update}><div><h3>{t('about.updates')}{status.version ? ` · ${status.version}` : ''}</h3><p role="status">{status.phase === 'error' && status.message ? status.message : t(`about.${status.phase}`)}</p>{status.phase === 'downloading' && <progress max={100} value={status.percent ?? 0} aria-label={t('about.progress')} />}</div><button type="button" onClick={() => void action()} disabled={!api || ['checking','downloading','unavailable'].includes(status.phase)}>{status.phase === 'available' ? t('about.download') : status.phase === 'downloaded' ? t('about.install') : status.phase === 'checking' ? t('about.checking') : status.phase === 'downloading' ? `${Math.round(status.percent ?? 0)}%` : t('about.check')}</button></div>
    {!!status.notes?.length && <section><h3>{t('about.notes')}</h3><ul>{status.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></section>}
    <section className={css.links} aria-label="ZeroWall Science 官方链接">
      <a className={css.linkButton} href="https://zerowallscience.org/" target="_blank" rel="noreferrer" title={t('about.website')} aria-label={t('about.website')}><Globe size={19} aria-hidden="true" /><span>{t('about.website')}</span></a>
      <a className={css.linkButton} href="https://zerowallscience.org/docs" target="_blank" rel="noreferrer" title={t('about.docs')} aria-label={t('about.docs')}><BookOpen size={19} aria-hidden="true" /><span>{t('about.docs')}</span></a>
      <a className={css.linkButton} href="https://github.com/ccfwwm/zerowallscience" target="_blank" rel="noreferrer" title={t('about.github')} aria-label={t('about.github')}><Github size={19} aria-hidden="true" /><span>{t('about.github')}</span></a>
    </section>
    <p className={css.releaseLink}><a href="https://github.com/ccfwwm/zerowallscience/releases" target="_blank" rel="noreferrer">{t('about.releases')}</a></p>
  </section>
}
