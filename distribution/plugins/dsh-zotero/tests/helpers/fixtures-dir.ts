/**
 * Access to the JSON fixtures under `tests/fixtures/`.
 *
 * These are whole response bodies captured from a real Zotero build, kept as
 * files because their content is large and not worth restating inline. They
 * are resolved from **this module's** location rather than the calling spec's,
 * so a spec that moves between lanes keeps reading the same files: the paths
 * used to be `new URL('./fixtures/…', import.meta.url)` inside the spec, which
 * broke silently the moment that spec changed directory.
 * @module tests/helpers/fixtures-dir
 */

import { readFileSync } from 'node:fs'

/**
 * One JSON fixture, parsed.
 * @param name - the file name under `tests/fixtures/`, extension included.
 * @returns the parsed content.
 */
export function fixtureJson(name: string): unknown {
  const url = new URL(`../fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8'))
}
