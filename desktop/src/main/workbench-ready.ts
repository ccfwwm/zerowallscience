/** Renderer mount detection is independent of session input editability. */
export const WORKBENCH_READY_SCRIPT = `(() => {
  if (document.querySelector('[data-dsh-boot], [data-dsh-boot-failed]')) return false;
  return Array.from(document.querySelectorAll('[data-composer-input], [contenteditable=true]')).some(el => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  });
})()`
