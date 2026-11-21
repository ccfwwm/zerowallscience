/** Refresh failures and update outcomes hosted outside the Plugins panel's lifetime. */
import { useState, type ReactNode } from 'react'
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginManagerFace } from './manager-store.ts'
import { noticeText } from './presentation.ts'
import { updateOutcomeText } from './versions.tsx'

/** The controller's shared notice source and dismissal action. */
export type PluginRefreshToastFace = Pick<PluginManagerFace, 'dismissNotice'> & {
  hooks: Pick<PluginManagerFace['hooks'], 'pluginManager'>
  openUpdateDetails?: () => void
  prepareUpdates?: PluginManagerFace['prepareUpdates']
  restartFeatures?: PluginManagerFace['restartFeatures']
}

/** Render inputs bound from the shared controller and plugin dictionary. */
export type PluginRefreshToastProps = InjectFace<PluginRefreshToastFace> & PropsLocale<'pluginManager'>

/**
 * Display refresh failures and settled update outcomes after navigation leaves the Plugins panel.
 * @param props - shared notice hook, dismissal action, and locale seat.
 * @returns A refresh failure or update outcome toast, or null when neither needs feedback.
 */
export function PluginRefreshToast({
  usePluginManager, dismissNotice, openUpdateDetails, t,
}: PluginRefreshToastProps): ReactNode {
  const state = usePluginManager(value => value)
  const [dismissed, setDismissed] = useState<string>()
  const notice = state.notice
  const update = state.update
  if (notice?.kind !== 'refresh-failed') {
    if (update?.phase !== 'done' || state.updatePreparing || update.requestId === undefined || dismissed === update.requestId) return null
    const successful = update.result !== null && ['applied', 'restart-required'].includes(update.result.result.application)
    return <><Toast key={update.requestId} text={updateOutcomeText(update, t)}
      {...successful ? { tone: 'success' } : {}} icon={<IconWarningOutlineRegular />}
      {...openUpdateDetails === undefined ? {} : { actions: [{ label: t('featuresDetails'), onClick: openUpdateDetails }] }}
      onDone={() => { setDismissed(update.requestId) }} /></>
  }
  return (
    <><Toast
      key={notice.seq}
      text={noticeText(notice, t)}
      icon={<IconWarningOutlineRegular />}
      onDone={dismissNotice}
    /></>
  )
}
