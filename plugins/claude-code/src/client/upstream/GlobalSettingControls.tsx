/** Adapted from Norman-else/dsh-claude v0.1.65 (fe00e3af0b1ad03acc977b13b4d4ab805086f6da).
 * Copyright (c) 2026 dsh-claude contributors. MIT; see upstream-LICENSE. */
import { useEffect, useId, useRef, useState } from 'react'
import type { ClaudeGlobalSetting as GlobalSettingView, ClaudeGlobalSettingOption as GlobalSettingOption } from '../../shared/types.js'
import * as styles from './settings-styles.js'
/** The trigger's disclosure chevron.
 *
 *  Geometry rather than a character: the ink spans y 6 to 10 in a 16-unit box,
 *  so it is centred on the box's own centre and the open state's 180-degree
 *  flip lands exactly where the closed state sat. A text arrowhead carries its
 *  ink below the centre of the em box, which is why this needed a hand-tuned
 *  nudge that could only be right in one of the two states. */
function SelectChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}

interface GlobalSettingSelectProps {
  setting: Extract<GlobalSettingView, { kind: 'select' }>
  label: string
  id?: string
  describedBy?: string
  disabled: boolean
  onChange: (value: string) => void
  /** Display text for one option. Server-discovered names (output styles) are
   *  shown verbatim; a fixed vocabulary the plugin owns is translated. */
  labelFor?: (option: GlobalSettingOption) => string
}

export function GlobalSettingText({ setting, disabled, onChange, label, id, describedBy }: {
  setting: Extract<GlobalSettingView, { kind: 'text' }>
  label: string
  id?: string
  describedBy?: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const [draft, setDraft] = useState(setting.value)
  const skipBlur = useRef(false)
  useEffect(() => { setDraft(setting.value) }, [setting.value])
  const save = (): void => {
    if (draft !== setting.value) onChange(draft)
  }
  return (
    <input
      id={id}
      aria-label={label}
      aria-describedby={describedBy}
      type="text"
      value={draft}
      maxLength={setting.maxLength}
      disabled={disabled}
      style={styles.settingTextInput}
      onChange={event => { setDraft(event.currentTarget.value) }}
      onBlur={() => { if (!skipBlur.current) save(); skipBlur.current = false }}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault()
          skipBlur.current = true
          save()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          skipBlur.current = true
          setDraft(setting.value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function GlobalSettingNumber({ setting, disabled, onChange, label, id, describedBy, invalidMessage, presetLabel, customLabel }: {
  setting: Extract<GlobalSettingView, { kind: 'number' }>
  label: string
  id?: string
  describedBy?: string
  disabled: boolean
  invalidMessage: string
  presetLabel: string
  customLabel: string
  onChange: (value: string) => void
}) {
  const initial = setting.value === 'auto' ? '' : setting.value === '200k' ? '200000' : setting.value === '1m' ? '1000000' : setting.value
  const [draft, setDraft] = useState(initial)
  const [invalid, setInvalid] = useState(false)
  const [custom, setCustom] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const skipBlur = useRef(false)
  useEffect(() => { setDraft(setting.value === 'auto' ? '' : setting.value === '200k' ? '200000' : setting.value === '1m' ? '1000000' : setting.value); setInvalid(false); setCustom(false) }, [setting.value])
  useEffect(() => { if (custom) input.current?.focus() }, [custom])
  const save = (): void => {
    if (draft === '') {
      setInvalid(false)
      if (setting.value !== 'auto') onChange('auto')
      return
    }
    const value = Number(draft)
    if (!Number.isSafeInteger(value) || value < setting.min || value > setting.max) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    if (String(value) !== setting.value) onChange(String(value))
  }
  return (
    <div style={{ display: 'grid', gap: 4, minWidth: 132 }}>
      {setting.presets && <select id={id} aria-label={`${label} ${presetLabel}`} aria-describedby={describedBy} disabled={disabled}
        value={custom || !setting.presets.some(preset => preset.value === setting.value) ? 'custom' : setting.value}
        style={styles.settingTextInput}
        onChange={event => {
          const value = event.currentTarget.value
          if (value === 'custom') { setCustom(true); input.current?.focus(); return }
          setCustom(false)
          setDraft(value === 'auto' ? '' : value)
          setInvalid(false)
          if (value !== setting.value) onChange(value)
        }}>
        {setting.presets.map(preset => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
        <option value="custom">{customLabel}</option>
      </select>}
      {(!setting.presets || custom || !setting.presets.some(preset => preset.value === setting.value)) && <input
        ref={input}
        id={setting.presets ? `${id}-custom` : id}
        aria-label={label}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        type="number"
        inputMode="numeric"
        value={draft}
        min={setting.min}
        max={setting.max}
        step={setting.step}
        placeholder="auto"
        disabled={disabled}
        style={styles.settingTextInput}
        onChange={event => { setDraft(event.currentTarget.value); setInvalid(false) }}
        onBlur={() => { if (!skipBlur.current) save(); skipBlur.current = false }}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            skipBlur.current = true
            save()
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            skipBlur.current = true
            setDraft(setting.value === 'auto' ? '' : setting.value === '200k' ? '200000' : setting.value === '1m' ? '1000000' : setting.value)
            setInvalid(false)
            event.currentTarget.blur()
          }
        }}
      />}
      {invalid && <small role="alert">{invalidMessage}</small>}
    </div>
  )
}

export function GlobalSettingSelect({ setting, disabled, onChange, label, id, describedBy, labelFor = option => option.label }: GlobalSettingSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listboxId = useId()
  const selectedIndex = Math.max(0, setting.options.findIndex(option => option.value === setting.value))
  const selectedOption = setting.options[selectedIndex]

  useEffect(() => { if (disabled) setOpen(false) }, [disabled])

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsidePointer)
    return () => document.removeEventListener('mousedown', closeOnOutsidePointer)
  }, [open])

  const openMenu = (index = selectedIndex): void => {
    setActiveIndex(index)
    setOpen(true)
  }

  const choose = (index: number): void => {
    const option = setting.options[index]
    if (option === undefined) return
    setOpen(false)
    triggerRef.current?.focus()
    if (option.value !== setting.value) onChange(option.value)
  }

  const move = (offset: number): void => {
    const count = setting.options.length
    if (count === 0) return
    setActiveIndex(current => (current + offset + count) % count)
  }

  return (
    <div
      ref={rootRef}
      style={styles.settingSelect}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <style data-dsh-claude-setting-select-styles>{styles.settingSelectCss}</style>
      <button
        id={id}
        aria-label={label}
        aria-describedby={describedBy}
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${listboxId}-${activeIndex}` : undefined}
        disabled={disabled || setting.options.length === 0}
        className={styles.settingSelectTriggerClass}
        onClick={() => { if (open) setOpen(false); else openMenu() }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) openMenu(event.key === 'ArrowDown' ? selectedIndex : Math.max(0, setting.options.length - 1))
            else move(event.key === 'ArrowDown' ? 1 : -1)
          } else if (event.key === 'Home' && open) {
            event.preventDefault()
            setActiveIndex(0)
          } else if (event.key === 'End' && open) {
            event.preventDefault()
            setActiveIndex(Math.max(0, setting.options.length - 1))
          } else if ((event.key === 'Enter' || event.key === ' ') && open) {
            event.preventDefault()
            choose(activeIndex)
          } else if (event.key === 'Escape' && open) {
            event.preventDefault()
            setOpen(false)
          }
        }}
      >
        <span style={styles.settingSelectValue}>{selectedOption === undefined ? setting.value : labelFor(selectedOption)}</span>
        <span aria-hidden="true" className={styles.settingSelectChevronClass}><SelectChevron /></span>
      </button>
      {open ? (
        <div id={listboxId} role="listbox" aria-label={label} aria-activedescendant={`${listboxId}-${activeIndex}`} style={styles.settingSelectMenu}>
          {setting.options.map((option, index) => {
            const selected = option.value === setting.value
            const active = index === activeIndex
            return (
              <button
                id={`${listboxId}-${index}`}
                key={`${option.source}:${option.value}`}
                type="button"
                role="option"
                aria-selected={selected}
                style={{ ...styles.settingSelectOption, ...(active ? styles.settingSelectOptionActive : {}) }}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={event => event.preventDefault()}
                onClick={() => choose(index)}
              >
                <span style={styles.settingSelectCheck} aria-hidden="true">{selected ? '✓' : ''}</span>
                <span>{labelFor(option)}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

