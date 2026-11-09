/** The sidebar's Plugins entry icon; the sidebar owns the button, label, and selected state around it. */

import type { ReactNode } from 'react'
import { IconPluginPinwheelOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { updateCandidate, type PluginManagerFace } from './manager-store.ts'
import css from './PluginsPanelIcon.module.css'

/**
 * Render the plugin glyph at the size the sidebar asks for.
 * @param props - the sidebar's icon share: the requested edge and whether the panel is selected.
 * @returns the icon element.
 */
export function PluginsPanelIcon({ size, usePluginManager, t }: PropsRuntime<'sidebar.panellist'> & PropsLocale<'pluginManager'> & InjectFace<{ hooks: Pick<PluginManagerFace['hooks'], 'pluginManager'> }>): ReactNode {
  const count = usePluginManager(state => state.packages.filter((pkg) => {
    const check = state.versions[pkg.name]
    return pkg.updatable && check?.phase === 'done' && updateCandidate(check.list) !== undefined
  }).length)
  return <span className={css.icon}><IconPluginPinwheelOutlineRegular size={size} />
    {count > 0 ? <span className={css.badge} role="img" aria-label={t('updatesAvailable', { count: String(count) })} /> : null}
  </span>
}
