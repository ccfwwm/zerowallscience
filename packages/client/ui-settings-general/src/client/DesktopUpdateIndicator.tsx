/** Optional Electron status presentation; the native shell owns actions and Web owns visible copy. */
import { IconDownloadOutlineRegular, IconLoadingOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './DesktopUpdateIndicator.module.css'
import type { DesktopUpdateFailureKind, DesktopUpdatePresentation, DesktopUpdateView } from '../types.ts'
import type { SettingsRootInjected } from './shell-contract.ts'
import type { UpdateCenterSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'

type SettingsTranslate = PropsLocale<'settings'>['t']

const BUSY_PHASES: ReadonlySet<DesktopUpdatePresentation['phase']> = new Set([
  'checking', 'downloading', 'verifying', 'installing',
])

/** @param state - Updater status. @param t - Settings dictionary. @returns Localized status and detail. */
export function updateCopy(state: DesktopUpdatePresentation, t: SettingsTranslate): { label: string; detail: string } {
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
      check: t('desktop.update.checkFailed'),
      'check-network': t('desktop.update.checkNetworkFailed'),
      download: t('desktop.update.downloadFailed'),
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
  const { presentation: state, failed, opening } = view
  const count = summary?.sources.reduce((total, source) => total + (source.ready ? 0 : source.available), 0) ?? 0
  const ready = summary?.sources.some(source => source.ready) === true
  const sharedFailed = summary?.failure !== undefined || summary?.sources.some(source => source.failed) === true
  const sharedBusy = summary?.operation !== undefined && summary.operation !== 'idle' || summary?.sources.some(source => source.busy) === true
  if (!wide || hidden || (!failed && !sharedFailed && !ready && !count && !sharedBusy && (state === undefined || state.phase === 'idle'))) return null
  const retryLabel = t('desktop.update.retry')
  const copy = state === undefined ? { label: retryLabel, detail: retryLabel } : updateCopy(state, t)
  const busy = opening || sharedBusy || (state !== undefined && BUSY_PHASES.has(state.phase))
  const error = failed || sharedFailed || state?.phase === 'error'
  const label = sharedBusy ? t('updates.busy') : error ? retryLabel : ready ? t('updates.restart') : count ? t('updates.badge', { count }) : copy.label
  return <Tooltip label={sharedFailed || ready || count ? t('updates.open') : failed ? retryLabel : copy.detail} side="top">
    <button type="button" className={css.indicator}
      aria-label={label} onClick={onOpen}>
      <span className={css.icon} aria-hidden="true">
        {error ? <span className={css.errorDot} />
          : busy ? <IconLoadingOutlineRegular className={css.spinner} size={14} /> : <IconDownloadOutlineRegular size={14} />}
      </span>
      <span>{label}</span>
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
  const { presentation: state, failed } = useDesktopUpdate(value => value)
  const summary = useUpdateCenter(value => value)
  const pending = summary.operation !== 'idle' || summary.failure !== undefined || summary.sources.some(source => source.available > 0 || source.ready || source.busy || source.failed)
  const connection = useConnectionState(value => value)
  if (((connection === 'disconnected' || connection === 'connecting') && state?.phase !== 'installing')
    || (!pending && !failed && (state === undefined || state.phase === 'idle'))) return null
  const retryLabel = t('desktop.update.retry')
  const copy = state === undefined ? { label: retryLabel, detail: retryLabel } : updateCopy(state, t)
  const label = pending ? t('updates.open') : failed ? retryLabel : copy.label
  return <Tooltip label={pending || failed ? label : copy.detail} side="right">
    <span role="img" aria-label={label} className={css.badge} />
  </Tooltip>
}
