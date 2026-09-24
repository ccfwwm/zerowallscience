import { useEffect, useRef, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '../../lib/typert.remote-client.js'
import type { DataAssetRecord } from '@zerowallscience/research-store/types'
import type { ScientificEngineLaunchResult } from '../shared/types.js'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import { WORKBENCH_LOCALES } from './tool-descriptors.js'
import styles from './engine-settings.module.css'

type Remote = TypertRemoteNamespaceMap['zerowallResearch']

type LaunchKey = keyof typeof WORKBENCH_LOCALES.zh
const copyZh = WORKBENCH_LOCALES.zh as Record<string, string>
const copyEn = WORKBENCH_LOCALES.en as Record<string, string>
const translate = (locale: 'zh' | 'en', key: LaunchKey, params?: Record<string, unknown>): string => {
  let value = (locale === 'en' ? copyEn : copyZh)[key] ?? key
  for (const [name, replacement] of Object.entries(params ?? {})) value = value.replaceAll(`{${name}}`, String(replacement))
  return value
}

const LAUNCH_STATUS: Record<ScientificEngineLaunchResult['status'], LaunchKey> = {
  starting: 'science.engine.launch.starting',
  spawned: 'science.engine.launch.spawned',
  exited: 'science.engine.launch.exited',
  failed: 'science.engine.launch.failed',
  unobserved: 'science.engine.launch.unobserved',
}

/**
 * Native window launcher and launch history.
 *
 * This panel is deliberately NOT a configuration surface any more. It used to
 * carry its own Fiji/napari path inputs and rebuild a `ScientificEngineConfig`
 * from a bare string on every save, which overwrote the scope the settings
 * dialog had chosen with `source: 'user'`, reset `status` to `unknown`, and
 * dropped `javaPath`. Configuration now has exactly one owner,
 * `EngineSettingsDialog`, which renders this panel for the launch controls.
 */
export function NativeEnginePanel({ remote, sessionId, locale = 'zh' }: { remote: Remote; sessionId: string; locale?: 'zh' | 'en' }): JSX.Element {
  const t = (key: LaunchKey, params?: Record<string, unknown>): string => translate(locale, key, params)
  const [assets, setAssets] = useState<DataAssetRecord[]>([])
  const [assetId, setAssetId] = useState('')
  const [launches, setLaunches] = useState<ScientificEngineLaunchResult[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const locked = useRef(false)

  const refresh = async (current: number): Promise<void> => {
    const records = unwrapRemoteResult('listScientificEngineLaunches', await remote.listScientificEngineLaunches({ sessionId }))
    if (current === generation.current) setLaunches(records)
  }
  useEffect(() => {
    const current = ++generation.current
    let timer: ReturnType<typeof setTimeout> | undefined
    setAssets([]); setAssetId(''); setLaunches([]); setMessage(''); setBusy(false); locked.current = false
    const poll = async (): Promise<void> => {
      try { await refresh(current) } catch (error) { if (current === generation.current) setMessage(String(error)) }
      if (current === generation.current) timer = setTimeout(() => void poll(), 4000)
    }
    void remote.scienceViewer({ sessionId, action: 'list' }).then(value => {
      const result = unwrapRemoteResult('scienceViewer', value)
      if (current === generation.current) setAssets(result.assets ?? [])
    }).catch(error => { if (current === generation.current) setMessage(String(error)) })
    void poll()
    return () => { generation.current++; clearTimeout(timer) }
  }, [remote, sessionId])

  const launch = async (engine: 'fiji' | 'napari'): Promise<void> => {
    if (locked.current) return
    locked.current = true; setBusy(true); setMessage('')
    const current = generation.current
    try {
      const result = unwrapRemoteResult('launchScientificEngine', await remote.launchScientificEngine({ sessionId, engine, ...(assetId ? { assetId } : {}) }))
      if (current !== generation.current) return
      setMessage(result.message)
      await refresh(current)
    } catch (error) { if (current === generation.current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { if (current === generation.current) { locked.current = false; setBusy(false) } }
  }

  return <section aria-label={t('science.engine.launch.title')} className={styles.card}>
    <h3 className={styles.sectionTitle}>{t('science.engine.launch.title')}</h3>
    <p className={styles.cardNote}>{t('science.engine.launch.note')}</p>
    <fieldset disabled={busy} className={styles.field}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('science.engine.launch.asset')}</span>
        <select className={styles.input} aria-label={t('science.engine.launch.asset')} value={assetId} onChange={event => setAssetId(event.target.value)}>
          <option value="">{t('science.engine.launch.blank')}</option>
          {assets.filter(asset => asset.location === 'local' && /\.(tiff?|png|jpe?g|bmp)$/iu.test(asset.uri)).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
        </select>
      </label>
    </fieldset>
    <div className={styles.actions}>
      <button type="button" className={styles.button} disabled={busy} onClick={() => void launch('fiji')}>{t('science.engine.launch.fiji')}</button>
      <button type="button" className={styles.button} disabled={busy} onClick={() => void launch('napari')}>{t('science.engine.launch.napari')}</button>
    </div>
    {message && <p className={styles.message} role="status">{message}</p>}
    {launches.length > 0 && <ul aria-label={t('science.engine.launch.history')} className={styles.section}>{launches.map(item => <li key={item.launchId} className={styles.status}>
      <strong>{item.id} · {t(LAUNCH_STATUS[item.status])}</strong> · {item.assetId ? assets.find(asset => asset.id === item.assetId)?.name ?? t('science.engine.launch.registeredAsset') : t('science.engine.launch.blank')}
      <p className={styles.cardNote}>{item.message}</p>
      {item.diagnosticTail && <details><summary>{t('science.engine.launch.log')}</summary><pre className={styles.diagnostic}>{item.diagnosticTail}</pre></details>}
    </li>)}</ul>}
  </section>
}
