/** Keep the pinned DSH checkout clean; add the desktop action to its curated row menu. */
export function adaptSessionDelete(source) {
  if (source.includes('zerowall-delete-session')) return source
  const menu = 'const sessionMenuItems = ['
  const select = 'if (id === "archive") onArchive(node.id);'
  if (!source.includes(menu) || !source.includes(select)) throw new Error('Unrecognized session row menu; review the desktop deletion adapter')
  return source.replace(menu, `${menu}
    ...(window.zerowallDesktop?.deleteSession ? [{ id: 'zerowall-delete-session', label: t('menu.archiveSession') === '归档会话' ? '删除会话' : 'Delete session', danger: true }] : []),`)
    .replace(select, `${select}
            if (id === 'zerowall-delete-session') void window.zerowallDesktop.deleteSession({ sessionId: node.id, title, language: t('menu.archiveSession') === '归档会话' ? 'zh' : 'en' }).catch(() => {});`)
}
