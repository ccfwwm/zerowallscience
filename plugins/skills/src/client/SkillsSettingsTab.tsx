import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, Plus, Power, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from '@zerowallscience/plugin-base/client-helpers'
import css from './SkillsSettingsTab.module.css'

export interface SkillSummaryView {
  name: string
  description: string
  whenToUse?: string
  source: string
  provider: string
  modelInvocable: boolean
  userInvocable: boolean
}

export interface SkillDetailView extends SkillSummaryView { content: string }

export interface SkillSourceView { enabled: string[]; disabled: string[] }

export interface CreateSkillView { name: string; description: string; whenToUse?: string; content: string }

interface Actions {
  listSkills: () => Promise<SkillSummaryView[]>
  getSkill: (name: string) => Promise<SkillDetailView>
  listSkillSources?: () => Promise<SkillSourceView>
  createSkill?: (input: CreateSkillView) => Promise<SkillSummaryView>
  importSkill?: (sourcePath: string) => Promise<SkillSummaryView>
  removeImportedSkill?: (name: string) => Promise<void>
  setSkillEnabled?: (name: string, enabled: boolean) => Promise<void>
}

type Props = Actions & PropsLocale<typeof NS>

export function SkillsSettingsTab(props: Props) {
  const [skills, setSkills] = useState<SkillSummaryView[]>([])
  const [selectedName, setSelectedName] = useState<string>()
  const [detail, setDetail] = useState<SkillDetailView>()
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [sourcesState, setSourcesState] = useState<SkillSourceView>({ enabled: [], disabled: [] })
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<CreateSkillView>({ name: '', description: '', whenToUse: '', content: '' })

  const refresh = useCallback(async () => {
    setBusy(true)
    setError(undefined)
    try {
      const [next, nextSources] = await Promise.all([
        props.listSkills(),
        props.listSkillSources?.() ?? Promise.resolve({ enabled: [], disabled: [] }),
      ])
      setSkills(next)
      setSourcesState(nextSources)
      if (selectedName !== undefined && !next.some(skill => skill.name === selectedName)) {
        setSelectedName(undefined)
        setDetail(undefined)
      }
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(false)
    }
  }, [props.listSkills, selectedName])

  useEffect(() => { void refresh() }, [])

  const sources = useMemo(() => [...new Set(skills.map(skill => skill.source))].sort(), [skills])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return skills.filter(skill => (source === 'all' || skill.source === source)
      && (needle === '' || `${skill.name} ${skill.description} ${skill.whenToUse ?? ''}`.toLowerCase().includes(needle)))
  }, [query, skills, source])

  const load = async (skill: SkillSummaryView) => {
    setSelectedName(skill.name)
    setDetail(undefined)
    setBusy(true)
    setError(undefined)
    try {
      setDetail(await props.getSkill(skill.name))
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(false)
    }
  }

  const runAction = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(undefined)
    try { await action(); await refresh() } catch (reason) { setError(message(reason)) } finally { setBusy(false) }
  }

  const importFolder = async () => {
    const path = await window.zerowallDesktop?.chooseDirectory()
    if (path && props.importSkill) await runAction(() => props.importSkill!(path))
  }

  const selectedImported = selectedName !== undefined && sourcesState.enabled.includes(selectedName) || selectedName !== undefined && sourcesState.disabled.includes(selectedName)
  const selectedEnabled = selectedName !== undefined && sourcesState.enabled.includes(selectedName)

  return <section className={css.section} aria-labelledby="zerowall-skills-title">
    <header className={css.header}>
      <div><h3 id="zerowall-skills-title">{props.t('skills.title')}</h3><p>{props.t('skills.intro', { count: skills.length })}</p></div>
      <div className={css.headerActions}>
        {props.createSkill && <button className={css.actionButton} type="button" onClick={() => setEditorOpen(true)} disabled={busy}><Plus size={15} />{props.t('skills.add')}</button>}
        {props.importSkill && <button className={css.actionButton} type="button" onClick={() => void importFolder()} disabled={busy}><Upload size={15} />{props.t('skills.import')}</button>}
        <button className={css.iconButton} type="button" onClick={() => void refresh()} disabled={busy} title={props.t('common.refresh')} aria-label={props.t('skills.refresh')}><RefreshCw size={17} /></button>
      </div>
    </header>
    <div className={css.filters}>
      <label className={css.search}><Search size={16} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={props.t('skills.search')} /></label>
      <select value={source} onChange={event => setSource(event.target.value)} aria-label={props.t('skills.sourceFilter')}>
        <option value="all">{props.t('skills.allSources')}</option>
        {sources.map(item => <option key={item} value={item}>{item}</option>)}
      </select>
    </div>
    {error && <p className={css.error} role="alert">{error}</p>}
    <div className={css.workspace}>
      <div className={css.list} aria-label={props.t('skills.catalog')}>
        {filtered.map(skill => <button key={skill.name} className={`${css.skillRow} ${selectedName === skill.name ? css.selected : ''}`} type="button" onClick={() => void load(skill)}>
          <span className={css.skillIcon}><BookOpen size={16} /></span>
          <span><strong>{skill.name}</strong><small>{skill.description}</small></span>
          <span className={css.source}>{sourcesState.disabled.includes(skill.name) ? props.t('skills.disabled') : skill.source}</span>
        </button>)}
        {!busy && filtered.length === 0 && <p className={css.empty}>{props.t('skills.empty')}</p>}
      </div>
      <article className={css.detail}>
        {detail === undefined ? <div className={css.placeholder}><BookOpen size={28} /><h4>{props.t('skills.selectTitle')}</h4><p>{props.t('skills.selectDescription')}</p></div> : <>
          <div className={css.detailHead}><div><h4>{detail.name}</h4><p>{detail.description}</p></div><span>{detail.provider}</span></div>
          {selectedImported && <div className={css.detailActions}>
            {props.setSkillEnabled && <button className={css.actionButton} type="button" onClick={() => void runAction(() => props.setSkillEnabled!(detail.name, !selectedEnabled))} disabled={busy}><Power size={15} />{selectedEnabled ? props.t('skills.disable') : props.t('skills.enable')}</button>}
            {props.removeImportedSkill && <button className={`${css.actionButton} ${css.dangerButton}`} type="button" onClick={() => void runAction(() => props.removeImportedSkill!(detail.name))} disabled={busy}><Trash2 size={15} />{props.t('skills.remove')}</button>}
          </div>}
          <div className={css.badges}>
            <span>{detail.source}</span>
            <span data-enabled={detail.modelInvocable}>{props.t(detail.modelInvocable ? 'skills.modelEnabled' : 'skills.modelDisabled')}</span>
            <span data-enabled={detail.userInvocable}>{props.t(detail.userInvocable ? 'skills.userEnabled' : 'skills.userDisabled')}</span>
          </div>
          {detail.whenToUse && <p className={css.when}><strong>{props.t('skills.whenToUse')}</strong>{detail.whenToUse}</p>}
          <pre className={css.content}>{detail.content}</pre>
        </>}
      </article>
    </div>
    {editorOpen && props.createSkill && <div className={css.editorBackdrop} role="presentation"><section className={css.editorPanel} role="dialog" aria-modal="true" aria-labelledby="zerowall-skill-editor-title">
      <header className={css.editorHeader}><h3 id="zerowall-skill-editor-title">{props.t('skills.addTitle')}</h3><button className={css.iconButton} type="button" onClick={() => setEditorOpen(false)} aria-label={props.t('common.close')}><X size={17} /></button></header>
      <label><span>{props.t('common.name')}</span><input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="literature-review" /></label>
      <label><span>{props.t('skills.description')}</span><input value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
      <label><span>{props.t('skills.whenToUse')}</span><input value={draft.whenToUse} onChange={event => setDraft({ ...draft, whenToUse: event.target.value })} /></label>
      <label><span>{props.t('skills.content')}</span><textarea rows={12} value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} /></label>
      <footer><button type="button" onClick={() => setEditorOpen(false)}>{props.t('common.cancel')}</button><button className={css.saveButton} type="button" disabled={busy} onClick={() => void runAction(async () => { await props.createSkill!(draft); setDraft({ name: '', description: '', whenToUse: '', content: '' }); setEditorOpen(false) })}>{props.t('common.save')}</button></footer>
    </section></div>}
  </section>
}

function message(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason) }
