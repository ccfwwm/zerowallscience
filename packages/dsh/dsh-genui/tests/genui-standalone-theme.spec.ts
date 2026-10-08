import { describe, expect, it } from 'vitest'
import { STANDALONE_THEME_CSS } from '../src/client/artifact/standalone-theme.ts'
import { parseCssVariables, pickTokens } from './helpers/standalone.ts'

describe('standalone theme', () => {
  it('uses DSH light surface, border, and label tokens', () => {
    const light = parseCssVariables(STANDALONE_THEME_CSS, ':root')

    const expectedLight = {
      'color-scheme': 'light',
      '--dsw-static-neutral-bluish-00': 'rgb(255, 255, 255)',
      '--dsw-static-neutral-bluish-1000': 'rgb(15, 17, 21)',
      '--dsw-static-neutral-bluish-700': 'rgb(97, 102, 107)',
      '--dsw-alias-bg-base': 'var(--dsw-static-neutral-bluish-00)',
      '--dsw-alias-bg-layer-1': 'var(--dsw-static-neutral-bluish-00)',
      '--dsw-alias-bg-layer-2': 'var(--dsw-static-neutral-bluish-00)',
      '--dsw-alias-bg-layer-3': 'var(--dsw-static-neutral-bluish-00)',
      '--dsw-alias-border-l1': 'rgba(0, 0, 0, 0.04)',
      '--dsw-alias-border-l2': 'rgba(0, 0, 0, 0.1)',
      '--dsw-alias-label-primary': 'var(--dsw-static-neutral-bluish-1000)',
      '--dsw-alias-label-secondary': 'var(--dsw-static-neutral-bluish-700)',
      '--dsw-alias-label-tertiary': 'var(--dsw-static-neutral-bluish-600)',
      '--dsw-alias-label-caption': 'var(--dsw-static-neutral-bluish-400)',
      '--dsw-alias-markdown-code-block': 'var(--dsw-static-neutral-bluish-50)',
      '--dsw-static-green-400': 'rgb(78, 209, 126)',
      '--dsw-static-green-500': 'rgb(34, 197, 94)',
      '--dsw-static-amber-400': 'rgb(247, 173, 49)',
      '--dsw-static-red-400': 'rgb(242, 90, 90)',
      '--dsw-alias-state-success-secondary': 'var(--dsw-static-green-400)',
      '--dsw-alias-state-success-primary': 'var(--dsw-static-green-500)',
      '--dsw-alias-state-warn-secondary': 'var(--dsw-static-amber-400)',
    }

    expect(pickTokens(light, Object.keys(expectedLight))).toEqual(expectedLight)
  })

  it('uses DSH dark surface, border, and label tokens', () => {
    const dark = parseCssVariables(STANDALONE_THEME_CSS, 'body[data-ds-dark-theme]')

    const expectedDark = {
      'color-scheme': 'dark',
      '--dsw-alias-bg-base': 'var(--dsw-static-neutral-bluish-950)',
      '--dsw-alias-bg-layer-1': 'var(--dsw-static-neutral-bluish-875)',
      '--dsw-alias-bg-layer-2': 'var(--dsw-static-neutral-bluish-850)',
      '--dsw-alias-bg-layer-3': 'var(--dsw-static-neutral-bluish-800)',
      '--dsw-alias-border-l1': 'rgba(255, 255, 255, 0.06)',
      '--dsw-alias-border-l2': 'rgba(255, 255, 255, 0.12)',
      '--dsw-alias-label-primary': 'var(--dsw-static-neutral-bluish-50)',
      '--dsw-alias-label-secondary': 'var(--dsw-static-neutral-bluish-300)',
      '--dsw-alias-label-tertiary': 'var(--dsw-static-neutral-bluish-400)',
      '--dsw-alias-label-caption': 'var(--dsw-static-neutral-bluish-600)',
      '--dsw-alias-markdown-code-block': 'var(--dsw-static-neutral-bluish-900)',
      '--dsw-alias-state-business-primary': 'var(--dsw-static-deepseek-400)',
      '--dsw-alias-state-business-tertiary': 'var(--dsw-static-deepseek-800)',
      '--dsw-alias-state-success-tertiary': 'var(--dsw-static-green-900)',
      '--dsw-alias-state-warn-tertiary': 'var(--dsw-static-amber-900)',
      '--dsw-alias-state-error-primary': 'var(--dsw-static-red-400)',
    }

    expect(pickTokens(dark, Object.keys(expectedDark))).toEqual(expectedDark)
  })

  it('keeps DSH light semantic state aliases', () => {
    const light = parseCssVariables(STANDALONE_THEME_CSS, ':root')

    expect(light['--dsw-static-deepseek-400']).toBe('rgb(122, 170, 255)')
    expect(light['--dsw-alias-state-success-secondary']).toBe('var(--dsw-static-green-400)')
    expect(light['--dsw-alias-state-warn-secondary']).toBe('var(--dsw-static-amber-400)')
  })

  it('keeps DSH dark semantic state aliases', () => {
    const dark = parseCssVariables(STANDALONE_THEME_CSS, 'body[data-ds-dark-theme]')

    expect(dark['--dsw-alias-state-business-primary']).toBe('var(--dsw-static-deepseek-400)')
    expect(dark['--dsw-alias-state-success-tertiary']).toBe('var(--dsw-static-green-900)')
    expect(dark['--dsw-alias-state-warn-tertiary']).toBe('var(--dsw-static-amber-900)')
    expect(dark['--dsw-alias-state-error-primary']).toBe('var(--dsw-static-red-400)')
  })

  it('uses the final declaration when a selector appears again', () => {
    const css = `${STANDALONE_THEME_CSS}\n:root { --dsw-alias-state-success-secondary: var(--dsw-static-red-400); }`
    const light = parseCssVariables(css, ':root')

    expect(light['--dsw-alias-state-success-secondary']).toBe('var(--dsw-static-red-400)')
  })
})
