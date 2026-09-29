/**
 * Keep the pinned DSH checkout clean while adding the desktop delete action to
 * rc.2's slot-based session menu. The generated client is adapted at runtime
 * preparation time so the upstream checkout remains a clean, reviewable pin.
 */
export function adaptSessionDelete(source) {
  if (source.includes('ZeroWallDeleteSessionMenuItem')) return source

  const applyMarker = 'function apply(ctx) {'
  const menuMarker = 'ctx.slots.inject("sidebar.workspaces.session.menu.item", function* () {'
  if (!source.includes(applyMarker) || !source.includes(menuMarker)) {
    throw new Error('Unrecognized slot-based session menu; review the desktop deletion adapter')
  }

  const component = `
		/** ZeroWall's destructive session action lives beside the shipped slot entries. */
		function ZeroWallDeleteSessionMenuItem({ sessionId, displayTitle, useMenuOpenState, t }) {
			const [, setMenuOpen] = useMenuOpenState();
			const chinese = t("menu.archiveSession") === "归档会话";
			if (typeof window === "undefined" || window.zerowallDesktop?.deleteSession === undefined) return null;
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MenuItemButton, {
				danger: true,
				separatorBefore: true,
				onSelect: () => {
					setMenuOpen(false);
					void window.zerowallDesktop.deleteSession({ sessionId, title: displayTitle, language: chinese ? "zh" : "en" }).catch(() => {});
				},
				children: chinese ? "删除会话" : "Delete session"
			});
		}
`

  const menuRegistration = /([\r\n]\s*yield ctx\.slots\.register\(\{\s*name: "sidebar\.workspaces\.session\.menu\.item",\s*id: "archive",[\s\S]*?\}, ArchiveSessionMenuItem\);)(\s*[\r\n]\s*\}\);)/
  if (!menuRegistration.test(source)) {
    throw new Error('Unrecognized session menu registrations; review the desktop deletion adapter')
  }

  const adapted = source
    .replace(applyMarker, `${component}\n\t\t${applyMarker}`)
    .replace(menuRegistration, `$1
				yield ctx.slots.register({
					name: "sidebar.workspaces.session.menu.item",
					id: "zerowall-delete-session",
					order: 500,
					locale: NS,
					inject: () => ({})
				}, ZeroWallDeleteSessionMenuItem);$2`)

  if (!adapted.includes('window.zerowallDesktop.deleteSession') || !adapted.includes('id: "zerowall-delete-session"')) {
    throw new Error('Desktop session deletion action was not installed')
  }
  return adapted
}
