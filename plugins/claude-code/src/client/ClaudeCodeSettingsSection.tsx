import React from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClaudeCodeSettingsApi, ClaudeCodeStatus, ClaudeEffectiveSetting, ClaudeGlobalSetting, ClaudeGlobalSettingOption, ClaudeGlobalSettingsView, ClaudeNativeSettings } from '../shared/types.js'
import { CLAUDE_COMPACT_PRESETS, CLAUDE_CONTEXT_PRESETS } from '../shared/types.js'
import { CLAUDE_NS } from './locales.js'
import css from './ClaudeCodeSettingsSection.module.css'
import { GlobalSettingNumber, GlobalSettingSelect, GlobalSettingText } from './upstream/GlobalSettingControls.js'
import * as upstreamStyles from './upstream/settings-styles.js'

export type ClaudeCodeSettingsSectionProps = PropsRuntime<'settings.section'> & PropsLocale<typeof CLAUDE_NS> & InjectFace<ClaudeCodeSettingsApi>

const GLOBAL_SETTING_KEYS = ['outputStyle', 'permissionSelector', 'permissionMode', 'renderer', 'prose', 'maxProcesses', 'contextWindow', 'autoCompactWindow', 'promptCacheTtl', 'subagentPromptCacheTtl'] as const
const EFFECTS = ['immediate', 'new-session', 'next-turn', 'next-worktree', 'restart'] as const
const SOURCES = ['built-in', 'user', 'configured'] as const
const EFFECT_LABELS: Record<typeof EFFECTS[number], string> = {
  immediate: 'effect_immediate', 'new-session': 'effect_newSession', 'next-turn': 'effect_nextTurn', 'next-worktree': 'effect_nextWorktree', restart: 'effect_restart',
}
const SOURCE_LABELS: Record<ClaudeEffectiveSetting['source'], string> = {
  auto: 'source_auto', explicit: 'source_explicit', external: 'source_external', clamped: 'source_clamped', unsupported: 'source_unsupported',
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
    if (item.kind === 'number') return typeof item.min === 'number' && Number.isSafeInteger(item.min) && typeof item.max === 'number' && Number.isSafeInteger(item.max)
      && item.min > 0 && item.max >= item.min && typeof item.step === 'number' && Number.isSafeInteger(item.step) && item.step > 0
      && (item.presets === undefined || Array.isArray(item.presets) && item.presets.every(preset => typeof preset === 'object' && preset !== null
        && typeof preset.label === 'string' && typeof preset.value === 'string' && (preset.value === 'auto'
          || Number.isSafeInteger(Number(preset.value)) && Number(preset.value) >= (item.min as number) && Number(preset.value) <= (item.max as number))))
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
  const number = (key: string, value: string, min: number, max: number, effect: ClaudeGlobalSetting['effect']): ClaudeGlobalSetting => ({ key, kind: 'number', value, min, max, step: 1, effect })
  return { settings: [
    select('outputStyle', settings.outputStyle ?? 'Default', ['Default', 'Proactive', 'Concise', 'Explanatory', 'Learning'], 'new-session'),
    select('permissionSelector', settings.permissionSelector ?? 'plugin', ['plugin', 'native'], 'immediate'),
    select('permissionMode', settings.permissionMode ?? 'acceptEdits', ['plan', 'default', 'acceptEdits', 'dontAsk', 'auto', 'bypassPermissions'], 'new-session'),
    select('renderer', settings.renderer ?? 'plugin', ['plugin', 'native'], 'next-turn'),
    select('prose', settings.prose ?? 'plain', ['plain', 'enhanced'], 'immediate'),
    text('maxProcesses', String(settings.maxProcesses ?? 4), 2, 'immediate'),
    { ...number('contextWindow', String(settings.contextWindow ?? 'auto'), 1, 10_000_000, 'new-session'), presets: CLAUDE_CONTEXT_PRESETS },
    { ...number('autoCompactWindow', String(settings.autoCompactWindow ?? 'auto'), 100_000, 1_000_000, 'new-session'), presets: CLAUDE_COMPACT_PRESETS },
    select('promptCacheTtl', settings.promptCacheTtl ?? 'auto', ['auto', '5m', '1h'], 'new-session'),
    select('subagentPromptCacheTtl', settings.subagentPromptCacheTtl ?? 'auto', ['auto', '5m', '1h'], 'new-session'),
  ] }
}

function settingPatch(key: string, value: string): Partial<ClaudeNativeSettings> {
  if (key === 'maxProcesses' || key === 'contextWindow' || key === 'autoCompactWindow') {
    return { [key]: value === 'auto' || value === '200k' || value === '1m' ? value : Number(value) }
  }
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
      {status?.diagnostic && <p className={css.error} role="alert">{status.diagnostic}</p>}
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
            {setting.effective && <small>{t('effectiveSetting', { requested: setting.effective.requested, effective: setting.effective.effective, source: t(SOURCE_LABELS[setting.effective.source]) })}{setting.effective.reason ? ` · ${setting.effective.reason}` : ''}</small>}
          </div>
          {setting.kind === 'select' ? <GlobalSettingSelect id={id} describedBy={`${id}-hint`} setting={setting} label={label} disabled={disabled} labelFor={option => labelForOption(setting.key, option)} onChange={value => void saveSetting(setting.key, value)} />
            : setting.kind === 'number' ? <GlobalSettingNumber id={id} describedBy={`${id}-hint`} setting={setting} label={label} disabled={disabled} invalidMessage={t('numericInputInvalid')} presetLabel={t('numericPresets')} customLabel={t('numericCustom')} onChange={value => void saveSetting(setting.key, value)} />
              : <GlobalSettingText id={id} describedBy={`${id}-hint`} setting={setting} label={label} disabled={disabled} onChange={value => void saveSetting(setting.key, value)} />}
        </div>
      })}
      {settingsError && <p className={css.error} role="alert">{settingsError}</p>}
    </article>
    {error && <p className={css.error} role="alert">{error}</p>}
  </section>
}
