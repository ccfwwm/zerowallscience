/** Reveal the resident core shell only after its layout and visible brand
 * resources are usable. Workspace/session selection and optional plugins are
 * deliberately not readiness requirements. */
export const WORKBENCH_READY_SCRIPT = `(() => {
  if (document.querySelector('[data-dsh-boot], [data-dsh-boot-failed]')) return false;
  const visible = el => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let current = el; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.visibility === 'hidden' || style.visibility === 'collapse' || style.display === 'none') return false;
    }
    return true;
  };
  const column = el => {
    const style = getComputedStyle(el);
    return style.display === 'flex' && style.flexDirection === 'column';
  };
  // These are resident DSH shell markers. Better Sidebar and other optional
  // contributions may arrive later without holding the core workbench closed.
  const frame = document.querySelector('[data-rightbar-col]')?.parentElement;
  const sidebar = document.querySelector('[data-sidebar-footer]')?.parentElement;
  if (!frame || !sidebar || !frame.contains(sidebar) || !visible(frame)
    || getComputedStyle(frame).display !== 'grid' || !column(sidebar)) return false;
  // Desktop collapse legitimately gives the sidebar a zero-width track.
  const sidebarCollapsed = frame.getAttribute('data-sidebar-collapsed') === 'true';
  if (!sidebarCollapsed && !visible(sidebar)) return false;
  const composer = Array.from(frame.querySelectorAll('[data-composer-input], [contenteditable=true]')).find(el => {
    const content = el.closest('[data-conversation-content]');
    return visible(el) && content && visible(content) && column(content);
  });
  if (!composer) return false;
  // An unloaded PNG paints its alt text outside the small brand seat and
  // makes a partially booted page appear ready. Only inspect visible product
  // marks; optional images and a collapsed sidebar must not gate startup.
  return Array.from(frame.querySelectorAll('img[src*="zerowall-icon.png"]'))
    .filter(image => !(sidebarCollapsed && sidebar.contains(image)) && visible(image))
    .every(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
})()`
