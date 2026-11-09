/**
 * Framework-free boot page and failure report. It remains available when a
 * client plugin fails because React arrives only with the UI renderer.
 * @module @deepseek-ai/dsh-client-web/src/boot-page
 */
import type { LoaderEntryState } from './loader-status.ts'
import css from './boot-page.module.css'
import { bootLocales } from './boot-locales.ts'

/** Carrier-owned branding available before plugin activation. */
export interface BootPageOptions {
  readonly name: string
  readonly locale: string
  readonly artwork?: string
  readonly logo?: string
}

/** Create a div with one module class and optional text. */
function div(className: string | undefined, text?: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = className ?? ''
  if (text !== undefined) el.textContent = text
  return el
}

/** Kernel-owned page mounted below the application's root element. */
export class BootPage {
  private readonly root: HTMLDivElement
  private readonly card: HTMLDivElement
  private readonly wordmark: HTMLDivElement
  private readonly spinner: HTMLDivElement
  private readonly hint: HTMLDivElement
  private readonly states = new Map<string, LoaderEntryState>()
  private readonly active = new Set<string>()
  private total = 0
  private failure: string | undefined
  private readonly labels: typeof bootLocales.en | typeof bootLocales.zh

  /**
   * Build and attach the boot page.
   * @param container - Application mount point.
   * @param options - Optional carrier branding and initial language.
   */
  constructor(container: HTMLElement, options?: BootPageOptions) {
    this.labels = (options?.locale ?? document.documentElement.lang).startsWith('zh') ? bootLocales.zh : bootLocales.en
    this.root = div(css.boot)
    this.root.dataset.dshBoot = ''
    this.root.setAttribute('role', 'status')
    if (options?.artwork !== undefined) {
      const artwork = document.createElement('img')
      artwork.className = css.artwork ?? ''
      artwork.src = options.artwork
      artwork.alt = ''
      artwork.addEventListener('error', () => { artwork.hidden = true }, { once: true })
      this.root.append(artwork)
    }
    this.card = div(css.card)
    this.wordmark = div(css.identity)
    if (options?.logo !== undefined) {
      const logo = document.createElement('img')
      logo.className = css.logo ?? ''
      logo.src = options.logo
      logo.alt = ''
      logo.addEventListener('error', () => { logo.hidden = true }, { once: true })
      this.wordmark.append(logo)
    }
    this.wordmark.append(div(css.wordmark, options?.name ?? 'HARNESS'), div(css.description, this.labels.description))
    this.spinner = div(css.spinner)
    this.spinner.dataset.dshBootSpinner = ''
    this.hint = div(css.hint, options === undefined ? 'Loading plugins…' : this.labels.loading)
    this.card.append(this.wordmark, this.spinner, this.hint)
    this.root.append(this.card)
    container.append(this.root)
    this.updateProgress()
  }

  /**
   * Set the number of loader entries represented by the progress arc.
   * @param total - Complete boot roster size.
   */
  setTotal(total: number): void {
    this.total = total
    this.updateProgress()
  }

  /**
   * Project one loader entry's fiber state.
   * @param id - Loader entry name.
   * @param state - Projected fiber state.
   */
  setState(id: string, state: LoaderEntryState): void {
    this.states.set(id, state)
    if (state === 'active') this.active.add(id)
    this.updateProgress()
    this.render()
  }

  /**
   * Display the boot failure report.
   * @param message - Failure report text.
   */
  fail(message: string): void {
    this.failure = message
    this.render()
  }

  /** Detach the page before or after the UI renderer takes the mount point. */
  dispose(): void {
    this.root.remove()
  }

  /** Redraw the state-dependent content below the wordmark. */
  private render(): void {
    const failed = [...this.states].filter(([, state]) => state === 'failed').map(([id]) => id)
    if (this.failure === undefined && failed.length === 0) {
      if (this.spinner.parentElement !== this.card) {
        this.card.replaceChildren(this.wordmark, this.spinner, this.hint)
      }
      return
    }
    const report = div(css.failed)
    report.append(div(css.failedTitle, this.labels.failed))
    for (const id of failed) report.append(div(css.failedItem, id))
    if (this.failure !== undefined) report.append(div(css.failedItem, this.failure))
    this.card.replaceChildren(this.wordmark, report)
  }

  /** Grow the rotating arc monotonically as loader entries activate. */
  private updateProgress(): void {
    const ratio = this.total === 0 ? 0 : Math.min(this.active.size / this.total, 1)
    this.spinner.style.setProperty('--dsh-boot-arc', `${String(Math.round(72 + ratio * 216))}deg`)
  }
}
