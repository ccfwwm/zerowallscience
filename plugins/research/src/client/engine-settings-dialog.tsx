import { useEffect, useMemo, useRef, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ScientificEngineConfig, ScientificEngineHealth, ScientificEngineId, ScientificEngineStatus } from '../shared/types.js'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import { WORKBENCH_LOCALES } from './tool-descriptors.js'
import { NativeEnginePanel } from './native-engine-panel.js'
import styles from './engine-settings.module.css'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']

/** Narrowed copy keys this dialog paints; a typo is a compile error. */
type EngineDialogKey = keyof typeof WORKBENCH_LOCALES.zh
const copyZh = WORKBENCH_LOCALES.zh as Record<string, string>
const copyEn = WORKBENCH_LOCALES.en as Record<string, string>
const translate = (locale: 'zh' | 'en', key: EngineDialogKey, params?: Record<string, unknown>): string => {
  let value = (locale === 'en' ? copyEn : copyZh)[key] ?? key
  for (const [name, replacement] of Object.entries(params ?? {})) value = value.replaceAll(`{${name}}`, String(replacement))
  return value
}

/** Managed atlas state as returned by the Host install action. */
interface ManagedAtlasState { status?: string; directory?: string; name?: string; atlasVersion?: string | null; shape?: number[] | null; resolution?: number[] | null; regionCount?: number | null }

type EngineApi = Omit<Remote, 'installBrainAtlas'> & {
  getScientificEngineConfigs?: (input: { sessionId: string }) => Promise<RemoteResult<ScientificEngineConfig[]>>
  setScientificEngineConfig?: (input: { sessionId: string; config: ScientificEngineConfig }) => Promise<RemoteResult<ScientificEngineConfig>>
  resetScientificEngineConfig?: (input: { sessionId: string; engine: ScientificEngineId }) => Promise<RemoteResult<ScientificEngineConfig>>
  probeScientificEngine?: (input: { sessionId: string; engine: ScientificEngineId }) => Promise<RemoteResult<ScientificEngineStatus>>
  installBrainAtlas?: (input: { sessionId: string; atlasDirectory?: string }) => Promise<RemoteResult<{ atlas?: ManagedAtlasState }>>
}

const ALL_IDS: ScientificEngineId[] = ['fiji', 'napari', 'brain-globe', 'he-python', 'he-stardist', 'remote-r']
const LABEL_KEYS: Record<ScientificEngineId, EngineDialogKey> = {
  fiji: 'science.engine.fiji',
  napari: 'science.engine.napari',
  'brain-globe': 'science.engine.brainGlobe',
  'he-python': 'science.engine.hePython',
  'he-stardist': 'science.engine.heStarDist',
  'remote-r': 'science.engine.remoteR',
}

/**
 * Engines the Host can actually resolve into a process.
 *
 * `native-engines.ts` only implements `engineExecutable`/`engineArguments` for
 * fiji and napari, and `environmentConfig` only reads Fiji's native path.
 * Python-backed engines all use the single managed ZeroWall Python runtime;
 * interpreter paths are not editable here.
 */
const CONFIGURABLE: ScientificEngineId[] = ['fiji', 'brain-globe']
const UNIMPLEMENTED: ScientificEngineId[] = ALL_IDS.filter(id => !CONFIGURABLE.includes(id))

type FieldKey = 'installDirectory' | 'executablePath' | 'remoteEndpoint' | 'javaPath'

/** The one field each configurable engine actually reads back on the Host. */
function fieldFor(id: ScientificEngineId): { key: FieldKey; labelKey: EngineDialogKey; placeholderKey: EngineDialogKey } | undefined {
  if (id === 'fiji') return { key: 'installDirectory', labelKey: 'science.engine.field.fijiDirectory', placeholderKey: 'science.engine.placeholder.fijiDirectory' }
  // BrainGlobe and napari use the managed ZeroWall interpreter.
  return undefined
}

function statusText(status: ScientificEngineStatus | undefined, config: ScientificEngineConfig, t: (key: EngineDialogKey) => string): string {
  const health = status?.status ?? config.status
  const healthKey = `science.engine.status.${health}` as EngineDialogKey
  const parts = [t(healthKey), status?.version ?? config.version ?? '', status?.reason ?? '']
  return parts.filter(Boolean).join(' · ')
}

function EngineCard({ config, status, busy, atlas, advanced, onAdvanced, onPatch, onSave, onProbe, onReset, onInstallAtlas, t }: {
  config: ScientificEngineConfig
  status: ScientificEngineStatus | undefined
  busy: boolean
  atlas: ManagedAtlasState | undefined
  advanced: boolean
  onAdvanced: (open: boolean) => void
  onPatch: (patch: { enabled?: boolean } & Partial<Record<FieldKey, string | undefined>>) => void
  onSave: () => void
  onProbe: () => void
  onReset: () => void
  onInstallAtlas: () => void
  t: (key: EngineDialogKey, params?: Record<string, unknown>) => string
}): JSX.Element {
  const field = fieldFor(config.id)
  const value = field ? (config[field.key] ?? '') : ''
  const diagnostic = status?.diagnostic ?? config.diagnostic
  return <article className={styles.card} aria-label={t(LABEL_KEYS[config.id])}>
    <div className={styles.cardHead}>
      <span className={styles.cardTitle}>{t(LABEL_KEYS[config.id])}</span>
      <span className={styles.badge}>{t(`science.engine.source.${config.source}` as EngineDialogKey)}</span>
    </div>
    {field && <label className={styles.field}>
      <span className={styles.fieldLabel}>{t(field.labelKey)}</span>
      <input
        className={styles.input}
        aria-label={t(field.labelKey)}
        placeholder={t(field.placeholderKey)}
        value={value}
        onChange={event => onPatch({ [field.key]: event.target.value } as Partial<Record<FieldKey, string | undefined>>)}
      />
    </label>}
    {config.id === 'brain-globe' && <p className={styles.cardNote}>{t('science.engine.brainGlobe.note')}</p>}
    {config.id === 'fiji' && advanced && <label className={styles.field}>
      <span className={styles.fieldLabel}>{t('science.engine.field.fijiJava')}</span>
      <input
        className={styles.input}
        aria-label={t('science.engine.field.fijiJava')}
        placeholder={t('science.engine.placeholder.fijiJava')}
        value={config.javaPath ?? ''}
        onChange={event => onPatch({ javaPath: event.target.value.trim() ? event.target.value : undefined })}
      />
    </label>}
    <label className={styles.checkboxRow}>
      <input type="checkbox" checked={config.enabled} onChange={event => onPatch({ enabled: event.target.checked })} />
      {t('science.engine.enabled')}
    </label>
    <div className={styles.actions}>
      <button type="button" className={styles.button} disabled={busy} onClick={onSave}>{t('science.engine.save')}</button>
      <button type="button" className={styles.button} disabled={busy} onClick={onProbe}>{t('science.engine.test')}</button>
      <button type="button" className={styles.button} disabled={busy} onClick={onReset}>{t('science.engine.reset')}</button>
      {config.id === 'brain-globe' && <button type="button" className={styles.button} disabled={busy} onClick={onInstallAtlas}>{busy ? t('science.engine.working') : t('science.engine.installAtlas')}</button>}
      {config.id === 'fiji' && <button type="button" className={styles.button} aria-expanded={advanced} onClick={() => onAdvanced(!advanced)}>{t('science.engine.advanced')}</button>}
    </div>
    <small className={styles.status}>{statusText(status, config, t)}{status?.path ? ` · ${status.path}` : ''}</small>
    {config.id === 'brain-globe' && atlas && <small className={styles.status}>{t('science.engine.atlas', {
      name: atlas.name ?? 'allen_mouse_25um',
      status: t(atlas.status === 'installed' ? 'science.engine.atlas.installed' : 'science.engine.atlas.present'),
      version: atlas.atlasVersion ?? t('science.engine.atlas.unknownVersion'),
      directory: atlas.directory ?? t('science.engine.atlas.unknownDirectory'),
    })}</small>}
    {diagnostic && <details><summary>{t('science.engine.diagnostic')}</summary><pre className={styles.diagnostic}>{diagnostic}</pre></details>}
  </article>
}

/**
 * The single authority for native engine configuration, launch and launch
 * history. `native-engine-panel.tsx` no longer edits paths: it used to rebuild
 * a `ScientificEngineConfig` from a bare string, which silently overwrote the
 * stored scope with `user`, reset `status`, and dropped `javaPath`.
 *
 * The dialog renders its own overlay, focus trap, Escape handler and body
 * scroll lock, so `view.tsx` only has to mount `<EngineSettingsDialog />`.
 */
export function EngineSettingsDialog({ remote, sessionId, locale = 'zh', onClose }: { remote: Remote; sessionId: string; locale?: 'zh' | 'en'; onClose?: () => void }): JSX.Element | null {
  const api = remote as EngineApi
  const t = useMemo(() => (key: EngineDialogKey, params?: Record<string, unknown>) => translate(locale, key, params), [locale])
  // `view.tsx` owns the open flag. Until it passes `onClose`, the dialog hides
  // itself instead of leaving an overlay that Escape cannot dismiss.
  const [dismissed, setDismissed] = useState(false)
  const close = useMemo(() => () => { if (onClose) onClose(); else setDismissed(true) }, [onClose])
  const [configs, setConfigs] = useState<ScientificEngineConfig[]>([])
  const [statuses, setStatuses] = useState<Record<string, ScientificEngineStatus>>({})
  const [busy, setBusy] = useState<string>()
  const [atlas, setAtlas] = useState<ManagedAtlasState>()
  const [advanced, setAdvanced] = useState(false)
  const [message, setMessage] = useState('')
  const [configsLoaded, setConfigsLoaded] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async (): Promise<void> => {
      if (!api.getScientificEngineConfigs) { setMessage(t('science.engine.unavailable.configs')); setConfigsLoaded(true); return }
      try {
        setConfigs(unwrapRemoteResult('getScientificEngineConfigs', await api.getScientificEngineConfigs({ sessionId })))
      } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setConfigsLoaded(true) }
    }
    void load()
  }, [sessionId, remote, api, t])

  // Focus trap, Escape-to-close and body scroll lock live here because the
  // overlay is rendered by this component rather than by the workbench shell.
  // `close` is read through a ref so an unmemoised `onClose` from the shell
  // cannot tear the trap down and re-run it on every render.
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = (): HTMLElement[] => Array.from(dialog.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, [href]') ?? []).filter(element => !element.hasAttribute('disabled'))
    focusable()[0]?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.stopPropagation(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      const first = items[0]!
      const last = items[items.length - 1]!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => { document.removeEventListener('keydown', onKeyDown, true); document.body.style.overflow = previous }
  }, [])

  const patch = (id: ScientificEngineId, next: Partial<ScientificEngineConfig>): void => setConfigs(items => items.map(item => item.id === id ? { ...item, ...next, id: item.id } : item))

  const save = async (config: ScientificEngineConfig): Promise<void> => {
    if (!api.setScientificEngineConfig) { setMessage(t('science.engine.unavailable.configs')); return }
    setBusy(config.id); setMessage('')
    try {
      // The Host derives the scope from the session's registered project and
      // keeps project config ahead of the user file, so no scope is sent.
      const result = unwrapRemoteResult('setScientificEngineConfig', await api.setScientificEngineConfig({ sessionId, config }))
      setConfigs(items => items.map(item => item.id === config.id ? result : item))
      setMessage(t('science.engine.saved', { engine: t(LABEL_KEYS[config.id]) }))
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(undefined) }
  }

  const probe = async (config: ScientificEngineConfig): Promise<void> => {
    if (!api.probeScientificEngine) { setMessage(t('science.engine.unavailable.probe')); return }
    setBusy(config.id)
    try {
      const result = unwrapRemoteResult('probeScientificEngine', await api.probeScientificEngine({ sessionId, engine: config.id }))
      setStatuses(items => ({ ...items, [config.id]: result }))
      setMessage(t('science.engine.probed', { engine: t(LABEL_KEYS[config.id]) }))
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(undefined) }
  }

  const installAtlas = async (config: ScientificEngineConfig): Promise<void> => {
    if (!api.installBrainAtlas) { setMessage(t('science.engine.unavailable.atlas')); return }
    setBusy(config.id); setMessage(t('science.engine.atlas.starting'))
    try {
      // No atlasDirectory is sent: the Host picks the managed directory itself,
      // and the previous UI claimed an overlay-free install it never verified.
      const result = unwrapRemoteResult('installBrainAtlas', await api.installBrainAtlas({ sessionId }))
      setAtlas(result.atlas)
      await probe(config)
      setMessage(t('science.engine.atlas.finished', { directory: result.atlas?.directory ?? t('science.engine.atlas.unknownDirectory') }))
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(undefined) }
  }

  const reset = async (config: ScientificEngineConfig): Promise<void> => {
    if (!api.resetScientificEngineConfig) { setMessage(t('science.engine.unavailable.reset')); return }
    setBusy(config.id)
    try {
      const result = unwrapRemoteResult('resetScientificEngineConfig', await api.resetScientificEngineConfig({ sessionId, engine: config.id }))
      setConfigs(items => items.map(item => item.id === config.id ? result : item))
      setMessage(t('science.engine.resetDone', { engine: t(LABEL_KEYS[config.id]) }))
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(undefined) }
  }

  const rows = useMemo(() => CONFIGURABLE.map(id => configs.find(item => item.id === id) ?? ({ id, enabled: true, source: 'default' as const, status: 'unknown' as ScientificEngineHealth })), [configs])

  if (dismissed && !onClose) return null

  return <div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
    <div className={styles.dialog} ref={dialog} role="dialog" aria-modal="true" aria-label={t('science.engine.dialog.title')}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h2 className={styles.title}>{t('science.engine.dialog.title')}</h2>
          <p className={styles.subtitle}>{t('science.engine.dialog.subtitle')}</p>
        </div>
        <button type="button" className={styles.closeButton} onClick={close} aria-label={t('science.engine.close')}>{t('science.engine.close')}</button>
      </header>
      <div className={styles.body}>
        <p className={styles.intro}>{t('science.engine.dialog.intro')}</p>
        {rows.map(config => <EngineCard
          key={config.id}
          config={config}
          status={statuses[config.id]}
          busy={busy === config.id}
          atlas={atlas}
          advanced={advanced}
          onAdvanced={setAdvanced}
          onPatch={next => patch(config.id, next as Partial<ScientificEngineConfig>)}
          onSave={() => void save(config)}
          onProbe={() => void probe(config)}
          onReset={() => void reset(config)}
          onInstallAtlas={() => void installAtlas(config)}
          t={t}
        />)}
        {configsLoaded && <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('science.engine.unimplemented.title')}</h3>
          {UNIMPLEMENTED.map(id => <article key={id} className={`${styles.card} ${styles.cardMuted}`} aria-label={t(LABEL_KEYS[id])}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>{t(LABEL_KEYS[id])}</span>
              <span className={styles.badge}>{t('science.engine.unimplemented.badge')}</span>
            </div>
            <p className={styles.cardNote}>{t('science.engine.unimplemented.note', { engine: t(LABEL_KEYS[id]) })}</p>
            <small className={styles.status}>{statuses[id]?.reason ?? statusText(statuses[id], configs.find(item => item.id === id) ?? ({ id, enabled: true, source: 'default', status: 'unknown' } as ScientificEngineConfig), t)}</small>
          </article>)}
        </section>}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('science.engine.launch.title')}</h3>
          <NativeEnginePanel remote={remote} sessionId={sessionId} locale={locale} />
        </section>
      </div>
      <footer className={styles.footer}>
        <p className={styles.message} role="status" aria-live="polite">{message || t('science.engine.dialog.precedence')}</p>
        <button type="button" className={styles.button} onClick={close}>{t('science.engine.close')}</button>
      </footer>
    </div>
  </div>
}
