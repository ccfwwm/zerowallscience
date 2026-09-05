import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Cable, Download, Plus, RefreshCw, RotateCw, Save, ServerCog, Trash2, Upload, X } from 'lucide-react'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsLocale, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  ENVIRONMENT_TARGET,
  HTTP_HEADER_TARGET,
  formatLines,
  formatReferences,
  parseLines,
  parseReferences,
} from './mcp-form.js'
import { NS } from '@zerowallscience/plugin-base/client-helpers'
import css from './McpConnectionsButton.module.css'

type McpTransport = 'stdio' | 'streamable-http'
type McpRuntimeState = 'disabled' | 'starting' | 'blocked' | 'active' | 'error'

interface ReconnectPolicy {
  enabled: boolean
  initialDelayMs: number
  maxDelayMs: number
  maxAttempts: number
}

export interface McpServerView {
  id: string
  name: string
  serverName: string
  transport: McpTransport
  enabled: boolean
  command: string
  args: string[]
  cwd: string
  envRefs: Record<string, string>
  url: string
  headerRefs: Record<string, string>
  toolCallTimeoutMs: number
  failOnStartupError: boolean
  reconnect: ReconnectPolicy
  runtimeState: McpRuntimeState
  runtimeError: string
  missingEnvironmentVariables: string[]
  tools: string[]
  createdAt: string
  updatedAt: string
}

export interface McpServerInput {
  name: string
  serverName: string
  transport: McpTransport
  enabled: boolean
  command: string
  args: string[]
  cwd: string
  envRefs: Record<string, string>
  url: string
  headerRefs: Record<string, string>
  toolCallTimeoutMs: number
  failOnStartupError: boolean
  reconnect: ReconnectPolicy
}

interface McpActions {
  listMcpServers: () => Promise<McpServerView[]>
  createMcpServer: (input: McpServerInput) => Promise<McpServerView>
  updateMcpServer: (id: string, input: McpServerInput) => Promise<McpServerView>
  removeMcpServer: (id: string) => Promise<void>
  reloadMcpServer: (id: string) => Promise<McpServerView>
  getSciMasterCredentialStatus: () => Promise<{ configured: boolean }>
  setSciMasterApiKey: (apiKey: string) => Promise<McpServerView | undefined>
  clearSciMasterApiKey: () => Promise<McpServerView | undefined>
  getRdatalinuxCredentialStatus: () => Promise<{ configured: boolean; endpoint: string }>
  setRdatalinuxAuthorization: (value: string) => Promise<McpServerView | undefined>
  clearRdatalinuxAuthorization: () => Promise<McpServerView | undefined>
}

interface Draft {
  name: string
  serverName: string
  transport: McpTransport
  enabled: boolean
  command: string
  args: string
  cwd: string
  envRefs: string
  url: string
  headerRefs: string
  toolCallTimeoutMs: string
  failOnStartupError: boolean
  reconnectEnabled: boolean
  reconnectInitialDelayMs: string
  reconnectMaxDelayMs: string
  reconnectMaxAttempts: string
}

type Props = Partial<SidebarFooterActionOwnerProps> & McpActions & PropsLocale<typeof NS> & { embedded?: boolean }

const NEW_SERVER = '__new__'

export function McpConnectionsButton(props: Props) {
  const { wide = false, embedded = false, listMcpServers, createMcpServer, updateMcpServer, removeMcpServer, reloadMcpServer, getSciMasterCredentialStatus, setSciMasterApiKey, clearSciMasterApiKey, getRdatalinuxCredentialStatus, setRdatalinuxAuthorization, clearRdatalinuxAuthorization } = props
  const [open, setOpen] = useState(embedded)
  const [servers, setServers] = useState<McpServerView[]>([])
  const [selectedId, setSelectedId] = useState(NEW_SERVER)
  const [draft, setDraft] = useState<Draft>(() => emptyDraft())
  const [deleteTarget, setDeleteTarget] = useState<McpServerView>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [environment, setEnvironment] = useState<{ phase: string; environmentVersion?: string; contentRevision?: number; currentSlot?: 'a' | 'b' | 'manual'; updated?: boolean; rollbackAvailable?: boolean; version?: string; progress?: number; message?: string; python?: { ready: boolean; version?: string; sitePackages?: string; message?: string } }>()
  const [sciMasterConfigured, setSciMasterConfigured] = useState(false)
  const [sciMasterKey, setSciMasterKey] = useState('')
  const [sciMasterBusy, setSciMasterBusy] = useState(false)
  const [rdatalinuxConfigured, setRdatalinuxConfigured] = useState(false)
  const [rdatalinuxAuthorization, setRdatalinuxAuthorizationValue] = useState('')
  const [rdatalinuxBusy, setRdatalinuxBusy] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)
  const refreshVersion = useRef(0)
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId

  const selected = useMemo(() => servers.find(server => server.id === selectedId), [servers, selectedId])
  const hasStartingServer = servers.some(server => server.runtimeState === 'starting')

  const refresh = useCallback(async (preferredId?: string) => {
    const version = ++refreshVersion.current
    setError(undefined)
    try {
      const next = await listMcpServers()
      if (version !== refreshVersion.current) return
      setServers(next)
      const id = preferredId ?? selectedIdRef.current
      const current = next.find(server => server.id === id)
      const first = next[0]
      if (current !== undefined) {
        setSelectedId(current.id)
        setDraft(draftFromServer(current))
      } else if (first !== undefined && id !== NEW_SERVER) {
        setSelectedId(first.id)
        setDraft(draftFromServer(first))
      } else {
        setSelectedId(NEW_SERVER)
        setDraft(emptyDraft())
      }
    } catch (reason) {
      if (version === refreshVersion.current) setError(message(reason))
    }
  }, [listMcpServers])

  useEffect(() => {
    if (!open) return
    void refresh()
    void window.zerowallDesktop?.getMcpEnvironmentStatus?.().then(status => {
      setEnvironment(status)
      if (status.phase === 'ready' || status.phase === 'manual') void refresh()
    })
    void getSciMasterCredentialStatus().then(status => setSciMasterConfigured(status.configured)).catch(() => setSciMasterConfigured(false))
    void getRdatalinuxCredentialStatus().then(status => setRdatalinuxConfigured(status.configured)).catch(() => setRdatalinuxConfigured(false))
    return window.zerowallDesktop?.onMcpEnvironmentStatus?.(status => {
      setEnvironment(status)
      if (status.phase === 'ready' || status.phase === 'manual') void refresh()
    })
  }, [getSciMasterCredentialStatus, open, refresh])

  const saveRdatalinuxAuthorization = async () => {
    if (rdatalinuxAuthorization.trim() === '') return
    setRdatalinuxBusy(true); setError(undefined)
    try { await setRdatalinuxAuthorization(rdatalinuxAuthorization); setRdatalinuxAuthorizationValue(''); setRdatalinuxConfigured(true); await refresh() }
    catch (reason) { setError(message(reason)) }
    finally { setRdatalinuxBusy(false) }
  }

  const clearRdatalinux = async () => {
    setRdatalinuxBusy(true); setError(undefined)
    try { await clearRdatalinuxAuthorization(); setRdatalinuxConfigured(false); await refresh() }
    catch (reason) { setError(message(reason)) }
    finally { setRdatalinuxBusy(false) }
  }

  useEffect(() => {
    if (!open || !hasStartingServer) return
    // Only an actual startup needs convergence polling. Stable connections are
    // refreshed by explicit actions or environment-generation events.
    const timer = window.setInterval(() => { void refresh() }, 10_000)
    return () => window.clearInterval(timer)
  }, [hasStartingServer, open, refresh])

  const saveSciMasterKey = async () => {
    if (sciMasterKey.trim() === '') return
    setSciMasterBusy(true)
    setError(undefined)
    try {
      await setSciMasterApiKey(sciMasterKey)
      setSciMasterKey('')
      setSciMasterConfigured(true)
      await refresh()
    } catch (reason) {
      setError(message(reason))
    } finally {
      setSciMasterBusy(false)
    }
  }

  const clearSciMaster = async () => {
    setSciMasterBusy(true)
    setError(undefined)
    try {
      await clearSciMasterApiKey()
      setSciMasterConfigured(false)
      await refresh()
    } catch (reason) {
      setError(message(reason))
    } finally {
      setSciMasterBusy(false)
    }
  }

  const retryEnvironment = async () => {
    const next = await window.zerowallDesktop?.retryMcpEnvironment?.()
    if (next !== undefined) setEnvironment(next)
    await refresh()
  }

  const selectEnvironment = async () => {
    const next = await window.zerowallDesktop?.selectMcpEnvironment?.()
    if (next !== undefined) setEnvironment(next)
    await refresh()
  }

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (deleteTarget !== undefined) setDeleteTarget(undefined)
      else if (!embedded) setOpen(false)
      else return
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => window.removeEventListener('keydown', closeOnEscape, true)
  }, [deleteTarget, embedded, open])

  const choose = (server: McpServerView) => {
    setSelectedId(server.id)
    setDraft(draftFromServer(server))
    setError(undefined)
  }

  const chooseNew = () => {
    setSelectedId(NEW_SERVER)
    setDraft(emptyDraft())
    setError(undefined)
  }

  const save = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const input = inputFromDraft(draft, props.t)
      const saved = selectedId === NEW_SERVER
        ? await createMcpServer(input)
        : await updateMcpServer(selectedId, input)
      await refresh(saved.id)
    } catch (reason) {
      setError(message(reason))
      setBusy(false)
    }
  }

  const reload = async () => {
    if (selected === undefined) return
    setBusy(true)
    setError(undefined)
    try {
      const reloaded = await reloadMcpServer(selected.id)
      await refresh(reloaded.id)
    } catch (reason) {
      setError(message(reason))
      setBusy(false)
    }
  }

  const remove = async () => {
    if (deleteTarget === undefined) return
    setBusy(true)
    setError(undefined)
    try {
      await removeMcpServer(deleteTarget.id)
      setDeleteTarget(undefined)
      setSelectedId(NEW_SERVER)
      await refresh(NEW_SERVER)
    } catch (reason) {
      setError(message(reason))
      setDeleteTarget(undefined)
      setBusy(false)
    }
  }

  const exportJson = () => {
    const blob = new Blob([serializeMcpServers(servers)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'zerowall-mcp-connections.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importJson = async (file: File | undefined) => {
    if (file === undefined) return
    setBusy(true)
    setError(undefined)
    try {
      const imported = parseMcpServers(await file.text())
      for (const input of imported) {
        const existing = servers.find(server => server.serverName === input.serverName)
        if (existing === undefined) await createMcpServer(input)
        else await updateMcpServer(existing.id, input)
      }
      await refresh()
    } catch (reason) {
      setError(message(reason))
      setBusy(false)
    } finally {
      if (importInput.current) importInput.current.value = ''
    }
  }

  const manager = <>
    <section className={embedded ? css.embeddedPanel : css.panel} {...embedded ? {} : { role: 'dialog', 'aria-modal': true }} aria-labelledby="zerowall-mcp-title">
      <header className={css.header}>
        <div><p>ZeroWall Science</p><h2 id="zerowall-mcp-title">{props.t('mcp.title')}</h2></div>
        <div className={css.headerActions}>
          <input ref={importInput} className={css.hiddenInput} type="file" accept="application/json,.json" onChange={event => void importJson(event.target.files?.[0])} />
          <button className={css.actionButton} type="button" onClick={() => importInput.current?.click()} disabled={busy} title={props.t('mcp.import')}><Upload size={15} />{props.t('mcp.import')}</button>
          <button className={css.actionButton} type="button" onClick={exportJson} disabled={busy || servers.length === 0} title={props.t('mcp.export')}><Download size={15} />{props.t('mcp.export')}</button>
          <button className={css.iconButton} type="button" onClick={() => void refresh()} disabled={busy} title={props.t('common.refresh')} aria-label={props.t('mcp.refreshConnections')}><RefreshCw size={17} /></button>
          {!embedded && <button className={css.iconButton} type="button" onClick={() => setOpen(false)} title={props.t('common.close')} aria-label={props.t('common.close')}><X size={18} /></button>}
        </div>
      </header>
      {environment !== undefined && environment.phase !== 'idle' && <div className={environment.phase === 'failed' ? css.error : css.warning} role="status">
        <strong>{props.t('mcp.environment')}: </strong>{environment.phase === 'checking' ? props.t('mcp.environmentChecking') : environment.phase === 'ready' || environment.phase === 'manual' ? (environment.environmentVersion === undefined ? environment.phase : props.t('mcp.environmentVersion', { version: environment.environmentVersion, revision: environment.contentRevision ?? 1 })) : environment.message ?? environment.phase}{typeof environment.progress === 'number' && environment.phase !== 'ready' && environment.phase !== 'manual' ? ` ${Math.round(environment.progress)}%` : ''}
        {environment.updated === true && <span className={css.syncBadge}>{props.t('mcp.environmentUpdated')}</span>}
        {environment.python !== undefined && <div>{props.t('mcp.pythonEnvironment')}: {environment.python.ready ? `ready${environment.python.version === undefined ? '' : ` (${environment.python.version})`}` : environment.python.message ?? 'unavailable'}</div>}
        {(environment.phase === 'failed' || environment.phase === 'unavailable') && <><button type="button" onClick={() => void retryEnvironment()}>{props.t('mcp.environmentRetry')}</button><button type="button" onClick={() => void selectEnvironment()}>{props.t('mcp.environmentManual')}</button></>}
      </div>}
      <div className={css.workspace}>
        <aside className={css.sidebar}>
          <button className={`${css.serverRow} ${selectedId === NEW_SERVER ? css.selected : ''}`} type="button" onClick={chooseNew}>
            <span className={css.serverIcon}><Plus size={16} /></span><span><strong>{props.t('mcp.new')}</strong><small>{props.t('mcp.transportHint')}</small></span>
          </button>
          {servers.map(server => <button className={`${css.serverRow} ${selectedId === server.id ? css.selected : ''}`} type="button" key={server.id} onClick={() => choose(server)}>
            <span className={css.serverIcon}><ServerCog size={16} /></span>
            <span><strong>{server.name}</strong><small>{server.serverName}</small></span>
            <span className={`${css.statusDot} ${css[server.runtimeState]}`} title={statusText(server.runtimeState, props.t)} aria-label={statusText(server.runtimeState, props.t)} />
          </button>)}
          {servers.length === 0 && <div className={css.emptyState}><Cable size={22} /><strong>{props.t('mcp.emptyTitle')}</strong><span>{props.t('mcp.emptyDescription')}</span></div>}
        </aside>
        <main className={css.editor}>
          <div className={css.editorHeading}>
            <div><h3>{selected === undefined ? props.t('mcp.newTitle') : selected.name}</h3>{selected !== undefined && <p>{statusText(selected.runtimeState, props.t)}</p>}</div>
            <div className={css.editorActions}>
              {selected !== undefined && <button className={css.iconButton} type="button" onClick={() => void reload()} disabled={busy || !selected.enabled} title={props.t('mcp.reload')} aria-label={props.t('mcp.reload')}><RotateCw size={17} /></button>}
              {selected !== undefined && <button className={`${css.iconButton} ${css.dangerIcon}`} type="button" onClick={() => setDeleteTarget(selected)} disabled={busy} title={props.t('common.delete')} aria-label={props.t('mcp.deleteConnection')}><Trash2 size={17} /></button>}
            </div>
          </div>
          {selected?.runtimeError && <p className={css.error} role="alert">{selected.runtimeError}</p>}
          {(selected?.missingEnvironmentVariables.length ?? 0) > 0 && <p className={css.warning}>{props.t('mcp.missing', { names: selected?.missingEnvironmentVariables.join(', ') ?? '' })}</p>}
          {error && <p className={css.error} role="alert">{error}</p>}
          {selected !== undefined && <section className={css.toolsCard} aria-label={props.t('mcp.availableTools')}>
            <div className={css.toolsHeading}><strong>{props.t('mcp.availableTools')}</strong><span>{selected.tools.length}</span></div>
            {selected.tools.length === 0
              ? <p>{selected.runtimeState === 'active' ? props.t('mcp.noTools') : props.t('mcp.toolsUnavailable')}</p>
              : <div className={css.toolList}>{selected.tools.map(tool => <code key={tool}>{tool}</code>)}</div>}
          </section>}
          {selected?.serverName === 'zerowall_managed_scimaster' && <section className={css.sciMasterCard} aria-label={props.t('mcp.sciMasterSettings')}>
            <div className={css.sciMasterHeading}><strong>{props.t('mcp.sciMasterApiKey')}</strong><span className={sciMasterConfigured ? css.configured : css.missing}>{sciMasterConfigured ? props.t('mcp.sciMasterConfigured') : props.t('mcp.sciMasterMissing')}</span></div>
            <p className={css.sciMasterHelp}>{props.t('mcp.sciMasterApiKeyHelp')}</p>
            <div className={css.sciMasterActions}>
              <input type="password" value={sciMasterKey} onChange={event => setSciMasterKey(event.target.value)} placeholder={props.t('mcp.sciMasterApiKeyPlaceholder')} autoComplete="off" />
              <button type="button" className={css.saveButton} onClick={() => void saveSciMasterKey()} disabled={sciMasterBusy || sciMasterKey.trim() === ''}>{props.t('mcp.sciMasterSave')}</button>
              {sciMasterConfigured && <button type="button" onClick={() => void clearSciMaster()} disabled={sciMasterBusy}>{props.t('mcp.sciMasterClear')}</button>}
            </div>
            <a className={css.sciMasterGuide} href="https://scimaster.bohrium.com/vibe-write/home" target="_blank" rel="noreferrer">{props.t('mcp.sciMasterApiKeyGuide')}</a>
          </section>}
          {selected?.serverName === 'rmcp' && <section className={css.sciMasterCard} aria-label="rdatalinux MCP">
             <div className={css.sciMasterHeading}><strong>rmcp · rbioagent / rplatform / rplotfigure</strong><span className={rdatalinuxConfigured ? css.configured : css.missing}>{rdatalinuxConfigured ? '已配置' : '未配置'}</span></div>
             <p className={css.sciMasterHelp}>端点固定为 http://103.217.185.141:8099/r-platform/mcp。R 与 Biomni 共用 MCP Authorization，凭据仅保存到 ZeroWall 凭据保险库。</p>
             <div className={css.sciMasterActions}>
               <input type="password" value={rdatalinuxAuthorization} onChange={event => setRdatalinuxAuthorizationValue(event.target.value)} placeholder="Bearer &lt;MCP key&gt;" autoComplete="off" />
               <button type="button" className={css.saveButton} onClick={() => void saveRdatalinuxAuthorization()} disabled={rdatalinuxBusy || rdatalinuxAuthorization.trim() === ''}>保存</button>
               {rdatalinuxConfigured && <button type="button" onClick={() => void clearRdatalinux()} disabled={rdatalinuxBusy}>清除</button>}
             </div>
          </section>}
          <div className={css.form}>
            <div className={css.twoColumns}>
              <Field label={props.t('common.name')}><input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Literature tools" /></Field>
              <Field label={props.t('mcp.namespace')}><input value={draft.serverName} onChange={event => setDraft({ ...draft, serverName: event.target.value })} placeholder="literature" /></Field>
            </div>
            <div className={css.settingRow}>
              <div className={css.segmented} aria-label={props.t('mcp.transport')}>
                <button type="button" className={draft.transport === 'stdio' ? css.segmentActive : ''} onClick={() => setDraft({ ...draft, transport: 'stdio' })}>stdio</button>
                <button type="button" className={draft.transport === 'streamable-http' ? css.segmentActive : ''} onClick={() => setDraft({ ...draft, transport: 'streamable-http' })}>HTTP</button>
              </div>
              <Toggle checked={draft.enabled} onChange={checked => setDraft({ ...draft, enabled: checked })} label={props.t('mcp.enabled')} />
            </div>
            {draft.transport === 'stdio' ? <>
              <Field label={props.t('mcp.command')}><input value={draft.command} onChange={event => setDraft({ ...draft, command: event.target.value })} placeholder="npx" /></Field>
              <Field label={props.t('mcp.arguments')}><textarea rows={3} value={draft.args} onChange={event => setDraft({ ...draft, args: event.target.value })} placeholder={'-y\n@modelcontextprotocol/server-filesystem\nC:\\science'} /></Field>
              <Field label={props.t('mcp.workingDirectory')}><input value={draft.cwd} onChange={event => setDraft({ ...draft, cwd: event.target.value })} placeholder="C:\\science" /></Field>
              <Field label={props.t('mcp.environmentReferences')}><textarea rows={3} value={draft.envRefs} onChange={event => setDraft({ ...draft, envRefs: event.target.value })} placeholder="API_TOKEN=ZEROWALL_MCP_TOKEN" /></Field>
            </> : <>
              <Field label="URL"><input value={draft.url} onChange={event => setDraft({ ...draft, url: event.target.value })} placeholder="https://mcp.example.com/api" /></Field>
              <Field label={props.t('mcp.headerReferences')}><textarea rows={3} value={draft.headerRefs} onChange={event => setDraft({ ...draft, headerRefs: event.target.value })} placeholder="Authorization=ZEROWALL_MCP_AUTHORIZATION" /></Field>
            </>}
            <div className={css.threeColumns}>
              <Field label={props.t('mcp.toolTimeout')}><input type="number" min="1" step="1000" value={draft.toolCallTimeoutMs} onChange={event => setDraft({ ...draft, toolCallTimeoutMs: event.target.value })} /></Field>
              <Field label={props.t('mcp.initialRetry')}><input type="number" min="1" value={draft.reconnectInitialDelayMs} onChange={event => setDraft({ ...draft, reconnectInitialDelayMs: event.target.value })} /></Field>
              <Field label={props.t('mcp.maximumRetry')}><input type="number" min="1" value={draft.reconnectMaxDelayMs} onChange={event => setDraft({ ...draft, reconnectMaxDelayMs: event.target.value })} /></Field>
            </div>
            <div className={css.settingRow}>
              <Toggle checked={draft.reconnectEnabled} onChange={checked => setDraft({ ...draft, reconnectEnabled: checked })} label={props.t('mcp.reconnect')} />
              <Field label={props.t('mcp.attempts')}><input className={css.shortInput} type="number" min="1" value={draft.reconnectMaxAttempts} onChange={event => setDraft({ ...draft, reconnectMaxAttempts: event.target.value })} /></Field>
              <Toggle checked={draft.failOnStartupError} onChange={checked => setDraft({ ...draft, failOnStartupError: checked })} label={props.t('mcp.strictStartup')} />
            </div>
          </div>
          <footer className={css.footer}>
            <button className={css.saveButton} type="button" onClick={() => void save()} disabled={busy}><Save size={17} /><span>{selected === undefined ? props.t('common.create') : props.t('common.save')}</span></button>
          </footer>
        </main>
      </div>
    </section>
    {deleteTarget !== undefined && <div className={css.confirmBackdrop} role="presentation">
      <section className={css.confirm} role="alertdialog" aria-modal="true" aria-labelledby="zerowall-mcp-delete-title">
        <h3 id="zerowall-mcp-delete-title">{props.t('mcp.deleteTitle', { name: deleteTarget.name })}</h3>
        <p>{props.t('mcp.deleteDescription')}</p>
        <div><button type="button" onClick={() => setDeleteTarget(undefined)}>{props.t('common.cancel')}</button><button className={css.deleteButton} type="button" onClick={() => void remove()} disabled={busy}>{props.t('common.delete')}</button></div>
      </section>
    </div>}
  </>

  if (embedded) return manager

  return <>
    <button className={css.trigger} type="button" onClick={() => setOpen(true)} title={props.t('mcp.trigger')} aria-label={props.t('mcp.trigger')}>
      <Cable size={18} aria-hidden="true" />
      {wide && <span>MCP</span>}
    </button>
    {open && createPortal(<div className={css.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>{manager}</div>, document.body)}
  </>
}

function Field({ label, children }: { label: string, children: React.ReactNode }) {
  return <label className={css.field}><span>{label}</span>{children}</label>
}

function Toggle({ checked, onChange, label }: { checked: boolean, onChange: (checked: boolean) => void, label: string }) {
  return <label className={css.toggle}><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><span aria-hidden="true" /><strong>{label}</strong></label>
}

function emptyDraft(): Draft {
  return {
    name: '', serverName: '', transport: 'stdio', enabled: false, command: '', args: '', cwd: '', envRefs: '', url: '', headerRefs: '',
    toolCallTimeoutMs: '60000', failOnStartupError: false, reconnectEnabled: true,
    reconnectInitialDelayMs: '500', reconnectMaxDelayMs: '30000', reconnectMaxAttempts: '10',
  }
}

function draftFromServer(server: McpServerView): Draft {
  return {
    name: server.name,
    serverName: server.serverName,
    transport: server.transport,
    enabled: server.enabled,
    command: server.command,
    args: formatLines(server.args),
    cwd: server.cwd,
    envRefs: formatReferences(server.envRefs),
    url: server.url,
    headerRefs: formatReferences(server.headerRefs),
    toolCallTimeoutMs: String(server.toolCallTimeoutMs),
    failOnStartupError: server.failOnStartupError,
    reconnectEnabled: server.reconnect.enabled,
    reconnectInitialDelayMs: String(server.reconnect.initialDelayMs),
    reconnectMaxDelayMs: String(server.reconnect.maxDelayMs),
    reconnectMaxAttempts: String(server.reconnect.maxAttempts),
  }
}

function inputFromDraft(draft: Draft, t: TranslateNS<typeof NS>): McpServerInput {
  const positive = (value: string, label: string) => {
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(t('mcp.positiveInteger', { label }))
    return parsed
  }
  return {
    name: draft.name,
    serverName: draft.serverName,
    transport: draft.transport,
    enabled: draft.enabled,
    command: draft.transport === 'stdio' ? draft.command : '',
    args: draft.transport === 'stdio' ? parseLines(draft.args) : [],
    cwd: draft.transport === 'stdio' ? draft.cwd : '',
    envRefs: draft.transport === 'stdio' ? parseReferences(draft.envRefs, t('mcp.environmentReferences'), ENVIRONMENT_TARGET) : {},
    url: draft.transport === 'streamable-http' ? draft.url : '',
    headerRefs: draft.transport === 'streamable-http' ? parseReferences(draft.headerRefs, t('mcp.headerReferences'), HTTP_HEADER_TARGET) : {},
    toolCallTimeoutMs: positive(draft.toolCallTimeoutMs, t('mcp.toolTimeout')),
    failOnStartupError: draft.failOnStartupError,
    reconnect: {
      enabled: draft.reconnectEnabled,
      initialDelayMs: positive(draft.reconnectInitialDelayMs, t('mcp.initialRetry')),
      maxDelayMs: positive(draft.reconnectMaxDelayMs, t('mcp.maximumRetry')),
      maxAttempts: positive(draft.reconnectMaxAttempts, t('mcp.attempts')),
    },
  }
}

function statusText(status: McpRuntimeState, t: TranslateNS<typeof NS>): string {
  return ({ active: t('mcp.status.active'), starting: t('mcp.status.starting'), blocked: t('mcp.status.blocked'), error: t('mcp.status.error'), disabled: t('mcp.status.disabled') })[status]
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export function serializeMcpServers(servers: McpServerView[]): string {
  return JSON.stringify({ format: 'zerowall-mcp-connections', version: 1, servers: servers.map(inputFromServer) }, null, 2)
}

export function parseMcpServers(raw: string): McpServerInput[] {
  const parsed = JSON.parse(raw) as unknown
  const values = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.servers) ? parsed.servers : undefined
  if (values === undefined) throw new Error('MCP JSON must contain a servers array.')
  return values.map((value, index) => validateImportedServer(value, index))
}

function inputFromServer(server: McpServerView): McpServerInput {
  const { name, serverName, transport, enabled, command, args, cwd, envRefs, url, headerRefs, toolCallTimeoutMs, failOnStartupError, reconnect } = server
  return { name, serverName, transport, enabled, command, args, cwd, envRefs, url, headerRefs, toolCallTimeoutMs, failOnStartupError, reconnect }
}

function validateImportedServer(value: unknown, index: number): McpServerInput {
  if (!isRecord(value)) throw new Error(`MCP entry ${index + 1} is invalid.`)
  const transport = value.transport
  if (transport !== 'stdio' && transport !== 'streamable-http') throw new Error(`MCP entry ${index + 1} has an invalid transport.`)
  const reconnect = isRecord(value.reconnect) ? value.reconnect : {}
  const stringRecord = (candidate: unknown) => isRecord(candidate) ? Object.fromEntries(Object.entries(candidate).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {}
  const integer = (candidate: unknown, fallback: number) => Number.isSafeInteger(candidate) && Number(candidate) > 0 ? Number(candidate) : fallback
  return {
    name: String(value.name ?? '').trim(), serverName: String(value.serverName ?? '').trim(), transport,
    enabled: value.enabled === true, command: String(value.command ?? ''), args: Array.isArray(value.args) ? value.args.filter((item): item is string => typeof item === 'string') : [],
    cwd: String(value.cwd ?? ''), envRefs: stringRecord(value.envRefs), url: String(value.url ?? ''), headerRefs: stringRecord(value.headerRefs),
    toolCallTimeoutMs: integer(value.toolCallTimeoutMs, 60000), failOnStartupError: value.failOnStartupError === true,
    reconnect: { enabled: reconnect.enabled !== false, initialDelayMs: integer(reconnect.initialDelayMs, 500), maxDelayMs: integer(reconnect.maxDelayMs, 30000), maxAttempts: integer(reconnect.maxAttempts, 10) },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
