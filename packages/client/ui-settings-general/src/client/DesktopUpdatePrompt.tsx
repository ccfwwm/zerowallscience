/** Centered, dismissible update choices; preparation continues outside the dialog. */
import { useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { UpdateCenter } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { DesktopUpdateSource } from './desktop-update-source.ts'

/** Source-owned update actions and shared availability. */
export interface DesktopUpdatePromptInjected {
  openUpdate: () => void
  dismissUpdate: () => void
  prepareExtensions: () => void
  restartExtensions: () => void
  hooks: { desktopUpdate: DesktopUpdateSource['store']; updateCenter: UpdateCenter['store'] }
}

/** @param props - Carrier and extension state with localized choices. @returns A centered update invitation. */
export function DesktopUpdatePrompt({ useDesktopUpdate, useUpdateCenter, openUpdate, dismissUpdate,
  prepareExtensions, restartExtensions, t }:
  PropsRuntime<'shell.overlay'> & PropsLocale<'settings'> & InjectFace<DesktopUpdatePromptInjected>) {
  const state = useDesktopUpdate(view => view.presentation)
  const summary = useUpdateCenter(value => value)
  const [dismissed, setDismissed] = useState<string>()
  const extensions = summary.sources.filter(source => source.id !== 'desktop')
  const count = extensions.reduce((total, source) => total + source.available, 0)
  const desktop = state?.prompt !== undefined
  const ready = desktop ? state.prompt === 'ready' : extensions.some(source => source.ready)
  const key = desktop ? `desktop:${state.version}:${state.prompt}`
    : JSON.stringify([extensions.map(source => [source.id, source.available, source.ready]), state?.hostRuntime?.candidateVersion])
  const busy = summary.operation !== 'idle' || summary.sources.some(source => source.busy)
  const open = !busy && (desktop || ready || count > 0) && dismissed !== key
  const dismiss = () => { setDismissed(key); if (desktop) dismissUpdate() }
  const title = desktop ? t(ready ? 'updates.promptReady' : 'updates.promptAvailable', { version: state.version ?? '' })
    : t(ready ? 'updates.ready' : 'updates.availableCount', { count })
  return <Modal open={open} onClose={dismiss} title={title} closeLabel={t('updates.later')}
    description={t(ready ? 'updates.restartHint' : 'updates.background')}
    footer={<>
      <Button variant="outline" onClick={dismiss}>{t(ready ? 'updates.laterRestart' : 'updates.later')}</Button>
      <Button variant="primary" onClick={() => {
        setDismissed(key)
        if (desktop) openUpdate()
        else if (ready) restartExtensions()
        else prepareExtensions()
      }}>{t(ready ? 'updates.restart' : 'updates.updateAll')}</Button>
    </>} />
}
