import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron'

/** Native roles preserve Chromium's selection, rich editor and clipboard flow. */
export function editContextMenu(params: Pick<ContextMenuParams, 'isEditable' | 'selectionText' | 'editFlags'>): MenuItemConstructorOptions[] {
  const flags = params.editFlags
  if (params.isEditable) return [
    { role: 'undo', enabled: flags.canUndo },
    { role: 'redo', enabled: flags.canRedo },
    { type: 'separator' },
    { role: 'cut', enabled: flags.canCut },
    { role: 'copy', enabled: flags.canCopy },
    { role: 'paste', enabled: flags.canPaste },
    { type: 'separator' },
    { role: 'selectAll', enabled: flags.canSelectAll },
  ]
  return params.selectionText && flags.canCopy ? [{ role: 'copy' }] : []
}
