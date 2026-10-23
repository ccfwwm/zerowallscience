import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Check, ChevronDown, ChevronRight, Cpu, LoaderCircle } from 'lucide-react'
import type { ModelSelectInjected } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { displayGroups, groupRate, type GroupCatalogStore, type GroupModel } from './group-catalog.js'
import { GroupInfo, RateBadge } from './GroupInfo.js'
import { MODEL_NS } from './model-locales.js'
import { useFloatingPanel } from './use-floating-panel.js'
import css from './GroupedModelSelect.module.css'

type Pane = 'root' | 'group' | 'model' | 'effort'
type Props = ModelSelectInjected & PropsLocale<typeof MODEL_NS> & { locked?: boolean; catalog: GroupCatalogStore }

export function GroupedModelSelect({ available, locked, directory, load, select, catalog, t }: Props) {
  const state = useSyncExternalStore(fn => directory.subscribe(fn), () => directory.getSnapshot())
  const metadata = useSyncExternalStore(catalog.subscribe, catalog.getSnapshot)
  const groups = useMemo(() => displayGroups(state.groups, metadata), [state.groups, metadata])
  const currentGroup = groups.find(group => group.models.some(row => row.providerId === state.current?.provider && row.model.id === state.current.model))
  const current = currentGroup?.models.find(row => row.providerId === state.current?.provider && row.model.id === state.current.model)
  const reasoning = current?.model.reasoning
  const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortLabel = reasoning?.efforts.find(effort => effort.id === effectiveEffort)?.name ?? state.retainedEffort ?? effectiveEffort
  const busy = state.pending !== null
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<Pane>('root')
  const [browseKey, setBrowseKey] = useState<string>()
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string>()
  const [retrySelection, setRetrySelection] = useState<ModelSelection>()
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const mounted = useRef(true)
  const id = useId()
  const position = useFloatingPanel(open, trigger, menu)
  const browsing = groups.find(group => group.key === browseKey) ?? currentGroup ?? groups[0]
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredGroups = groups.filter(group => `${group.name} ${group.metadata?.description ?? ''}`.toLocaleLowerCase().includes(normalizedQuery))
  const models = browsing?.models.filter(row => `${row.model.name} ${row.model.id}`.toLocaleLowerCase().includes(normalizedQuery)) ?? []
  const close = (focus = true) => { setOpen(false); setBrowseKey(undefined); setQuery(''); if (focus) trigger.current?.focus() }
  const drill = (next: Pane) => { setQuery(''); setPane(next); if (next === 'root') setBrowseKey(undefined) }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (trigger.current?.contains(target) || menu.current?.contains(target) || target.closest?.('[data-zws-group-info]')) return
      close(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open])
  useEffect(() => {
    if (!open) return
    const target = search.current ?? menu.current?.querySelector<HTMLElement>('[aria-checked="true"]:not(:disabled), [data-choice]:not(:disabled)')
    target?.focus()
  }, [open, pane])
  useEffect(() => {
    if (locked || !available) { setOpen(false); setBrowseKey(undefined) }
  }, [locked, available])

  const submit = async (selection: ModelSelection) => {
    setError(undefined); setRetrySelection(selection); trigger.current?.focus()
    try {
      const result = await select(selection)
      if (!mounted.current) return
      if (result?.ok) { setRetrySelection(undefined); close() }
      else if (result && !result.ok) setError(`${result.error.code}: ${result.error.message}`)
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  const choose = (row: GroupModel) => {
    if (row.providerId === state.current?.provider && row.model.id === state.current.model) { close(); return }
    // Preserve an explicitly selected level whenever the target route supports it.
    const effort = row.model.reasoning?.efforts.some(level => level.id === effectiveEffort) ? effectiveEffort : row.model.reasoning?.defaultEffort
    void submit({ provider: row.providerId, model: row.model.id, ...(effort === undefined ? {} : { reasoningEffort: effort }) })
  }
  const keyDown = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape' || (event.key === 'Tab' && event.shiftKey)) {
      event.preventDefault()
      if (pane !== 'root') drill('root'); else close()
      return
    }
    const rows = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[data-choice]:not(:disabled)') ?? [])]
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const active = rows.indexOf(document.activeElement as HTMLButtonElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : active < 0 ? (event.key === 'ArrowDown' ? 0 : rows.length - 1) : (active + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
      rows[next]?.focus(); rows[next]?.scrollIntoView?.({ block: 'nearest' })
    } else if (event.key === 'Enter' && event.target === search.current) { event.preventDefault(); rows[0]?.click() }
    else if (event.key === 'Tab') {
      const controls = [...(menu.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input') ?? [])]
      if (document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus() }
    }
  }
  if (!available) return null
  const modelLabel = current?.model.name ?? state.current?.model ?? t('select')
  const rate = currentGroup?.cloud ? groupRate(currentGroup.metadata) ?? t('unknownRate') : undefined
  const label = [modelLabel, rate, effortLabel].filter(Boolean).join(' · ')
  const isCurrent = (row: GroupModel) => row.providerId === state.current?.provider && row.model.id === state.current.model
  return <div className={css.root}>
    <button ref={trigger} className={css.trigger} type="button" disabled={locked} aria-disabled={busy} title={label} aria-label={`${t('select')}：${label}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onKeyDown={event => { if (open) keyDown(event) }} onClick={() => {
        if (busy) return
        if (open) { close(); return }
        setBrowseKey(currentGroup?.key); setPane('root'); setQuery(''); setError(undefined); setRetrySelection(undefined); setOpen(true)
      }}>
      <Cpu size={16} className={css.triggerIcon} aria-hidden="true" /><span className={css.triggerName}>{modelLabel}</span>
      {rate && <span className={css.triggerMeta}>· {rate}</span>}{effortLabel && <span className={css.triggerMeta}>· {effortLabel}</span>}
      {busy ? <LoaderCircle size={14} className={css.spin} /> : <ChevronDown size={13} aria-hidden="true" />}
    </button>
    {open && createPortal(<div ref={menu} id={id} className={css.menu} style={position} role="dialog" aria-label={t('menu')} onKeyDown={keyDown}>
      {pane === 'root' ? <>
        <div className={css.rootRow}><button data-choice type="button" className={css.row} disabled={busy} aria-label={`${t('group')} ${currentGroup?.name ?? ''}`} onClick={() => drill('group')}><span>{t('group')}</span><span className={css.value}>{currentGroup?.name ?? t('group')}</span>{currentGroup?.cloud && <RateBadge group={currentGroup.metadata} t={t} />}<ChevronRight size={14} /></button>{currentGroup && <GroupInfo name={currentGroup.name} group={currentGroup.metadata} cloud={currentGroup.cloud} t={t} />}</div>
        <button data-choice type="button" className={css.row} disabled={busy} aria-label={`${t('model')} ${modelLabel}`} onClick={() => drill('model')}><span>{t('model')}</span><span className={css.value}>{modelLabel}</span>{currentGroup?.cloud && <RateBadge group={currentGroup.metadata} t={t} />}<ChevronRight size={14} /></button>
        <button data-choice type="button" className={css.row} disabled={!reasoning || busy} onClick={() => drill('effort')} title={!reasoning ? t('noEffort') : undefined}><span>{t('effort')}</span><span className={css.value}>{effortLabel ?? t('defaultEffort')}</span><ChevronRight size={14} /></button>
      </> : <>
        <header className={css.paneHeader}><button type="button" className={css.infoButton} aria-label={t('back')} onClick={() => drill('root')}><ArrowLeft size={16} /></button><strong>{pane === 'model' ? browsing?.name ?? t('model') : t(pane)}</strong>{pane === 'model' && browsing && <GroupInfo name={browsing.name} group={browsing.metadata} cloud={browsing.cloud} t={t} />}</header>
        {pane !== 'effort' && <input ref={search} className={css.search} type="search" aria-label={t(pane === 'group' ? 'searchGroups' : 'searchModels')} placeholder={t(pane === 'group' ? 'searchGroups' : 'searchModels')} value={query} onChange={event => setQuery(event.target.value)} />}
        <div className={css.choices} role="menu" aria-label={t(pane)}>
          {pane === 'group' && filteredGroups.map((group, index) => <div key={group.key}>
            {(index === 0 || filteredGroups[index - 1]?.cloud !== group.cloud) && <div className={css.section}>{t(group.cloud ? 'cloud' : 'configured')}</div>}
            <div className={css.groupRow}><button data-choice className={css.row} type="button" role="menuitemradio" aria-checked={group.key === currentGroup?.key} disabled={busy} title={group.name} onClick={() => { setBrowseKey(group.key); drill('model') }}><span className={css.groupName}>{group.name}<small>{group.models.length}</small></span>{group.cloud && <RateBadge group={group.metadata} t={t} />}<span className={css.check}>{group.key === currentGroup?.key && <Check size={15} />}</span></button><GroupInfo name={group.name} group={group.metadata} cloud={group.cloud} t={t} /></div>
          </div>)}
          {pane === 'model' && models.map(row => <button data-choice key={JSON.stringify([row.providerId, row.model.id])} className={css.row} type="button" role="menuitemradio" aria-checked={isCurrent(row)} disabled={busy} title={`${row.model.name} (${row.providerId})`} onClick={() => choose(row)}><span className={css.modelName}>{row.model.name}</span>{browsing?.cloud && <RateBadge group={browsing.metadata} t={t} />}<span className={css.check}>{isCurrent(row) && <Check size={15} />}</span></button>)}
          {pane === 'effort' && reasoning && <>
            {reasoning.defaultEffort === undefined && <button data-choice className={css.row} type="button" role="menuitemradio" aria-checked={effectiveEffort === undefined} disabled={busy} onClick={() => { if (state.current) void submit({ provider: state.current.provider, model: state.current.model }) }}>{t('defaultEffort')}</button>}
            {reasoning.efforts.map(level => <button data-choice key={level.id} className={css.row} type="button" role="menuitemradio" aria-checked={effectiveEffort === level.id} disabled={busy} onClick={() => { if (state.current) void submit({ ...state.current, reasoningEffort: level.id }) }}><span>{level.name}</span>{effectiveEffort === level.id && <Check size={15} />}</button>)}
          </>}
          {(pane === 'model' && models.length === 0 || pane === 'group' && filteredGroups.length === 0) && <p className={css.help}>{t('empty')}</p>}
        </div>
      </>}
      {state.routable === false && <p className={css.help}>{t('unavailable')}</p>}
      {state.failures.map(failure => <p key={failure.id} className={css.help}>{failure.name}: {failure.message}</p>)}
      {(error || state.error) && <div className={css.error} role="alert">{error ?? state.error}<button type="button" onClick={() => retrySelection ? void submit(retrySelection) : load()} disabled={busy}>{t('retry')}</button></div>}
      {(state.status === 'loading' || busy) && <div role="status" className={css.loading}><LoaderCircle size={15} className={css.spin} />{t('syncing')}</div>}
    </div>, document.body)}
  </div>
}
