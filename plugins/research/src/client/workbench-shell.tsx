import { Children, type ReactNode } from 'react'
import { Send } from 'lucide-react'
import {
  defaultWorkbenchTranslate,
  type WorkbenchDescriptor,
  type WorkbenchTabId,
} from './tool-descriptors.js'
import styles from './workbench-shell.module.css'

/** A tab of the eight-entry screenshot row, in the order the design fixed. */
export type WorkbenchShellTab = { id: WorkbenchTabId; label: string; icon: ReactNode }
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
  onPickFile: () => void
  overflow?: readonly WorkbenchShellOverflowTab[]
  children: ReactNode
}

/**
 * Chrome for the science workbench. It owns no session, asset or run state: it
 * paints the copy it is handed and forwards every intent upward, so the
 * workbench keeps exactly one component's worth of behaviour.
 */
export function WorkbenchShell(props: WorkbenchShellProps): JSX.Element {
  const { tabs, activeTab, descriptor, headerActions, status, composer, onAction, onPickFile } = props
  const t = defaultWorkbenchTranslate
  const overflow = props.overflow ?? []
  // The parent falls back to an empty object when the descriptor table lookup
  // misses, so fields are read defensively instead of assumed present.
  const cards = descriptor.cards ?? []
  // 主页 hands its whole column to the research pages, which the parent renders
  // through `children`; only the tool tabs need a header of their own.
  const isHome = activeTab === 'home'
  // The slot is chosen by what the parent supplied, never by the active tab, so
  // an opened viewer is never unmounted by a tab switch.
  const hasContent = Children.count(props.children) > 0
  return <div className={styles.shell}>
    <div className={styles.tabRow} role="tablist" aria-label={t('science.shell.tablist')}>
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
      <aside className={styles.sidebar}>
        <div className={styles.identity}>
          <span className={styles.eyebrow}>{descriptor.eyebrow}</span>
          <h2 className={styles.heading}>{descriptor.heading}</h2>
          <span className={styles.asset}>{descriptor.asset}</span>
        </div>
        <button type="button" className={styles.pickFile} onClick={onPickFile}>{t('science.shell.chooseFile')}</button>
        {/* A card is the only place copy can start a conversation; whether it
            prompts or navigates is the parent's call, so the shell only forwards
            the documented kind/value pair. */}
        <div className={styles.cards}>
          {cards.map(card => <button key={card.key} type="button" className={styles.card} onClick={() => onAction(card.kind, card.value)}>
            <span className={styles.cardLabel}>{card.label}</span>
            <span className={styles.cardHint}>{card.hint}</span>
          </button>)}
        </div>
      </aside>
      <div className={styles.main}>
        {!isHome && <header className={styles.toolHeader}>
          <div className={styles.toolIdentity}>
            <h3 className={styles.toolTitle}>{descriptor.heading}</h3>
            {descriptor.chips ? <span className={styles.chips}>{descriptor.chips}</span> : null}
          </div>
          {/* One action per header: 从对话打开 was a second button that only
              repeated what the sidebar's 选择文件 entry already does. */}
          <div className={styles.headerActions}>
            <button type="button" onClick={headerActions.onEngineSettings}>{t('science.shell.engine')}</button>
          </div>
        </header>}
        {hasContent
          ? <div className={styles.viewer}>{props.children}</div>
          : <div className={styles.empty}>
            <p className={styles.emptyTitle}>{descriptor.emptyTitle}</p>
            <p className={styles.emptyHint}>{descriptor.emptyHint}</p>
          </div>}
        {/* The status strip is the workbench's only live region and the only
            place a host message is painted, so it belongs to every tab
            including 主页 — hiding it there would drop registration errors. */}
        <div className={styles.status} role="status">
          <span className={styles.statusText}>{status.text}</span>
          <span className={styles.statusHint}>{status.hint}</span>
        </div>
        <div className={styles.composer}>
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
