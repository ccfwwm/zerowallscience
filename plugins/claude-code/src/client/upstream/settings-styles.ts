/** Adapted from Norman-else/dsh-claude v0.1.65 (fe00e3af0b1ad03acc977b13b4d4ab805086f6da).
 * Copyright (c) 2026 dsh-claude contributors. MIT; see upstream-LICENSE. */
import type { CSSProperties } from 'react'
export const settingsPage: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  width: '100%',
  maxWidth: 820,
  paddingBottom: 28,
}

export const settingsHero: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '2px 2px 8px',
}

export const settingsMark: CSSProperties = {
  width: 42,
  height: 42,
  display: 'grid',
  placeItems: 'center',
  flex: 'none',
  borderRadius: 13,
  background: 'var(--dsw-alias-bg-layer-2)',
  color: 'var(--dsw-static-blue-450)',
  fontSize: 18,
  fontWeight: 700,
}

export const settingsHeading: CSSProperties = {
  margin: 0,
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 20,
  lineHeight: '28px',
  fontWeight: 650,
}

export const settingsSectionHeading: CSSProperties = {
  margin: 0,
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 15,
  lineHeight: '22px',
  fontWeight: 650,
}

export const settingsBody: CSSProperties = {
  margin: 0,
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 14,
  lineHeight: '22px',
}

export const settingsCard: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: 18,
  border: '1px solid var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 16%, transparent))',
  borderRadius: 14,
  background: 'var(--dsw-alias-bg-layer-1)',
}

export const settingsCardHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
}

export const diagnosticGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(130px, 0.36fr) minmax(0, 1fr)',
  gap: '10px 18px',
  padding: '14px 0',
  borderTop: '1px solid var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 16%, transparent))',
  borderBottom: '1px solid var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 16%, transparent))',
  fontSize: 13,
}

export const diagnosticLabel: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
}

export const diagnosticValue: CSSProperties = {
  color: 'var(--dsw-alias-label-primary)',
  fontWeight: 500,
  overflowWrap: 'anywhere',
}

export const settingSelect: CSSProperties = {
  position: 'relative',
  minWidth: 0,
}

export const settingTextInput: CSSProperties = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  minHeight: 38,
  padding: '7px 13px',
  border: '1px solid var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 16%, transparent))',
  borderRadius: 10,
  background: 'var(--dsw-alias-bg-layer-2)',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  fontSize: 14,
  lineHeight: '22px',
}

export const settingSelectTriggerClass = 'dshClaudeSettingSelectTrigger'
export const settingSelectChevronClass = 'dshClaudeSettingSelectChevron'

/**
 * The listbox trigger and its chevron, in a stylesheet rather than inline
 * because the states it has to draw cannot be expressed inline.
 *
 * Focus is the reason. An inline style carries no pseudo-class, so the blue
 * ring used to ride on the open state alone: choosing an option closed the
 * menu and took the ring with it while the button kept DOM focus, leaving the
 * UA's own focus ring -- white on a dark theme, drawn outside the radius --
 * as the only indicator. Focus and open are separate states; both draw the
 * ring here, and `outline: none` retires the UA's.
 *
 * The open state reads `aria-expanded` instead of a second class because the
 * attribute is already on the element and already correct. Its value is left
 * unquoted: a valid identifier needs no quotes, and the sheet then survives
 * React's server escaping, which would otherwise write `&quot;` into markup a
 * browser reads as raw text.
 */
export const settingSelectCss = `
.${settingSelectTriggerClass} {
  width: 100%;
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 11px 7px 13px;
  border: 1px solid var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 16%, transparent));
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  text-align: left;
  cursor: pointer;
  transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease;
}
.${settingSelectTriggerClass}:focus-visible,
.${settingSelectTriggerClass}[aria-expanded=true] {
  outline: none;
  border-color: var(--dsw-static-blue-450);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-static-blue-450) 15%, transparent);
}
.${settingSelectTriggerClass}:disabled {
  opacity: .55;
  cursor: default;
}
.${settingSelectChevronClass} {
  flex: none;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  color: var(--dsw-alias-label-tertiary);
  transition: transform 120ms ease;
}
.${settingSelectTriggerClass}[aria-expanded=true] .${settingSelectChevronClass} {
  transform: rotate(180deg);
}
`

export const settingSelectValue: CSSProperties = {
  minWidth: 0,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export const settingSelectMenu: CSSProperties = {
  position: 'absolute',
  zIndex: 20,
  top: 'calc(100% + 6px)',
  left: 0,
  right: 0,
  maxHeight: 240,
  overflowY: 'auto',
  padding: 5,
  border: '1px solid var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 16%, transparent))',
  borderRadius: 11,
  background: 'var(--dsw-alias-bg-layer-1)',
  boxShadow: '0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent), 0 2px 8px color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent)',
}

export const settingSelectOption: CSSProperties = {
  width: '100%',
  minHeight: 34,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 9px',
  border: 'none',
  borderRadius: 7,
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  fontSize: 14,
  lineHeight: '22px',
  textAlign: 'left',
  cursor: 'pointer',
}

export const settingSelectOptionActive: CSSProperties = {
  background: 'var(--dsw-alias-bg-layer-2)',
}

export const settingSelectCheck: CSSProperties = {
  width: 14,
  flex: 'none',
  color: 'var(--dsw-static-blue-450)',
  fontSize: 12,
  fontWeight: 700,
  textAlign: 'center',
}

export const settingHint: CSSProperties = {
  display: 'inline-grid',
  placeItems: 'center',
  width: 14,
  height: 14,
  marginLeft: 6,
  verticalAlign: 'text-top',
  borderRadius: '50%',
  border: '1px solid currentColor',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 9,
  fontWeight: 600,
  lineHeight: 1,
  cursor: 'help',
  userSelect: 'none',
}
