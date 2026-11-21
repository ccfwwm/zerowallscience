/** Reference identity and gesture ownership shared by native rows and pointer-driven tabs. */
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { formatFileMention } from '@deepseek-ai/dsh-file-reference/grammar'
import { formatSessionReferenceMention } from '@deepseek-ai/dsh-session-reference/mention'
import { isAbsoluteWorkspacePath, parseFileAddress, relativizeToCwd, resolveWorkspacePath, workspaceTitleOf } from '@deepseek-ai/dsh-util-workspace-path'
import type {
  ReferenceDragService, ReferenceDragSource, ReferenceDropTarget, ReferenceInsert, ReferencePointerDrag,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ReferenceKey } from './locales.ts'

const MIME = 'application/x-dsh-reference'
type Translate = (key: ReferenceKey) => string
interface Gesture {
  readonly source: ReferenceDragSource
  readonly token: string
  consumed: boolean
}

/** One provider lifetime owns all active gestures, registered cards, and browser listeners. */
export class ReferenceDrags implements ReferenceDragService {
  private readonly targets = new Set<ReferenceDropTarget>()
  private active: Gesture | undefined
  private hovered: ReferenceDropTarget | undefined
  private listeners: AbortController | undefined

  /** @param cwd - current workspace of a source or target Session. @param t - provider-owned localized copy. */
  constructor(private readonly cwd: (id: SessionId) => string | undefined, private readonly t: Translate) {}

  private listen(): void {
    if (this.listeners !== undefined) return
    this.listeners = new AbortController()
    const { signal } = this.listeners
    const owned = (event: DragEvent): boolean => this.active !== undefined && event.dataTransfer?.types.includes(MIME) === true
    document.addEventListener('dragover', (event) => {
      if (!owned(event)) return
      const target = this.move(event.clientX, event.clientY)
      if (target === undefined) return
      event.preventDefault()
      event.stopPropagation()
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = this.refusal(target) === undefined ? 'copy' : 'none'
    }, { capture: true, signal })
    document.addEventListener('drop', (event) => {
      if (!owned(event) || event.dataTransfer?.getData(MIME) !== this.active?.token) return
      if (this.at(event.clientX, event.clientY) === undefined) return
      event.preventDefault()
      event.stopPropagation()
      this.drop(event.clientX, event.clientY)
    }, { capture: true, signal })
    document.addEventListener('dragleave', (event) => {
      if (owned(event) && event.relatedTarget === null) this.clearPreview()
    }, { signal })
    window.addEventListener('dragend', () => { this.cancel() }, { signal })
    window.addEventListener('blur', () => { this.cancel() }, { signal })
    window.addEventListener('keydown', (event) => { if (event.key === 'Escape') this.cancel() }, { capture: true, signal })
  }

  /** @param source - source identity. @param transfer - browser payload. @returns gesture-specific end callback. */
  start(source: ReferenceDragSource, transfer: DataTransfer): () => boolean {
    const gesture = this.begin(source)
    transfer.effectAllowed = 'copyMove'
    transfer.setData(MIME, gesture.token)
    return () => {
      if (this.active === gesture) this.cancel()
      return gesture.consumed
    }
  }

  /** @param source - source identity. @returns a layout-owned gesture, inert after cancellation or replacement. */
  pointer(source: ReferenceDragSource): ReferencePointerDrag | undefined {
    if (source.kind === 'file' && parseFileAddress(source.address) === undefined) return undefined
    const gesture = this.begin(source)
    return {
      move: (x, y) => { if (this.active === gesture) this.move(x, y) },
      drop: (x, y) => this.active === gesture && this.drop(x, y),
      cancel: () => { if (this.active === gesture) this.cancel() },
    }
  }

  /** @param target - mounted card and live callbacks. @returns unregister callback. */
  register(target: ReferenceDropTarget): () => void {
    this.targets.add(target)
    this.listen()
    return () => {
      if (this.hovered === target) this.cancel()
      this.targets.delete(target)
      if (this.targets.size === 0) {
        this.cancel()
        this.listeners?.abort()
        this.listeners = undefined
      }
    }
  }

  /** Release all listeners and feedback before the provider unloads. */
  dispose(): void {
    this.cancel()
    this.listeners?.abort()
    this.listeners = undefined
    this.targets.clear()
  }

  private begin(source: ReferenceDragSource): Gesture {
    this.cancel()
    const gesture = { source, token: randomUUID(), consumed: false }
    this.active = gesture
    return gesture
  }

  private at(x: number, y: number): ReferenceDropTarget | undefined {
    const element = document.elementFromPoint(x, y)
    return [...this.targets].find(target => target.element.isConnected
      && element !== null && target.element.contains(element)
      && target.element.closest('[hidden], [inert], [aria-hidden="true"]') === null)
  }

  private move(x: number, y: number): ReferenceDropTarget | undefined {
    const target = this.at(x, y)
    if (target !== this.hovered) this.clearPreview()
    this.hovered = target
    if (target !== undefined) {
      const refusal = this.refusal(target)
      target.preview(refusal ?? this.t(this.active?.source.kind === 'session' ? 'drag.session' : 'drag.file'), refusal !== undefined)
    }
    return target
  }

  private refusal(target: ReferenceDropTarget): string | undefined {
    if (!target.available()) return this.t('drag.blocked')
    if (this.active?.source.kind === 'session' && this.active.source.sessionId === target.sessionId) return this.t('drag.self')
    return undefined
  }

  private reference(source: ReferenceDragSource, target: SessionId): ReferenceInsert | undefined {
    if (source.kind === 'session') {
      const ref = formatSessionReferenceMention({ sessionId: source.sessionId, label: source.label })
      return { source: 'reference', ref, label: source.label, appearance: 'session', clipboardText: ref }
    }
    const address = parseFileAddress(source.address)
    if (address === undefined || address.path === '') return undefined
    const sourceCwd = address.scope === 'session' ? this.cwd(address.sessionId as SessionId) : undefined
    if (!isAbsoluteWorkspacePath(address.path) && sourceCwd === undefined) return undefined
    const path = address.scope === 'absolute' ? address.path : resolveWorkspacePath(sourceCwd, address.path)
    const ref = formatFileMention({ path: relativizeToCwd(path, this.cwd(target)), kind: 'file' }, false)
    if (ref === undefined) return undefined
    return { source: 'reference', ref, label: workspaceTitleOf(path), appearance: 'file', clipboardText: ref }
  }

  private drop(x: number, y: number): boolean {
    const gesture = this.active
    const target = this.at(x, y)
    if (gesture === undefined || target === undefined) { this.cancel(); return false }
    gesture.consumed = true
    const refusal = this.refusal(target)
    const reference = refusal === undefined ? this.reference(gesture.source, target.sessionId) : undefined
    this.cancel()
    if (refusal !== undefined) target.report(refusal)
    else if (reference === undefined || !target.insert(reference, { x, y })) target.report(this.t('drag.failed'))
    return true
  }

  private clearPreview(): void {
    this.hovered?.preview(null, false)
    this.hovered = undefined
  }

  private cancel(): void {
    this.clearPreview()
    this.active = undefined
  }
}
