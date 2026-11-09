import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EnvironmentTranslate } from './locales.js'
import css from './section.module.css'

export type VariableAction = { kind: 'delete'; name: string } | { kind: 'sync' } | { kind: 'edit'; name: string; value: string }

export function VariableActionDialog({ action, busy, error, t, cancel, confirm }: {
  action: VariableAction; busy: boolean; error: string; t: EnvironmentTranslate
  cancel(): void; confirm(value?: string): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const busyRef = useRef(busy)
  busyRef.current = busy
  const [value, setValue] = useState(action.kind === 'edit' ? action.value : '')
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.showModal()
    if (action.kind !== 'edit') cancelButton.current?.focus()
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault(); event.stopImmediatePropagation()
      if (!busyRef.current) cancel()
    }
    window.addEventListener('keydown', escape, true)
    return () => { window.removeEventListener('keydown', escape, true); previous?.focus() }
  }, [cancel, action.kind])
  const title = t(action.kind === 'sync' ? 'syncConfirmTitle' : action.kind === 'delete' ? 'deleteConfirmTitle' : 'editVariable')
  return createPortal(<dialog ref={dialog} className={css.variableDialog} aria-labelledby="variable-action-title"
    onCancel={event => { event.preventDefault(); if (!busy) cancel() }}>
    <header className={css.variableDialogHeader}><h3 id="variable-action-title">{title}</h3></header>
    <div className={css.actionBody}>
      {action.kind === 'edit' ? <><code>{action.name}</code><label className={css.field}><span>{t('variableValue')}</span><input className={css.control} type="password" autoComplete="off" autoFocus value={value} onChange={event => setValue(event.target.value)} /></label></>
        : <p>{action.kind === 'sync' ? t('syncConfirmBody') : t('deleteConfirmBody', { name: action.name })}</p>}
    </div>
    {error && <p className={css.error} role="alert">{error}</p>}
    <footer className={css.actionFooter}>
      <button ref={cancelButton} className={css.secondaryButton} type="button" disabled={busy} onClick={cancel}>{t('cancel')}</button>
      <button className={action.kind === 'delete' ? css.dangerButton : css.primaryButton} type="button" disabled={busy || (action.kind === 'edit' && !value.trim())} onClick={() => confirm(value)}>{t(action.kind === 'sync' ? 'confirmSync' : action.kind === 'delete' ? 'confirmDelete' : 'saveVariable')}</button>
    </footer>
  </dialog>, document.body)
}
