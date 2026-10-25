import React from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClaudeCodeSettingsApi, ClaudeCodeStatus, ClaudeGlobalSetting, ClaudeGlobalSettingOption, ClaudeGlobalSettingsView, ClaudeNativeSettings } from '../shared/types.js'
import { CLAUDE_NS } from './locales.js'
import css from './ClaudeCodeSettingsSection.module.css'
import { GlobalSettingSelect, GlobalSettingText } from './upstream/GlobalSettingControls.js'
import * as upstreamStyles from './upstream/settings-styles.js'

export type ClaudeCodeSettingsSectionProps = PropsRuntime<'settings.section'> & PropsLocale<typeof CLAUDE_NS> & InjectFace<ClaudeCodeSettingsApi>

const GLOBAL_SETTING_KEYS = ['outputStyle', 'permissionSelector', 'permissionMode', 'renderer', 'prose', 'worktreeBranchPrefix', 'maxProcesses', 'idleTimeoutMinutes'] as const
const EFFECTS = ['immediate', 'new-session', 'next-turn', 'next-worktree', 'restart'] as const
const SOURCES = ['built-in', 'user', 'configured'] as const
const EFFECT_LABELS: Record<typeof EFFECTS[number], string> = {
  immediate: 'effect_immediate', 'new-session': 'effect_newSession', 'next-turn': 'effect_nextTurn', 'next-worktree': 'effect_nextWorktree', restart: 'effect_restart',
}

export function isGlobalSettingsView(value: unknown): value is ClaudeGlobalSettingsView {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const settings = (value as { settings?: unknown }).settings
  return Array.isArray(settings) && settings.every(setting => {
    if (typeof setting !== 'object' || setting === null || Array.isArray(setting)) return false
    const item = setting as Record<string, unknown>
    if (!GLOBAL_SETTING_KEYS.includes(item.key as typeof GLOBAL_SETTING_KEYS[number]) || typeof item.value !== 'string' || !EFFECTS.includes(item.effect as typeof EFFECTS[number])
      || item.available !== undefined && typeof item.available !== 'boolean'
      || item.unavailableReason !== undefined && typeof item.unavailableReason !== 'string') return false
    if (item.kind === 'text') return typeof item.maxLength === 'number' && Number.isInteger(item.maxLength) && item.maxLength > 0
    return item.kind === 'select' && Array.isArray(item.options) && item.options.every(option => {
      if (typeof option !== 'object' || option === null || Array.isArray(option)) return false
      const row = option as Record<string, unknown>
      return typeof row.value === 'string' && typeof row.label === 'string' && SOURCES.includes(row.source as typeof SOURCES[number])
    })
  })
}

function statusLabel(status: ClaudeCodeStatus | undefined, t: ClaudeCodeSettingsSectionProps['t']): string {
  if (!status) return t('unavailable')
  if (!status.desktop) return t('desktopOnly')
  if (status.running) return t('running')
  return status.installed ? t('ready') : t('notInstalled')
}

function legacySettings(settings: ClaudeNativeSettings): ClaudeGlobalSettingsView {
  const select = (key: string, value: string, values: readonly string[], effect: ClaudeGlobalSetting['effect']): ClaudeGlobalSetting => ({
    key, kind: 'select', value, effect, options: values.map(option => ({ value: option, label: option, source: 'built-in' })),
  })
  const text = (key: string, value: string, maxLength: number, effect: ClaudeGlobalSetting['effect']): ClaudeGlobalSetting => ({ key, kind: 'text', value, maxLength, effect })
  return { settings: [
    select('outputStyle', settings.outputStyle ?? 'Default', ['Default', 'Proactive', 'Concise', 'Explanatory', 'Learning'], 'new-session'),
    select('permissionSelector', settings.permissionSelector ?? 'plugin', ['plugin', 'native'], 'immediate'),
    select('permissionMode', settings.permissionMode ?? 'acceptEdits', ['plan', 'default', 'acceptEdits', 'dontAsk', 'auto', 'bypassPermissions'], 'new-session'),
    select('renderer', settings.renderer ?? 'plugin', ['plugin', 'native'], 'next-turn'),
    select('prose', settings.prose ?? 'plain', ['plain', 'enhanced'], 'immediate'),
    { ...text('worktreeBranchPrefix', settings.worktreeBranchPrefix ?? 'claude', 128, 'next-worktree'), available: false, unavailableReason: 'worktreeUnavailable' },
    text('maxProcesses', String(settings.maxProcesses ?? 4), 2, 'immediate'),
    { ...text('idleTimeoutMinutes', String(settings.idleTimeoutMinutes ?? 30), 4, 'new-session'), available: false, unavailableReason: 'idleReuseUnavailable' },
  ] }
}

function settingPatch(key: string, value: string): Partial<ClaudeNativeSettings> {
  if (key === 'maxProcesses' || key === 'idleTimeoutMinutes') return { [key]: Number(value) }
  return { [key]: value } as Partial<ClaudeNativeSettings>
}

export function ClaudeCodeSettingsSection(props: ClaudeCodeSettingsSectionProps) {
  const { t } = props
  const [status, setStatus] = React.useState<ClaudeCodeStatus>()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [settingsError, setSettingsError] = React.useState('')
  const [settings, setSettings] = React.useState<ClaudeGlobalSettingsView>()
  const mutation = React.useRef(false)

  const readSettings = React.useCallback(async () => {
    if (typeof props.globalSettings === 'function') {
      const next = await props.globalSettings()
      if (!isGlobalSettingsView(next)) throw new Error('Invalid Claude Code settings response.')
      return next
    } else if (typeof props.settings === 'function') {
      return legacySettings(await props.settings())
    }
    throw new Error('Claude Code settings service is unavailable.')
  }, [props.globalSettings, props.settings])

  React.useEffect(() => {
    let active = true
    void props.status().then(next => { if (active) setStatus(next) }).catch(() => { if (active) setError(t('unavailable')) })
    void readSettings().then(next => { if (active) setSettings(next) }).catch(() => { if (active) setSettingsError(t('unavailable')) })
    return () => { active = false }
  }, [t, readSettings])

  const run = async (operation: () => Promise<ClaudeCodeStatus>, confirm = false) => {
    if (mutation.current) return
    if (confirm && !window.confirm(t('uninstallConfirm'))) return
    mutation.current = true
    setBusy(true)
    setError('')
    try { setStatus(await operation()) } catch { setError(t('operationFailed')) } finally { mutation.current = false; setBusy(false) }
  }

  const installed = status?.installed === true
  const saveSetting = async (key: string, value: string) => {
    // Renderer changes apply next turn and prose/max-process changes may be
    // made while a task is running. Runtime installation retains its own gate.
    if (mutation.current || status?.desktop !== true) return
    mutation.current = true
    setBusy(true)
    setSettingsError('')
    try {
      if (typeof props.updateGlobalSettings === 'function') {
        const next = await props.updateGlobalSettings({ [key]: value })
        if (!isGlobalSettingsView(next)) throw new Error('Invalid Claude Code settings response.')
        setSettings(next)
      } else if (typeof props.updateSettings === 'function') {
        await props.updateSettings(settingPatch(key, value))
        setSettings(await readSettings())
      } else throw new Error('Claude Code settings service is unavailable.')
    } catch { setSettingsError(t('settingsSaveFailed')) } finally { mutation.current = false; setBusy(false) }
  }

  const labelForOption = (key: string, option: ClaudeGlobalSettingOption): string => {
    const translationKey = `settingOption_${key}_${option.value}`
    const translated = t(translationKey)
    return translated === translationKey ? option.label : translated
  }

  const visibleSettings = settings?.settings.filter(setting => (setting.key !== 'prose' || settings.settings.find(item => item.key === 'renderer')?.value !== 'native')
    && (setting.key !== 'permissionMode' || settings.settings.find(item => item.key === 'permissionSelector')?.value !== 'native'))
  return <section className={css.root} style={upstreamStyles.settingsPage} aria-label={t('title')} aria-busy={busy}>
    <header style={upstreamStyles.settingsHero}><div style={upstreamStyles.settingsMark} aria-hidden="true">C</div><div><h2 style={upstreamStyles.settingsHeading}>{t('title')}</h2><p style={upstreamStyles.settingsBody}>{t('description')}</p></div></header>
    <article style={upstreamStyles.settingsCard}>
      <header className={css.cardHeader}>
        <div><h3>{t('runtimeTitle')}</h3><p>{t('runtimeDescription')}</p></div>
        <span className={`${css.status} ${installed ? css.statusReady : css.statusWarning}`} role="status">{statusLabel(status, t)}</span>
      </header>
      <div className={css.diagnostics}>
        <span>{t('runtimeVersion')}</span><code>{status?.version ?? t('unknown')}</code>
        <span>{t('path')}</span><code>{status?.executablePath ?? t('pathUnavailable')}</code>
      </div>
      <div className={css.actions}>
        <button type="button" disabled={busy} onClick={() => void run(() => props.status())}>{t('refreshDiagnostics')}</button>
        <button className={installed ? '' : css.primary} type="button" disabled={busy || status === undefined || status.desktop === false || status.running} onClick={() => void run(() => props.install())}>{installed ? t('update') : t('install')}</button>
        {status?.rollbackAvailable && <button type="button" disabled={busy || status.running} onClick={() => void run(() => props.rollback())}>{t('rollback')}</button>}
        {installed && <button type="button" disabled={busy || status.running} onClick={() => void run(() => props.uninstall(), true)}>{t('uninstall')}</button>}
      </div>
      <p className={css.note}>{t('note')}</p>
    </article>
    <article style={upstreamStyles.settingsCard}>
      <header className={css.cardHeader}><div><h3>{t('globalSettings')}</h3><p>{t('globalSettingsDescription')}</p></div></header>
      {settings === undefined && !settingsError ? <p className={css.note}>{t('globalSettingsLoading')}</p> : visibleSettings?.map(setting => {
        const key = `setting_${setting.key}`
        const label = t(key)
        const effectLabel = t(EFFECT_LABELS[setting.effect])
        const hint = t(`settingHint_${setting.key}`)
        const id = `claude-setting-${setting.key}`
        const disabled = busy || status?.desktop !== true || setting.available === false
        return <div className={css.settingRow} key={setting.key}>
          <div className={css.settingCopy}>
            <label htmlFor={id}>{label}</label>
            <p id={`${id}-hint`}>{setting.available === false ? t(setting.unavailableReason ?? 'unavailable') : hint === `settingHint_${setting.key}` ? t('settingEffect', { effect: effectLabel }) : `${hint} · ${effectLabel}`}</p>
          </div>
          {setting.kind === 'select' ? <GlobalSettingSelect id={id} describedBy={`${id}-hint`} setting={setting} label={label} disabled={disabled} labelFor={option => labelForOption(setting.key, option)} onChange={value => void saveSetting(setting.key, value)} />
            : <GlobalSettingText id={id} describedBy={`${id}-hint`} setting={setting} label={label} disabled={disabled} onChange={value => void saveSetting(setting.key, value)} />}
        </div>
      })}
      {settingsError && <p className={css.error} role="alert">{settingsError}</p>}
    </article>
    <article style={upstreamStyles.settingsCard}><h3 style={upstreamStyles.settingsSectionHeading}>{t('planUsage')}</h3><p className={css.note}>{t('planUsageUnavailable')}</p></article>
    <article style={upstreamStyles.settingsCard}><h3 style={upstreamStyles.settingsSectionHeading}>Jira</h3><p className={css.note}>{t('jiraUnavailable')}</p></article>
    <article style={upstreamStyles.settingsCard}><h3 style={upstreamStyles.settingsSectionHeading}>{t('pluginUpdates')}</h3><p className={css.note}>{t('pluginUpdatesManaged')}</p></article>
    {error && <p className={css.error} role="alert">{error}</p>}
  </section>
}
