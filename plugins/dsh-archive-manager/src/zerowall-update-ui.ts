/** Keep resource operations in ZeroWall's signed, transactional extension center. */
export function observePluginUpdate(options: { titleRowSelector: string }): () => void {
	if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return () => {};
	const buttons = new Set<HTMLButtonElement>();
	let disposed = false;
	function refresh() {
		if (disposed) return;
		for (const row of document.querySelectorAll(options.titleRowSelector)) {
			if (row.querySelector('[data-zerowall-archive-update]')) continue;
			const button = document.createElement('button');
			button.type = 'button';
			button.dataset.zerowallArchiveUpdate = '';
			button.style.cssText = 'margin-inline-start:auto;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit';
			button.onclick = () => window.dispatchEvent(new CustomEvent('zerowall:open-settings', { detail: 'zerowall-extension-center' }));
			row.append(button);
			buttons.add(button);
		}
		for (const button of buttons) {
			if (!button.isConnected) { buttons.delete(button); continue; }
			const label = document.documentElement.lang.startsWith('zh') ? '扩展中心' : 'Extension center';
			if (button.textContent !== label) button.textContent = label;
		}
	}
	const observer = new MutationObserver(refresh);
	observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['lang'] });
	refresh();
	return () => { disposed = true; observer.disconnect(); for (const button of buttons) button.remove(); buttons.clear(); };
}
