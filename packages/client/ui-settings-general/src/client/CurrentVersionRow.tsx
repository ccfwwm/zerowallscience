/** Installed release version in General Settings for Web and Desktop. */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './CurrentVersionRow.module.css'

/**
 * Render the version embedded by the client build; partial builds without metadata omit the row.
 * @param props - runtime share and localized copy.
 * @returns the current release label, or nothing when build metadata is absent.
 */
export function CurrentVersionRow({ t, openAbout }: PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<{ openAbout?: (() => void) | undefined }>) {
  const version = process.env.DSH_CLIENT_VERSION
  if (version === undefined) return null
  return <div className={css.row}>{t('general.currentVersion', { version })}
    {openAbout === undefined ? null : <Button variant="outline" size="sm" onClick={openAbout}>{t('general.about')}</Button>}
  </div>
}
