/**
 * Shared DOM-face stub for ui-primitives `Tag`. Specs that only need the
 * capsule's children and placement stub this so they do not load the real
 * primitives bundle (katex, shiki).
 * @module tests/client/helpers/tag-stub
 */

import type { ReactNode } from 'react'

/** Props the stub accepts: the subset of `Tag` these specs exercise. */
export interface TagStubProps {
  readonly children?: ReactNode
  readonly className?: string
}

/**
 * Render the Tag stub as a plain span carrying `data-tag`.
 * @param props - children and optional placement class.
 * @returns the stub element.
 */
export function TagStub(props: TagStubProps): ReactNode {
  return (
    <span data-tag className={props.className}>
      {props.children}
    </span>
  )
}
