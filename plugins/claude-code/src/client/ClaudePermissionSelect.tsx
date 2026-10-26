import { useEffect, useRef, useState } from 'react'
import { IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ClaudePermissionView } from '../shared/types.js'
import { CLAUDE_NS } from './locales.js'
import css from './ClaudePermissionSelect.module.css'

export interface ClaudePermissionSelectInjected {
  loadPermission(): Promise<ClaudePermissionView>
  selectPermission(value: string): Promise<ClaudePermissionView>
}
const modes = ['default', 'dontAsk', 'acceptEdits', 'auto', 'plan', 'bypassPermissions'] as const
type Props = PropsRuntime<'conversation.input.permission'> & ClaudePermissionSelectInjected & PropsLocale<typeof CLAUDE_NS>
const nativeLabels = {
  'read-only': ['permissionReadOnly', 'Read Only'],
  'workspace-write': ['permissionWorkspaceWrite', 'Workspace Write'],
  'danger-full-access': ['permissionFullAccess', 'Full access'],
  auto: ['permissionAutoReview', 'Auto Review'],
} as const

/** One composer surface; ordinary sessions keep the canonical Host preset writer. */
export function ClaudePermissionSelect({ loadPermission, selectPermission, locked, t }: Props) {
  const [view, setView] = useState<ClaudePermissionView>()
  const [error, setError] = useState<'permissionLoadFailed' | 'permissionSaveFailed'>()
  const [pending, setPending] = useState(false)
  const [open, setOpen] = useState(false)
  const mutation = useRef(false)
  const revision = useRef(0)
  useEffect(() => {
    let live = true
    const refresh = () => {
      if (mutation.current) return
      const current = revision.current
      void loadPermission().then(value => {
        if (live && current === revision.current) { setView(value); setError(previous => previous === 'permissionLoadFailed' ? undefined : previous) }
      }).catch(() => { if (live && current === revision.current) setError('permissionLoadFailed') })
    }
    refresh()
    const timer = setInterval(refresh, 1000)
    return () => { live = false; clearInterval(timer) }
  }, [loadPermission])
  const plugin = view?.active && view.source === 'plugin'
  const disabled = pending || !view || !plugin && locked
  useEffect(() => { setOpen(false) }, [disabled, plugin])
  const nativeLabel = (value: string, name: string) => {
    const builtin = nativeLabels[value as keyof typeof nativeLabels]
    // Localize shipped names while retaining user-defined preset labels.
    return builtin && (name === value || name.toLowerCase() === builtin[1].toLowerCase()) ? t(builtin[0]) : name
  }
  const label = (value: string) => plugin ? t(`settingOption_permissionMode_${value}`)
    : value === 'custom' ? t('permissionCustom') : nativeLabel(value, view?.nativeOptions.find(option => option.value === value)?.name ?? value)
  const current = plugin ? view.mode : view?.hostPreset ?? ''
  const select = async (value: string) => {
    setOpen(false)
    if (disabled || mutation.current || value === current) return
    if ((value === 'bypassPermissions' || value === 'danger-full-access' || value === 'auto' && !plugin)
      && !window.confirm(t('permissionConfirm'))) return
    mutation.current = true
    revision.current++
    setPending(true)
    try { setView(await selectPermission(value)); setError(undefined) } catch { setError('permissionSaveFailed') } finally { mutation.current = false; setPending(false) }
  }
  const title = view ? t('permissionDiagnostics', {
    source: t(plugin ? 'settingOption_permissionSelector_plugin' : 'settingOption_permissionSelector_native'),
    sandbox: view.hostSandbox, approval: view.hostApproval,
    mode: t(`settingOption_permissionMode_${view.runningMode ?? view.mode}`),
  }) + (view.runningMode && view.runningMode !== view.mode ? t('permissionNextTurn', { mode: t(`settingOption_permissionMode_${view.mode}`) }) : '') : undefined
  const items = plugin ? modes.map(mode => ({ id: mode, label: label(mode) })) : [
    ...(view?.hostPreset === 'custom' ? [{ id: 'custom', label: t('permissionCustom'), disabled: true }] : []),
    ...(view?.nativeOptions.map(option => ({ id: option.value, label: nativeLabel(option.value, option.name) })) ?? []),
  ]
  return <span className={css.root}>
    <Menu open={open && !disabled} items={items} selectedId={current} onSelect={value => void select(value)}
      onClose={() => setOpen(false)} side="top" portal autoFocus listClassName={css.menu}
      anchor={<button type="button" className={css.trigger} disabled={disabled} title={title}
        aria-label={t(plugin ? 'permissionClaude' : 'permissionNative')} aria-haspopup="menu" aria-expanded={open && !disabled}
        onClick={() => setOpen(!open)} onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) }
        }}>
        <span className={css.label}>{view ? label(current) : t('permissionLoading')}</span>
        <span className={`${css.chevron} ${open ? css.expanded : ''}`} aria-hidden><IconChevronDownOutlineRegular /></span>
      </button>} />
    {error && <small className={css.error} role="alert">{t(error)}</small>}
  </span>
}
