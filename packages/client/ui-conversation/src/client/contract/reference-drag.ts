/** Application-local reference gestures; providers retain identity until the gesture ends. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ReferenceInsert } from './draft-editor.ts'

/** A source identity, independent of its visible title and the target workspace. */
export type ReferenceDragSource =
  | { readonly kind: 'session'; readonly sessionId: SessionId; readonly label: string }
  | { readonly kind: 'file'; readonly address: string }

/** A pointer-driven gesture borrowed by a layout owner. */
export interface ReferencePointerDrag {
  /** @param x - viewport x. @param y - viewport y. */
  move(x: number, y: number): void
  /** @param x - viewport x. @param y - viewport y. @returns true when a composer consumed the release, including refusals. */
  drop(x: number, y: number): boolean
  /** Clear feedback without editing a draft. */
  cancel(): void
}

/** One mounted composer registers its DOM lifetime and live editing guards. */
export interface ReferenceDropTarget {
  readonly element: HTMLElement
  readonly sessionId: SessionId
  /** @returns whether the mounted composer can edit references now. */
  available(): boolean
  /** @param reference - canonical reference. @param point - viewport insertion point. @returns whether the editor accepted it. */
  insert(reference: ReferenceInsert, point: { readonly x: number; readonly y: number }): boolean
  /** @param text - localized invitation or refusal, null to clear. @param blocked - whether the release is refused. */
  preview(text: string | null, blocked: boolean): void
  /** @param text - localized failed-drop report. */
  report(text: string): void
}

/** Provider-owned drag state shared by sidebar sources and mounted composers. */
export interface ReferenceDragService {
  /**
   * Start a native drag whose identity remains local to this application.
   * @param source - source identity.
   * @param transfer - native payload.
   * @returns end callback answering whether a composer consumed this drag.
   */
  start(source: ReferenceDragSource, transfer: DataTransfer): () => boolean
  /**
   * Start a pointer gesture owned by a layout component.
   * @param source - source identity.
   * @returns a gesture, or undefined when no target is registered.
   */
  pointer(source: ReferenceDragSource): ReferencePointerDrag | undefined
  /**
   * Register a composer for its mounted DOM lifetime.
   * @param target - mounted composer.
   * @returns its unregister callback.
   */
  register(target: ReferenceDropTarget): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional provider of application-local file and session reference dragging. */
    referenceDrag: ReferenceDragService
  }
}
