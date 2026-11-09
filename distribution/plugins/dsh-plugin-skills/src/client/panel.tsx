/** Search, preview and explicit management actions for the shared skill registry. */
import { useCallback, useEffect, useState } from 'react'
import { Button, Input, Switch, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginDetailProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { ImportPreview, ManagedSkill, SkillsRequest, SkillsResponse } from '../shared/types.js'
import type { NS, SkillsKey } from './locales.js'
import type { createSkillsViewStore } from './view-store.js'
import css from './panel.module.css'

/** Callbacks captured in the owning injected plugin fiber. */
export interface SkillsFace { request: (input: SkillsRequest) => Promise<SkillsResponse>; pickDirectory: () => Promise<string | null> }
type FeedbackProps = PropsStore<ReturnType<typeof createSkillsViewStore>> & PropsLocale<typeof NS>
type PanelProps = FeedbackProps & InjectFace<SkillsFace> & { view?: string; ownerPackage?: string }
const topicKeys = new Set<SkillsKey>(['core', 'academic-research', 'remote-research', 'paper-download', 'research-integrity', 'omics', 'molecular-science', 'documents', 'computing', 'specialist-science', 'plugin', 'imported'])

/** Render feedback in the shell so it survives panel dismissal. */
export function SkillsFeedback({ useStore, actions, t }: FeedbackProps) {
  const toast = useStore(state => state.toast)
  return toast ? <Toast key={toast.id} text={t(toast.key)} {...toast.success ? { tone: 'success' as const } : {}} onDone={actions.clear} /> : null
}

/** Render the complete management page without exposing Cordis services to components. */
export function SkillsPanel({ request, pickDirectory, t, actions, view, ownerPackage }: PanelProps) {
  const [entries, setEntries] = useState<ManagedSkill[]>([])
  const [complete, setComplete] = useState(true)
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('')
  const [cwd, setCwd] = useState<string>()
  const [scope, setScope] = useState<'global' | 'workspace'>('global')
  const selectedCwd = scope === 'workspace' ? cwd : undefined
  const [preview, setPreview] = useState<ImportPreview>()
  const [replace, setReplace] = useState(false)
  const [content, setContent] = useState<{ title: string; text: string }>()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const reload = useCallback(async () => {
    const response = await request({ action: 'list', ...(selectedCwd ? { cwd: selectedCwd } : {}) })
    setEntries(response.entries ?? []); setComplete(response.complete !== false)
  }, [request, selectedCwd])
  useEffect(() => {
    let current = true
    void request({ action: 'list', ...(selectedCwd ? { cwd: selectedCwd } : {}) }).then(response => {
      if (current) { setEntries(response.entries ?? []); setComplete(response.complete !== false); setFailure('') }
    }).catch((error: unknown) => { if (current) setFailure(error instanceof Error ? error.message : String(error)) })
    return () => { current = false }
  }, [request, selectedCwd])
  async function operate(input: SkillsRequest): Promise<void> {
    setBusy(true); setFailure('')
    try {
      const response = await request({ ...input, ...(selectedCwd ? { cwd: selectedCwd } : {}), scope })
      if (response.preview) { setPreview(response.preview); setReplace(false) }
      else if (input.action === 'detail') setContent({ title: response.entries?.[0]?.name ?? '', text: response.content ?? '' })
      else if (input.action !== 'list') {
        if (input.action === 'install') setPreview(undefined)
        actions.notify(input.action === 'install' ? 'importedDisabled' : 'saved', true)
      }
      await reload()
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error)); actions.notify('failed', false)
    } finally { setBusy(false) }
  }
  if (view !== undefined && view !== 'page') return null
  const visible = entries.filter(row => (ownerPackage ? row.kind === 'plugin-instructions' && row.ownerPackage === ownerPackage : row.kind !== 'plugin-instructions') && `${row.name} ${row.description}`.toLowerCase().includes(query.toLowerCase()))
  const topics = [...new Set(visible.map(row => row.topic))]
  if (ownerPackage && !visible.length && !failure) return null
  return <section className={css.root} aria-label={t('title')} aria-busy={busy}>
    <h2>{t(ownerPackage ? 'plugin' : 'title')}</h2><p>{t(ownerPackage ? 'pluginDescription' : 'description')}</p>
    <div className={css.toolbar}>
      <Input aria-label={t('search')} placeholder={t('search')} value={query} onChange={event => setQuery(event.target.value)} />
      <Button disabled={busy} onClick={() => { void operate({ action: 'list' }) }}>{t('refresh')}</Button>
      <select aria-label={t('global')} value={scope} onChange={event => setScope(event.target.value === 'workspace' ? 'workspace' : 'global')}><option value="global">{t('global')}</option><option value="workspace">{t('workspace')}</option></select>
      <Button disabled={busy} onClick={() => { void pickDirectory().then(path => { if (path) setCwd(path) }).catch((error: unknown) => setFailure(String(error))) }}>{t('workspacePath')}</Button>
      {cwd && <span className={css.path}>{cwd}</span>}
    </div>
    {failure && <div role="alert" className={css.notice}>{t('failed')}<details><summary>{t('detail')}</summary><pre>{failure}</pre></details></div>}
    {!complete && <p role="status">{t('incomplete')}</p>}
    {!ownerPackage && <details className={css.import}><summary>{t('preview')}</summary><p>{t('importNote')}</p>
      <div className={css.toolbar}><Input aria-label={t('source')} placeholder={t('source')} value={source} onChange={event => setSource(event.target.value)} /><Button disabled={busy || !source.trim()} onClick={() => { void operate({ action: 'preview', source }) }}>{t('preview')}</Button></div>
      {preview && <div><p>{preview.source}</p>{preview.commit && <code>{preview.commit}</code>}<ul>{preview.skills.map(row => <li key={row.name}>{row.name}{row.conflict && ` · ${t('conflict')}`}</li>)}</ul>
        {preview.skills.some(row => row.conflict) && <label><input type="checkbox" checked={replace} onChange={event => setReplace(event.target.checked)} />{t('replace')}</label>}
        <Button disabled={busy || scope === 'workspace' && !cwd || preview.skills.some(row => row.conflict) && !replace} onClick={() => { void operate({ action: 'install', id: preview.id, replace }) }}>{t('install')}</Button>
      </div>}
    </details>}
    {!visible.length && <p>{t('empty')}</p>}
    {topics.map(topic => {
      const rows = visible.filter(row => row.topic === topic)
      const enabled = rows.some(row => row.enabled || row.onDemand)
      return <details key={topic} className={css.group} open={topic === 'core'}><summary>{topicKeys.has(topic as SkillsKey) ? t(topic as SkillsKey) : topic} ({rows.length})</summary>
        {!['core', 'plugin', 'imported'].includes(topic) && <Button disabled={busy || scope === 'workspace' && !cwd} onClick={() => { void operate({ action: 'set-topic', topic, enabled: !enabled }) }}>{t(enabled ? 'disableTopic' : 'enableTopic')}</Button>}
        {rows.map(row => <article className={css.row} key={row.id}>
          <div className={css.body}><button className={css.name} onClick={() => { void operate({ action: 'detail', id: row.id }) }}>{row.name}</button><p>{row.description}</p><small>{row.provider} · {row.source} · {t(!row.effective ? 'shadowed' : row.onDemand ? 'onDemand' : row.enabled ? 'enabled' : 'disabled')}</small>
            {row.requirements.length > 0 && <details><summary>{t('requirements')} ({row.requirements.length})</summary><p>{row.requirements.join(', ')}</p></details>}
            {row.license && <small>{t('license')}: {row.license}</small>}
          </div>
          <Switch label={`${t(ownerPackage ? 'enableInstructions' : 'enable')}: ${row.name}`} checked={row.enabled || row.onDemand === true} disabled={busy || !row.effective || scope === 'workspace' && !cwd} onChange={enabled => { void operate({ action: 'set-enabled', name: row.name, enabled }) }} />
          {row.removable && <Button disabled={busy} onClick={() => { void operate({ action: 'remove', id: row.id }) }}>{t('remove')}</Button>}
        </article>)}
      </details>
    })}
    {content && <section className={css.detail}><div className={css.toolbar}><h3>{content.title}</h3><Button onClick={() => setContent(undefined)}>{t('close')}</Button></div><pre>{content.text}</pre></section>}
    {!ownerPackage && <small>{t('removeNote')}</small>}
  </section>
}

/** Show registry-owned instructions on their installed plugin's detail page. */
export function PluginInstructionsPanel({ subject, ...props }: Omit<PanelProps, 'ownerPackage'> & PluginDetailProps) {
  const ownerPackage = subject.kind === 'item' ? subject.id : subject.kind === 'row' ? subject.row.moduleName.split('/').slice(0, subject.row.moduleName.startsWith('@') ? 2 : 1).join('/') : subject.pkg.name
  return <SkillsPanel key={ownerPackage} {...props} ownerPackage={ownerPackage} />
}
