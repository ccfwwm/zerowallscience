import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import { NS } from '../../../base/src/client/locales.js'
import { ScientificEngineCenter } from './scientific-engine-center.js'
import styles from './scientific-engine-settings-section.module.css'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']
type Props = PropsRuntime<'settings.section'> & PropsLocale<typeof NS> & { remote: Remote }

/** Global Settings entry for the same Host-backed engine configuration used by the workbench. */
export function ScientificEngineSettingsSection({ remote, useSessions, t }: Props): JSX.Element {
  const sessionId = useSessions(state => state.current) ?? ''
  return <section className={styles.root}>
    <header className={styles.header}>
      <div>
        <span className={styles.eyebrow}>{t('research.engineSettings.eyebrow')}</span>
        <h2>{t('research.engineSettings.title')}</h2>
        <p>{t('research.engineSettings.description')}</p>
      </div>
      <span className={styles.session}>{sessionId ? t('research.engineSettings.session') : t('research.engineSettings.user')}</span>
    </header>
    {!sessionId && <p className={styles.notice} role="status">{t('research.engineSettings.noSession')}</p>}
    <div className={styles.body}>
      <ScientificEngineCenter remote={remote} sessionId={sessionId} showLaunch={false} />
    </div>
  </section>
}
