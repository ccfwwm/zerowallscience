/** Optional Electron status presentation; the native shell owns actions and Web owns visible copy. */
import { IconRightUpOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './DesktopUpdateIndicator.module.css'
import type { DesktopUpdateFailureKind, DesktopUpdatePresentation, DesktopUpdateView } from '../types.ts'
import type { SettingsRootInjected } from './shell-contract.ts'
import type { UpdateCenterSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'

type SettingsTranslate = PropsLocale<'settings'>['t']

/** @param state - Updater status. @param t - Settings dictionary. @returns Localized status and detail. */
export function updateCopy(state: DesktopUpdatePresentation, t: SettingsTranslate): { label: string; detail: string } {
  if (state.configurationError !== undefined) return { label: t('desktop.channel.unavailable'), detail: t(`desktop.update.configuration.${state.configurationError}`) }
  const labels: Readonly<Record<DesktopUpdatePresentation['phase'], string>> = {
    idle: '',
    checking: t('desktop.update.checking'),
    available: t('desktop.update.available'),
    downloading: t('desktop.update.progress', { percent: state.percent ?? 0 }),
    verifying: t('desktop.update.verifying'),
    installing: t('desktop.update.installing'),
    ready: t('desktop.update.ready'),
    error: t('desktop.update.retry'),
  }
  const label = labels[state.phase]
  if (state.phase === 'checking' || state.phase === 'verifying' || state.phase === 'installing') {
    return { label, detail: state.version ?? label }
  }
  if (state.phase === 'error') {
    const failures: Readonly<Record<DesktopUpdateFailureKind, string>> = {
      configuration: t('desktop.update.configurationFailed'),
      check: t('desktop.update.checkFailed'),
      'check-network': t('desktop.update.checkNetworkFailed'),
      download: t('desktop.update.downloadFailed'),
      'download-space': t('desktop.update.downloadSpaceFailed'),
      'download-permission': t('desktop.update.downloadPermissionFailed'),
      'download-busy': t('desktop.update.downloadBusyFailed'),
      'download-network': t('desktop.update.downloadNetworkFailed'),
      install: t('desktop.update.installFailed'),
      'install-network': t('desktop.update.installNetworkFailed'),
      'stop-failed': t('desktop.update.stopFailed'),
      'tasks-changed': t('desktop.update.tasksChanged'),
      'tasks-unavailable': t('desktop.update.tasksUnavailable'),
      'fullscreen-timeout': t('desktop.update.fullscreenTimeout'),
    }
    return { label, detail: failures[state.failure ?? 'install'] }
  }
  if (state.phase === 'downloading' && state.version !== undefined) {
    return { label, detail: t('desktop.update.downloadDetail', { percent: state.percent ?? 0, version: state.version }) }
  }
  return { label, detail: state.version === undefined
    ? label
    : t('desktop.update.versionDetail', { label, version: state.version }) }
}

/**
 * Render a compact update mark that opens the detailed update page.
 * @param props - Connection priority, sidebar width, and localized bridge-failure copy.
 * @returns Desktop-only status beside the account button, or nothing in browsers.
 */
export function DesktopUpdateIndicator({ wide, hidden, t, view, summary, onOpen }: {
  wide: boolean
  hidden: boolean
  t: SettingsTranslate
  view: DesktopUpdateView
  summary?: UpdateCenterSnapshot
  onOpen: () => void
}) {
  const state = view.presentation
  const available = summary?.sources.some(source => source.available > 0 || source.ready) === true
    || state?.phase === 'available' || state?.phase === 'ready'
    || state?.hostRuntime?.phase === 'available' || state?.hostRuntime?.phase === 'staged'
  if (!wide || hidden || state === undefined && !available) return null
  const version = state?.installedVersion
  const label = version === undefined ? t('updates.open') : `v${version}`
  return <Tooltip label={available ? t('desktop.update.available') : t('updates.open')} side="top">
    <button type="button" className={css.indicator} data-update-available={available || undefined} aria-label={available ? `${label} · ${t('desktop.update.available')}` : label} onClick={onOpen}>
      <span>{label}</span>
      {available ? <span className={css.icon} aria-hidden="true"><IconRightUpOutlineRegular size={18} /><span>{t('desktop.update.available')}</span></span> : null}
    </button>
  </Tooltip>
}

type BadgeProps = PropsRuntime<'sidebar.toggle.badge'> & PropsLocale<'settings'>
  & Pick<InjectFace<SettingsRootInjected>, 'useDesktopUpdate' | 'useConnectionState' | 'useUpdateCenter'>

/**
 * @param props - Framework-bound carrier and connection state.
 * @returns A non-interactive brand-blue notification on the sidebar expand button.
 */
export function DesktopUpdateBadge({ useDesktopUpdate, useConnectionState, useUpdateCenter, t }: BadgeProps) {
  const { presentation: state } = useDesktopUpdate(value => value)
  const summary = useUpdateCenter(value => value)
  const pending = summary.sources.some(source => source.available > 0 || source.ready)
    || state?.phase === 'available' || state?.phase === 'ready'
  const connection = useConnectionState(value => value)
  if (connection === 'disconnected' || connection === 'connecting' || !pending) return null
  return <Tooltip label={t('updates.open')} side="right">
    <span role="img" aria-label={t('updates.open')} className={css.badge}><IconRightUpOutlineRegular size={12} /></span>
  </Tooltip>
}
