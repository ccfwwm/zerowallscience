/** Browser-side adapter for the pinned Univer render machine. */
export async function zwsFitSlideScene(scene) {
  const viewport = scene.getMainViewport() ?? scene.getViewports()[0]
  if (!viewport || !scene.width || !scene.height) throw new Error('Slide render viewport is unavailable')
  const fit = Math.min(1, viewport.width / scene.width, viewport.height / scene.height)
  if (!(fit > 0)) throw new Error('Slide render viewport has no area')
  scene.scale(fit, fit)
  viewport.scrollToViewportPos({ viewportScrollX: 0, viewportScrollY: 0 })
  scene.makeDirty()
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

export function zwsSlideCaptureRectangle(scene, region) {
  const viewport = scene.getMainViewport() ?? scene.getViewports()[0]
  const scroll = viewport.getViewportScrollByScrollXY()
  const start = scene.transform.applyPoint({ x: region.left - scroll.x, y: region.top - scroll.y })
  const end = scene.transform.applyPoint({ x: region.left + region.width - scroll.x, y: region.top + region.height - scroll.y })
  return { left: start.x, top: start.y, width: end.x - start.x, height: end.y - start.y }
}

export function zwsCaptureSlideRegion(scene, region, width, height, selector) {
  const source = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]
  if (!source) throw new Error('Slide render canvas is unavailable')
  const rect = zwsSlideCaptureRectangle(scene, region)
  const bounds = source.getBoundingClientRect()
  if (rect.left < -1 || rect.top < -1 || rect.left + rect.width > bounds.width + 1 || rect.top + rect.height > bounds.height + 1) throw new Error('Slide page falls outside the render viewport')
  const output = document.createElement('canvas')
  output.width = Math.max(1, Math.round(width))
  output.height = Math.max(1, Math.round(height))
  const ctx = output.getContext('2d')
  if (!ctx) throw new Error('Slide render 2D context is unavailable')
  ctx.drawImage(source, rect.left * source.width / bounds.width, rect.top * source.height / bounds.height, rect.width * source.width / bounds.width, rect.height * source.height / bounds.height, 0, 0, output.width, output.height)
  // Native chart/table canvases live in DOM overlays. Composite their actual
  // pixels using the same viewport rectangle as the base slide canvas.
  const crop = { left: bounds.left + rect.left, top: bounds.top + rect.top, right: bounds.left + rect.left + rect.width, bottom: bounds.top + rect.top + rect.height }
  if (selector) for (const canvas of document.querySelectorAll(selector)) {
    const box = canvas.getBoundingClientRect()
    if (canvas === source || !canvas.width || !canvas.height || !box.width || !box.height) continue
    const left = Math.max(box.left, crop.left), top = Math.max(box.top, crop.top)
    const right = Math.min(box.right, crop.right), bottom = Math.min(box.bottom, crop.bottom)
    if (right <= left || bottom <= top) continue
    ctx.drawImage(canvas, (left - box.left) * canvas.width / box.width, (top - box.top) * canvas.height / box.height, (right - left) * canvas.width / box.width, (bottom - top) * canvas.height / box.height, (left - crop.left) * output.width / rect.width, (top - crop.top) * output.height / rect.height, (right - left) * output.width / rect.width, (bottom - top) * output.height / rect.height)
  }
  return { dataUrl: output.toDataURL('image/png'), width: output.width, height: output.height }
}

export function adaptUniverSlideCapture(source) {
  const fitAnchor = 'let s=pNi(e,t.unitId);await WPi(s,t,o);'
  const captureAnchor = 'd=()=>hNi(s,'
  if (source.split(fitAnchor).length !== 2 || source.split(captureAnchor).length !== 2) throw new Error('Univer slide capture adapter no longer matches the pinned render machine')
  return source.replace(fitAnchor, 'let s=pNi(e,t.unitId);await zwsFitSlideScene(s);await WPi(s,t,o);')
    .replace(captureAnchor, 'd=()=>zwsCaptureSlideRegion(s,')
    + '\n' + [zwsFitSlideScene, zwsSlideCaptureRectangle, zwsCaptureSlideRegion].map(fn => fn.toString()).join('\n') + '\n'
}
