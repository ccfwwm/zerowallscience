import { Children, type ReactNode } from 'react'
import { ArrowLeft, RefreshCw, Send } from 'lucide-react'
import {
  defaultWorkbenchTranslate,
  type WorkbenchDescriptor,
  type WorkbenchTabId,
} from './tool-descriptors.js'
import styles from './workbench-shell.module.css'

/** A tab of the eight-entry screenshot row, in the order the design fixed. */
export type WorkbenchShellTab = { id: WorkbenchTabId; label: string; icon: ReactNode; description?: string; image?: string }
/** A tool past the 更多工具 label; it stays a real tab rather than a menu row. */
export type WorkbenchShellOverflowTab = { id: WorkbenchTabId; label: string }

/**
 * The whole contract with `view.tsx`, which derives its `ShellDescriptor` from
 * `Parameters<typeof WorkbenchShell>[0]`. The props are named explicitly so a
 * rename here is a compile error there instead of a silently blank workbench.
 */
export type WorkbenchShellProps = {
  tabs: readonly WorkbenchShellTab[]
  activeTab: WorkbenchTabId
  onSelectTab: (id: WorkbenchTabId) => void
  descriptor: WorkbenchDescriptor
  /** Destinations only the parent can reach, so they stay callbacks, not state. */
  headerActions: { onEngineSettings: () => void }
  status: { text: string; hint: string }
  composer: {
    value: string
    placeholder: string
    disabled: boolean
    busy: boolean
    onChange: (value: string) => void
    onSubmit: () => void
  }
  /** Card payloads the parent interprets; the shell never decides what an action does. */
  onAction: (kind: 'prompt' | 'action', value: string) => void
  overflow?: readonly WorkbenchShellOverflowTab[]
  children: ReactNode
}

/**
 * Chrome for the science workbench. It owns no session, asset or run state: it
 * paints the copy it is handed and forwards every intent upward, so the
 * workbench keeps exactly one component's worth of behaviour.
 */
export function WorkbenchShell(props: WorkbenchShellProps): JSX.Element {
  const { tabs, activeTab, descriptor, status, composer, onAction } = props
  const t = defaultWorkbenchTranslate
  const overflow = props.overflow ?? []
  // The parent falls back to an empty object when the descriptor table lookup
  // misses, so fields are read defensively instead of assumed present.
  // 主页 hands its whole column to the research pages, which the parent renders
  // through `children`; only the tool tabs need a header of their own.
  const isHome = activeTab === 'home'
  // The slot is chosen by what the parent supplied, never by the active tab, so
  // an opened viewer is never unmounted by a tab switch.
  const hasContent = Children.count(props.children) > 0
  return <div className={styles.shell}>
    <div className={styles.tabRow} role="tablist" aria-label={t('science.shell.tablist')} hidden>
      {tabs.map(tab => <button
        key={tab.id} type="button" role="tab" aria-selected={tab.id === activeTab}
        className={tab.id === activeTab ? styles.tabActive : styles.tab}
        onClick={() => props.onSelectTab(tab.id)}
      ><span className={styles.tabIcon} aria-hidden="true">{tab.icon}</span><span className={styles.tabLabel}>{tab.label}</span></button>)}
      {/* The two tools outside the screenshot row share the same row without a
          更多工具 caption: a collapsed menu would hide them from the keyboard
          and from every role-based reachability check. */}
      {overflow.map(tab => <button
        key={tab.id} type="button" role="tab" aria-selected={tab.id === activeTab}
        className={tab.id === activeTab ? styles.tabActive : styles.tab}
        onClick={() => props.onSelectTab(tab.id)}
      ><span className={styles.tabLabel}>{tab.label}</span></button>)}
    </div>
    <div className={styles.content}>
      <div className={styles.main}>
        {!isHome && <header className={styles.toolHeader}>
          <div className={styles.toolIdentity}>
            <button type="button" className={styles.iconButton} aria-label="返回科研工作台" title="返回科研工作台" onClick={() => props.onSelectTab('home')}><ArrowLeft size={16} /></button>
            <h3 className={styles.toolTitle}>{descriptor.heading}</h3>
          </div>
          <div className={styles.headerActions}>
            <button type="button" aria-label="刷新查看器状态" title="刷新查看器状态" onClick={() => onAction('action', 'refresh')}><RefreshCw size={15} /></button>
          </div>
        </header>}
        {isHome && <section className={styles.toolHome} aria-label="科研工具">
          <div className={styles.toolCardGrid}>
            {tabs.filter(tab => tab.id !== 'home').concat(overflow.map(tab => ({ ...tab, icon: null }))).map(tab => <button key={tab.id} type="button" className={styles.toolCard} onClick={() => props.onSelectTab(tab.id)}>
              <img src={tab.image ?? ''} alt="" className={styles.toolCardImage} />
              <span className={styles.toolCardBody}><strong>{tab.label}</strong><span>{tab.description ?? '打开对应科研文件并查看内容'}</span><span className={styles.toolCardAction}>进入查看器 →</span></span>
            </button>)}
          </div>
        </section>}
        {hasContent && <div className={styles.viewer} hidden={isHome}>{props.children}</div>}
        {!isHome && !hasContent && <div className={styles.empty}>
            <p className={styles.emptyTitle}>{descriptor.emptyTitle}</p>
            <p className={styles.emptyHint}>{descriptor.emptyHint}</p>
          </div>}
        {/* The status strip is the workbench's only live region and the only
            place a host message is painted, so it belongs to every tab
            including 主页 — hiding it there would drop registration errors. */}
        <div className={styles.status} role="status" hidden={!status.text && !status.hint}>
          <span className={styles.statusText}>{status.text}</span>
          <span className={styles.statusHint}>{status.hint}</span>
        </div>
        <div className={styles.composer} hidden>
          <textarea
            className={styles.composerInput}
            aria-label={t('science.shell.composer.label')}
            rows={2}
            value={composer.value}
            placeholder={composer.placeholder}
            disabled={composer.disabled}
            onChange={event => composer.onChange(event.target.value)}
            onKeyDown={event => {
              // Enter sends and Shift+Enter keeps the newline: the composer is
              // one intent line, not a document editor.
              if (event.key !== 'Enter' || event.shiftKey || composer.disabled) return
              event.preventDefault()
              composer.onSubmit()
            }}
          />
          {/* The accessible name stays fixed while a send is in flight; busy is
              not painted here because the parent's status line reports it. */}
          <button
            type="button" className={styles.send}
            aria-label={t('science.shell.composer.send')}
            disabled={composer.disabled}
            onClick={composer.onSubmit}
          ><Send size={18} /></button>
        </div>
      </div>
    </div>
  </div>
}
