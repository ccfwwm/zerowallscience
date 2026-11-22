/**
 * Node half of the Session panel plugin. The browser half in `src/client/`
 * owns every contribution; this entry exists so the package appears as an
 * ordinary Loader row.
 * @module @deepseek-ai/dsh-client-ui-session-panel
 */

import Schema from '@deepseek-ai/schemastery'
import type { Volatile } from '@deepseek-ai/cordis'

/** Docking preference used before the reader makes a choice. */
export interface Config {
  /** Whether the panel initially docks when the reader has no saved preference. */
  readonly defaultPinned: Volatile<boolean>
}

/** Initial docking preference synced to the browser. */
export const Config = Schema.object({ defaultPinned: Schema.boolean().default(true).volatile() })

/** Loader-visible no-op body; the browser half carries the feature. */
export function apply(): void {}
