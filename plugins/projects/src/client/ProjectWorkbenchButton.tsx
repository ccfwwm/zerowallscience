import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, FlaskConical, FolderOpen, FolderPlus, Save, Settings2, Upload, X } from 'lucide-react'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from '@zerowallscience/plugin-base/client-helpers'
import css from './ProjectWorkbenchButton.module.css'

export interface ProjectView {
  id: string
  name: string
  rootPath: string
  description: string
  createdAt: string
  updatedAt: string
}

interface WorkbenchActions {
  listProjects: () => Promise<ProjectView[]>
  listRecentProjects: () => Promise<ProjectView[]>
  createProject: (name: string, rootPath: string) => Promise<ProjectView>
  openProject: (id: string) => Promise<ProjectView>
  updateProject: (id: string, changes: { name: string; rootPath: string; description: string }) => Promise<ProjectView>
  getProjectSettings: (id: string) => Promise<ProjectSettings>
  updateProjectSettings: (id: string, settings: { defaultContextId: string; autoHarvest: boolean }) => Promise<ProjectSettings>
  exportProject: (id: string) => Promise<ProjectBundle>
  importProject: (bundle: ProjectBundle) => Promise<ProjectView>
}

export interface ProjectSettings { projectId: string; settings: { defaultContextId?: string; autoHarvest?: boolean }; lastOpenedAt?: string; updatedAt: string }

export interface ProjectBundle {
  format: 'zerowall-science-project'
  version: 1
  exportedAt: string
  project: ProjectView
  sessionArchives: Array<{
    format: 'dsh-session-jsonl'
    version: 1
    sessionId: string
    sha256: string
    content: string
  }>
}

type Props = SidebarFooterActionOwnerProps & WorkbenchActions & PropsLocale<typeof NS>

export function ProjectWorkbenchButton({ wide, t, listProjects, listRecentProjects, createProject, openProject, updateProject, getProjectSettings, updateProjectSettings, exportProject, importProject }: Props) {
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectView[]>([])
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [recentIds, setRecentIds] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<ProjectView>()
  const [editName, setEditName] = useState('')
  const [editRootPath, setEditRootPath] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [defaultContextId, setDefaultContextId] = useState('')
  const [autoHarvest, setAutoHarvest] = useState(true)

  const refresh = useCallback(async () => {
    setBusy(true)
    setError(undefined)
    try {
      const [all, recent] = await Promise.all([listProjects(), listRecentProjects()])
      setProjects(all)
      setRecentIds(new Set(recent.map(project => project.id)))
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }, [listProjects])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (editing !== undefined) setEditing(undefined)
      else setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => window.removeEventListener('keydown', closeOnEscape, true)
  }, [editing, open])

  const submit = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await createProject(name, rootPath)
      setName('')
      setRootPath('')
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const download = async (project: ProjectView) => {
    setError(undefined)
    try {
      const bundle = await exportProject(project.id)
      const blob = new Blob([`${JSON.stringify(bundle, null, 2)}\n`], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${safeFilename(project.name)}.zerowall-project.json`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const upload = async (file: File | undefined) => {
    if (file === undefined) return
    setBusy(true)
    setError(undefined)
    try {
      const parsed = JSON.parse(await file.text()) as ProjectBundle
      await importProject(parsed)
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const openExisting = async (id: string) => {
    setBusy(true); setError(undefined)
    try { await openProject(id); await refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const beginEdit = async (project: ProjectView) => {
    setBusy(true); setError(undefined)
    try {
      const preferences = await getProjectSettings(project.id)
      setEditing(project); setEditName(project.name); setEditRootPath(project.rootPath); setEditDescription(project.description)
      setDefaultContextId(typeof preferences.settings.defaultContextId === 'string' ? preferences.settings.defaultContextId : '')
      setAutoHarvest(preferences.settings.autoHarvest !== false)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const saveEdit = async () => {
    if (editing === undefined) return
    setBusy(true); setError(undefined)
    try {
      await updateProject(editing.id, { name: editName, rootPath: editRootPath, description: editDescription })
      await updateProjectSettings(editing.id, { defaultContextId, autoHarvest })
      setEditing(undefined)
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  return <>
    <button className={css.trigger} type="button" onClick={() => setOpen(true)} title={t('project.trigger')} aria-label={t('project.trigger')}>
      <FlaskConical size={18} aria-hidden="true" />
      {wide && <span>{t('project.nav')}</span>}
    </button>
    {open && createPortal(
      <div className={css.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
        <section className={css.panel} role="dialog" aria-modal="true" aria-labelledby="zerowall-projects-title">
          <header className={css.header}>
            <div><p className={css.eyebrow}>ZeroWall Science</p><h2 id="zerowall-projects-title">{t('project.title')}</h2></div>
            <button className={css.iconButton} type="button" onClick={() => setOpen(false)} title={t('common.close')} aria-label={t('common.close')}><X size={18} /></button>
          </header>
          <div className={css.createRow}>
            <label><span>{t('common.name')}</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('project.example')} /></label>
            <label><span>{t('project.root')}</span><input value={rootPath} onChange={(event) => setRootPath(event.target.value)} placeholder="C:\\science\\project" /></label>
            <button className={css.createButton} type="button" onClick={() => void submit()} disabled={busy || name.trim() === '' || rootPath.trim() === ''} title={t('common.create')}><FolderPlus size={17} /><span>{t('common.create')}</span></button>
          </div>
          <div className={css.bundleBar}>
            <span>{t('project.bundle')}</span>
            <label className={css.importButton} title={t('project.importTitle')}><Upload size={16} /><span>{t('project.import')}</span><input type="file" accept="application/json,.json" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = '' }} /></label>
          </div>
          {editing && <form className={css.editor} aria-label={t('project.settings')} onSubmit={(event) => { event.preventDefault(); void saveEdit() }}>
            <div className={css.editorHeading}><div><strong>{t('project.settings')}</strong><span>{editing.name}</span></div><button className={css.iconButton} type="button" onClick={() => setEditing(undefined)} title={t('project.closeSettings')} aria-label={t('project.closeSettings')}><X size={17} /></button></div>
            <label><span>{t('common.name')}</span><input value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
            <label><span>{t('project.root')}</span><input value={editRootPath} onChange={(event) => setEditRootPath(event.target.value)} /></label>
            <label className={css.wideField}><span>{t('project.description')}</span><input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /></label>
            <label><span>{t('project.defaultContext')}</span><input value={defaultContextId} onChange={(event) => setDefaultContextId(event.target.value)} placeholder={t('common.optional')} /></label>
            <label className={css.toggle}><input type="checkbox" checked={autoHarvest} onChange={(event) => setAutoHarvest(event.target.checked)} /><span>{t('project.autoHarvest')}</span></label>
            <button className={css.createButton} type="submit" disabled={busy || editName.trim() === '' || editRootPath.trim() === ''}><Save size={16} /><span>{t('common.save')}</span></button>
          </form>}
          {error && <p className={css.error} role="alert">{error}</p>}
          <div className={css.list} aria-busy={busy}>
            {projects.length === 0 && !busy && <p className={css.empty}>{t('project.empty')}</p>}
            {projects.map((project) => <article className={css.project} key={project.id}>
              <div><h3>{project.name}{recentIds.has(project.id) && <span className={css.recent}>{t('project.recent')}</span>}</h3><p>{project.rootPath}</p>{project.description && <p>{project.description}</p>}</div>
              <div className={css.projectActions}><time dateTime={project.updatedAt}>{new Date(project.updatedAt).toLocaleDateString(t('common.dateLocale'))}</time><button className={css.iconButton} type="button" onClick={() => void openExisting(project.id)} title={t('project.open')} aria-label={t('project.openNamed', { name: project.name })}><FolderOpen size={16} /></button><button className={css.iconButton} type="button" onClick={() => void beginEdit(project)} title={t('project.settings')} aria-label={t('project.configure', { name: project.name })}><Settings2 size={16} /></button><button className={css.iconButton} type="button" onClick={() => void download(project)} title={t('project.export', { name: project.name })} aria-label={t('project.export', { name: project.name })}><Download size={16} /></button></div>
            </article>)}
          </div>
        </section>
      </div>, document.body,
    )}
  </>
}

function safeFilename(value: string): string {
  const safe = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '')
  return safe === '' ? 'zerowall-project' : safe
}
