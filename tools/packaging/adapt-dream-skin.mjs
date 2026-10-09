/** Seed readable ZeroWall first-run surfaces without rewriting user choices. */
export function adaptDreamSkinClient(source) {
  // pnpm applies the checked-in 10.9.3 patch before this runtime copy. Accept
  // both the upstream table and that already-adapted table, while rejecting
  // any future layout change until the appearance adapter is reviewed.
  const composer = /(\[COMPOSER_OPACITY_KEY\]: String\(FACTORY_SKIN_DEFAULTS\.composerOpacity \?\? )(0\.4|1)(\),)/
  const modal = /(\[MODAL_OPACITY_KEY\]: String\(FACTORY_SKIN_DEFAULTS\.modalOpacity \?\? )(0\.94|1)(\),)/
  if (!composer.test(source) || !modal.test(source)) throw new Error('Pinned Dream Skin factory table changed; review appearance adapter')
  let result = source.replace(composer, (_match, prefix, _value, suffix) => `${prefix}1${suffix}`)
    .replace(modal, (_match, prefix, _value, suffix) => `${prefix}1${suffix}`)
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
