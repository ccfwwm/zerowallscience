import { readFileSync } from 'node:fs'

export const pinnedDsh = Object.freeze(JSON.parse(readFileSync(new URL('../../config/deepseek-harness/upstream.json', import.meta.url), 'utf8')))

/** The configured source pin and the adapter's structural anchors must both match. */
export function assertPinnedDsh(version, feature) {
  if (version !== pinnedDsh.version || pinnedDsh.tag !== `dsh-v${version}` || !/^[a-f0-9]{40}$/u.test(pinnedDsh.commit ?? '')) {
    throw new Error(`Review ${feature}: expected configured DSH ${pinnedDsh.version}, received ${version}.`)
  }
}
