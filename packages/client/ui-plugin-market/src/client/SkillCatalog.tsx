/** Skills share the existing Plugins workspace and update center. */
import { useEffect, useState, type ReactNode } from 'react'
import { Button, Modal, PluginArtworkDefault, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { MarketSkillCatalog } from '@deepseek-ai/dsh-plugin-market/types'
import type { createSkillCatalogController } from './skill-catalog-store.ts'
import { ListSkeleton } from './DiscoverSection.tsx'
import css from './DiscoverSection.module.css'

/** Stable state and actions shared across discovery, updates and feedback. */
export interface SkillCatalogFace {
  hooks: { skills: ReturnType<typeof createSkillCatalogController>['store'] }
  read: (refresh?: boolean) => Promise<boolean>
  install: (targets: readonly { id: string; version: string }[]) => Promise<boolean>
  update: () => Promise<boolean>
  clearToast: () => void
  resolveText: (text: Record<string, string>) => string
}
type Props = PropsLocale<'pluginMarket.skills'> & InjectFace<SkillCatalogFace>
type Entry = MarketSkillCatalog['entries'][number]

function Failure({ catalog, t }: { catalog: MarketSkillCatalog; t: Props['t'] }): ReactNode {
  return catalog.error === undefined ? null : <div role="alert" className={css.failure}>
    <details><summary>{t(catalog.error.code === 'partial' ? 'partial' : 'failed')}</summary><pre>{catalog.error.diagnostic}</pre></details>
  </div>
}

function SkillRow({ row, busy, t, resolveText, select }: { row: Entry; busy: boolean; t: Props['t']; resolveText: Props['resolveText']; select: (row: Entry) => void }): ReactNode {
  return <li className={css.card} data-market-skill={row.id}>
    <span className={css.icon} aria-hidden="true"><PluginArtworkDefault size={36} /></span>
    <div className={css.main}><span className={css.strong}>{resolveText(row.title)}</span><span className={css.description}>{resolveText(row.description)}</span><span className={css.meta}>{row.installedVersion && row.installedVersion !== row.version ? row.installedVersion + ' → ' : ''}{row.version}</span></div>
    <Button variant={row.status === 'update' ? 'primary' : 'outline'} size="sm" disabled={busy || row.status === 'installed'} onClick={() => { select(row) }}>{t(row.status === 'installed' ? 'installed' : row.status === 'update' ? 'update' : 'install')}</Button>
  </li>
}

/**
 * Show online skills in the existing Plugins workspace.
 * @param props - Bound market operations.
 * @returns Online skills inside Plugins.
 */
export function SkillCatalogTab({ useSkills, t, read, install, resolveText }: Props): ReactNode {
  const { catalog, busy, checked } = useSkills(value => value)
  const [selected, setSelected] = useState<Entry>()
  useEffect(() => { void read(false) }, [read])
  return <section className={css.section} aria-label={t('title')} aria-busy={busy}>
    <div className={css.toolbar}><p className={css.muted}>{t('description')}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => { void read(true) }}>{t('refresh')}</Button></div>
    <Failure catalog={catalog} t={t} />
    {!checked ? <ListSkeleton label={t('loading')} /> : null}
    {checked && !catalog.available ? <p className={css.muted}>{t('unavailable')}</p> : null}
    {checked && catalog.available && !catalog.entries.length ? <p className={css.muted}>{t('empty')}</p> : null}
    <ul className={css.cards}>{catalog.entries.map(row => (
      <SkillRow key={row.id} row={row} busy={busy} t={t} resolveText={resolveText} select={setSelected} />
    ))}</ul>
    <Modal open={selected !== undefined} onClose={() => { setSelected(undefined) }} closeLabel={t('cancel')} title={t('confirm')}>
      <p>{selected === undefined ? '' : resolveText(selected.title)}</p><p>{t('trust')}</p>
      <div className={css.toolbar}><Button variant="outline" onClick={() => { setSelected(undefined) }}>{t('cancel')}</Button><Button variant="primary" onClick={() => { if (selected !== undefined) { void install([selected]); setSelected(undefined) } }}>{t('install')}</Button></div>
    </Modal>
  </section>
}

/**
 * Show skill updates and newly published suites in the update page.
 * @param props - Shared skill state and operations.
 * @returns Skill updates and independent installation actions.
 */
export function SkillCatalogUpdates({ useSkills, t, read, install, update, resolveText }: Props): ReactNode {
  const { catalog, busy, checked } = useSkills(value => value)
  useEffect(() => { void read(false) }, [read])
  const updates = catalog.entries.filter(row => row.status === 'update')
  const available = catalog.entries.filter(row => row.status !== 'installed')
  if (checked && !catalog.available) return null
  return <section className={css.section} aria-label={t('updates')} aria-busy={busy}>
    <div className={css.toolbar}><span className={css.strong}>{t('updates')}</span>{updates.length ? <Button size="sm" variant="primary" disabled={busy} onClick={() => { void update() }}>{t('updateAll')}</Button> : checked ? <span className={css.muted}>{t('current')}</span> : null}</div>
    <Failure catalog={catalog} t={t} />
    <ul className={css.cards}>{available.map(row => (
      <SkillRow key={row.id} row={row} busy={busy} t={t} resolveText={resolveText} select={(item) => { void install([item]) }} />
    ))}</ul>
  </section>
}

/**
 * Show success feedback across panel navigation.
 * @param props - Shared operation feedback.
 * @returns A toast that survives panel navigation.
 */
export function SkillCatalogFeedback({ useSkills, t, clearToast }: Props): ReactNode {
  const toast = useSkills(value => value.toast)
  return toast === null ? null : <Toast key={toast} text={t('done')} tone="success" onDone={clearToast} />
}
