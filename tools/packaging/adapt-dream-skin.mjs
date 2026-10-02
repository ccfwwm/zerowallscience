/** Seed readable ZeroWall first-run surfaces without rewriting user choices. */
export function adaptDreamSkinClient(source) {
  const composer = /\[COMPOSER_OPACITY_KEY\]: "(?:0\.4|1)"/
  const modal = /\[MODAL_OPACITY_KEY\]: "(?:0\.6|1)"/
  if (!composer.test(source) || !modal.test(source)) throw new Error('Pinned Dream Skin factory table changed; review appearance adapter')
  return source.replace(composer, '[COMPOSER_OPACITY_KEY]: "1"').replace(modal, '[MODAL_OPACITY_KEY]: "1"')
}
