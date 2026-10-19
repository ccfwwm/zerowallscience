import { readFileSync } from 'node:fs'

const dreamSkinPin = JSON.parse(readFileSync(new URL('../../config/integrations/upstream-sources.json', import.meta.url), 'utf8')).dreamSkin

/** Keep the adapted resource identity in configuration, independent of pnpm's source patch. */
export function adaptDreamSkinManifest(source) {
  const manifest = JSON.parse(source)
  const version = dreamSkinPin.resourceVersion ?? dreamSkinPin.version
  if (manifest.name !== 'dsh-dream-skin' || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/u.test(version ?? '')) {
    throw new Error('Invalid configured Dream Skin resource identity')
  }
  manifest.version = version
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/** DSH 0.2.1 owns authority checks and browser credentials in Connection. */
export function adaptDreamSkinHost(source) {
  const oldInject = 'export const inject = ["webServer", "webRuntime"];'
  const newInject = 'export const inject = ["webServer", "connection"];'
  const oldFence = 'if (!isTrustedApiRequest(req, ctx.webRuntime.trustedHosts)) {\n\t\t\t\twriteJson(res, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } });'
  const newFence = 'const rejection = ctx.connection.requestRejection(req);\n\t\t\tif (rejection !== undefined) {\n\t\t\t\twriteJson(res, rejection, { ok: false, error: { code: "forbidden", message: "forbidden" } });'
  const normalized = source.replace(/\r\n/gu, '\n')
  if (normalized.includes(newInject) && normalized.includes(newFence)) return normalized
  if (!normalized.includes(oldInject) || !normalized.includes(oldFence)) throw new Error('Pinned Dream Skin host changed; review Connection adapter')
  return normalized.replace(oldInject, newInject).replace(oldFence, newFence)
}

/** Seed readable ZeroWall first-run surfaces without rewriting user choices. */
export function adaptDreamSkinClient(source) {
  // pnpm applies the checked-in 10.9.3 patch before this runtime copy. Accept
  // both the upstream table and that already-adapted table, while rejecting
  // any future layout change until the appearance adapter is reviewed.
  // The pinned 10.9.3 client derives the seed from the selected factory skin
  // table. Older snapshots used the same expression with a named fallback;
  // both forms need the ZeroWall first-run values to be opaque. Keep the
  // match narrow so a future upstream refactor fails loudly.
  const composer = /\[COMPOSER_OPACITY_KEY\]: String\((?:FACTORY_SKIN_DEFAULTS\.composerOpacity \?\? 1|1)\),/
  const modal = /\[MODAL_OPACITY_KEY\]: String\((?:FACTORY_SKIN_DEFAULTS\.modalOpacity \?\? 1|1)\),/
  if (!composer.test(source) || !modal.test(source)) throw new Error('Pinned Dream Skin factory table changed; review appearance adapter')
  let result = source.replace(composer, '[COMPOSER_OPACITY_KEY]: String(1),')
    .replace(modal, '[MODAL_OPACITY_KEY]: String(1),')
  const locales = [
    ['zh', '外观'], ['en', 'Appearance'], ['ja', '外観'], ['ko', '외관'],
    ['es', 'Apariencia'], ['fr', 'Apparence'], ['de', 'Erscheinungsbild'], ['ru', 'Внешний вид'],
  ]
  for (const [name, label] of locales) {
    const marker = new RegExp(`(const ${name} = \\{\\r?\\n)`)
    const entry = new RegExp(`"section\\.nav": "${label}"`)
    if (!marker.test(result) && !entry.test(result)) throw new Error(`Pinned Dream Skin locale table changed: ${name}`)
    if (marker.test(result) && !entry.test(result)) result = result.replace(marker, (_match, prefix) => `${prefix}\t\t\t"section.nav": "${label}",\n`)
  }
  const staticLabel = 'label: "Theme / 外观"'
  const dynamicLabel = 'label: () => localeT("section.nav")'
  if (!result.includes(staticLabel) && !result.includes(dynamicLabel)) throw new Error('Pinned Dream Skin settings section changed')
  result = result.replace(staticLabel, dynamicLabel)
  const navLabels = 'var NAV_ROW_LABELS = ["外观", "Appearance", "外観", "외관", "Apariencia", "Apparence", "Erscheinungsbild", "Внешний вид"]'
  if (!result.includes(navLabels) && !result.includes('var NAV_ROW_LABEL = "Theme / 外观"')) throw new Error('Pinned Dream Skin navigation adapter changed')
  result = result.replace('var NAV_ROW_LABEL = "Theme / 外观"', navLabels)
  result = result.replace('var mm = label.indexOf(NAV_ROW_LABEL) !== -1', 'var mm = NAV_ROW_LABELS.some(function (item) { return label.indexOf(item) !== -1 })')
  return result
}
