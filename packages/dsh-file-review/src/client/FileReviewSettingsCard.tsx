import { useState } from 'react'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  DEFAULT_WORD_WRAP,
  DEFAULT_DIFF_LAYOUT,
  type Config,
  type DiffLayout,
} from '../settings-contract.ts'
import css from './FileReviewSettingsCard.module.css'
import { NS } from './locales.ts'

export type FileReviewSettingsCardInjected = {
  hooks: { fileReviewSettings: ConfigForm<Config> }
  setWordWrap(value: boolean): Promise<boolean>
  setDiffLayout(value: DiffLayout): Promise<boolean>
}

export type FileReviewSettingsCardProps = PropsRuntime<'plugins.row.config'> &
  PropsLocale<typeof NS> &
  InjectFace<FileReviewSettingsCardInjected>

interface FileReviewSettingsCardViewProps {
  readonly settings: ConfigFormSnapshot<Config>
  readonly setWordWrap: (value: boolean) => Promise<unknown>
  readonly setDiffLayout: (value: DiffLayout) => Promise<unknown>
  readonly t: FileReviewSettingsCardProps['t']
}

function FileReviewSettingsCardView({ settings, setWordWrap, setDiffLayout, t }: FileReviewSettingsCardViewProps) {
  const [open, setOpen] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  if (settings.status !== 'ready') return null

  const title = t('settings.title')
  const wordWrap = settings.value?.wordWrap ?? DEFAULT_WORD_WRAP
  const writable = settings.writable && !saving
  const save = async (operation: () => Promise<unknown>): Promise<void> => {
    setSaving(true)
    setSaveError(false)
    try {
      if (await operation() !== true) setSaveError(true)
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`${css.card} ${open ? css.cardOpen : ''}`}>
      <button type="button" className={css.header} aria-expanded={open}
        aria-label={`${t(open ? 'settings.collapse' : 'settings.expand')}: ${title}`}
        onClick={() => { setOpen((value) => !value) }}>
        <svg className={css.icon} viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16 3H6a2 2 0 0 0-2 2v22a2 2 0 0 0 2 2h10M16 3l7 7v5M16 3v7h7" />
          <path d="M8 14h6" stroke="var(--dsw-alias-state-error-primary, #d65f76)" />
          <path d="M8 21h6m-3-3v6" stroke="var(--dsw-alias-state-success-primary, #269d80)" />
          <circle cx="23" cy="23" r="6" fill="var(--dsw-alias-bg-layer-3)" />
          <path d="m27.5 27.5 3 3" strokeWidth="2.5" /><path d="m20.5 23 1.5 1.5 3-3" />
        </svg>
        <span className={css.heading}><span className={css.title}>{title}</span><span className={css.description}>{t('settings.description')}</span></span>
        <svg className={`${css.chevron} ${open ? css.chevronOpen : ''}`} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="m3.5 5.25 3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" strokeLinecap="round" /></svg>
      </button>
      {open ? <div className={css.body}>
        <label className={css.row}><span className={css.field}><span className={css.label}>{t('review.layout')}</span></span>
          <select className={css.select} aria-label={t('review.layout')} aria-busy={saving} value={settings.value?.diffLayout ?? DEFAULT_DIFF_LAYOUT} disabled={!writable}
            onChange={(event) => { void save(() => setDiffLayout(event.target.value === 'unified' ? 'unified' : 'split')) }}>
            <option value="split">{t('review.layoutSplit')}</option><option value="unified">{t('review.layoutUnified')}</option>
          </select>
        </label>
        <div className={css.row}><span className={css.field}><span className={css.label}>{t('settings.wordWrap.title')}</span><span className={css.hint}>{t('settings.wordWrap.description')}</span></span>
          <button type="button" role="switch" className={css.toggle} aria-checked={wordWrap} aria-label={t('settings.wordWrap.title')} aria-busy={saving} data-checked={wordWrap} disabled={!writable} onClick={() => { void save(() => setWordWrap(!wordWrap)) }}><span className={css.thumb} /></button>
        </div>
        {!settings.writable ? <p className={css.readOnly}>{t('settings.readOnly')}</p> : null}
        {saveError && <p role="alert">{t('settings.saveError')}</p>}
      </div> : null}
    </div>
  )
}

/** Minimal settings card owned by the file-review plugin. */
export function FileReviewSettingsCard({
  view,
  setWordWrap,
  setDiffLayout,
  t,
  useFileReviewSettings,
}: FileReviewSettingsCardProps) {
  const settings = useFileReviewSettings((snapshot) => snapshot)
  if (view === 'summary') return t('settings.description')
  return <FileReviewSettingsCardView settings={settings} setWordWrap={setWordWrap} setDiffLayout={setDiffLayout} t={t} />
}
