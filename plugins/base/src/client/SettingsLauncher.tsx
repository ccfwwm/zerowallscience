import { Settings } from 'lucide-react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SidebarFooterAction.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'zerowall.settingsLauncher': 'label' }
}

export function SettingsLauncher({ wide, settingsOpen, settingsShortcut, openSettings, t }: PropsRuntime<'settings.launcher'> & PropsLocale<'zerowall.settingsLauncher'>) {
  const label = t('label')
  return <button type="button" className={css.action} data-zerowall-footer-action
    title={settingsShortcut?.keys.length ? `${label} (${settingsShortcut.keys.join('+')})` : label}
    aria-label={label} aria-haspopup="dialog" aria-expanded={settingsOpen}
    aria-keyshortcuts={settingsShortcut?.aria} onClick={openSettings}>
    <span data-zerowall-footer-icon><Settings size={18} aria-hidden="true" /></span>
    {wide ? <span>{label}</span> : null}
  </button>
}
