/** Persistent, nonmodal update invitation owned by the application shell. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { DesktopUpdateSource } from './desktop-update-source.ts'
import css from './DesktopUpdatePrompt.module.css'

/** Main-owned choices and observed state; closing settings does not discard readiness. */
export interface DesktopUpdatePromptInjected {
  openUpdate: () => void
  dismissUpdate: () => void
  hooks: { desktopUpdate: DesktopUpdateSource['store'] }
}

/** @param props - Carrier state, authorized actions, and locale. @returns A reminder without taking keyboard focus. */
export function DesktopUpdatePrompt({ useDesktopUpdate, openUpdate, dismissUpdate, t }:
  PropsRuntime<'shell.overlay'> & PropsLocale<'settings'> & InjectFace<DesktopUpdatePromptInjected>) {
  const state = useDesktopUpdate(view => view.presentation)
  if (state?.prompt === undefined) return null
  const ready = state.prompt === 'ready'
  return <aside className={css.notice} aria-label={t('updates.center')}>
    <div role="status"><h3>{t(ready ? 'updates.promptReady' : 'updates.promptAvailable', { version: state.version ?? state.hostRuntime?.candidateVersion ?? '' })}</h3>
      <p>{t(ready ? 'updates.deferHint' : 'updates.background')}</p></div>
    <a href="https://zerowallscience.org/" target="_blank" rel="noreferrer">{t('updates.website')}</a>
    <div className={css.actions}>
      <Button variant="outline" onClick={dismissUpdate}>{t(ready ? 'updates.laterRestart' : 'updates.later')}</Button>
      <Button variant="primary" onClick={openUpdate}>{t(ready ? 'updates.restart' : 'updates.updateAll')}</Button>
    </div>
  </aside>
}
