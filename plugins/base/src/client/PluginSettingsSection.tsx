import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.js'
import css from './PluginSettingsSection.module.css'

type Props = PropsRuntime<'settings.section'> & PropsLocale<typeof NS>

/** Shortcut for the sidebar file preview setting. */
export function PluginSettingsSection({ t }: Props) {
  const openFileViewers = () => {
    document.body.dataset.zerowallFocusFileViewers = 'true'
    window.dispatchEvent(new CustomEvent('zerowall:open-settings', { detail: 'better-sidebar' }))
  }

  return <section className={css.root}>
    <h2>{t('pluginSettings.title')}</h2>
    <p className={css.intro}>{t('pluginSettings.description')}</p>
    <div className={css.list}>
      <button type="button" onClick={openFileViewers}>
        <span><strong>{t('pluginSettings.fileViewers')}</strong><small>{t('pluginSettings.fileViewersDescription')}</small></span>
        <span aria-hidden="true">›</span>
      </button>
    </div>
  </section>
}
