/** Adapt the reviewed browser entry without editing the installed upstream. */
export function adaptViewerCore(source) {
  const replacements = [
    ['if (insight) {\n      renderPptxTextFallback(container, insight);',
      'console.warn("ZeroWall PPTX graphical renderer failed:", error);\n    if (insight) {\n      renderPptxTextFallback(container, insight);', 1],
    // Sidebar switches can dispose Leaflet while a zoom transition is queued.
    // Immediate navigation keeps the view usable without post-disposal callbacks.
    ['Leaflet.map(mapContainer).setView([0, 0], 2)',
      'Leaflet.map(mapContainer, { zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView([0, 0], 2, { animate: false })', 1],
    ['map.fitBounds(bounds, { padding: [20, 20] })',
      'map.fitBounds(bounds, { padding: [20, 20], animate: false })', 2],
    ['map.zoomIn?.()', 'map.zoomIn?.(undefined, { animate: false })', 1],
    ['map.zoomOut?.()', 'map.zoomOut?.(undefined, { animate: false })', 1],
    ['map.setView([0, 0], 2)', 'map.setView([0, 0], 2, { animate: false })', 1],
  ]
  for (const [anchor, replacement, count] of replacements) {
    if (source.split(anchor).length !== count + 1) throw new Error('Reviewed viewer browser adapter anchor changed: ' + anchor)
    source = source.replaceAll(anchor, replacement)
  }
  return source
}
