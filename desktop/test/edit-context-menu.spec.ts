import { expect, it } from 'vitest'
import { editContextMenu } from '../src/main/edit-context-menu.js'

const editFlags = { canUndo: true, canRedo: false, canCut: true, canCopy: true, canPaste: true, canDelete: true, canSelectAll: true, canEditRichly: true }
it('provides editing roles for the composer and respects Chromium capabilities', () => {
  const menu = editContextMenu({ isEditable: true, selectionText: 'text', editFlags })
  expect(menu.filter(item => item.role).map(item => item.role)).toEqual(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'])
  expect(menu.find(item => item.role === 'redo')?.enabled).toBe(false)
  expect(menu.find(item => item.role === 'paste')?.enabled).toBe(true)
})
it('offers copy on selected output and no menu on blank non-editable areas', () => {
  expect(editContextMenu({ isEditable: false, selectionText: 'answer', editFlags })).toEqual([{ role: 'copy' }])
  expect(editContextMenu({ isEditable: false, selectionText: '', editFlags })).toEqual([])
  expect(editContextMenu({ isEditable: false, selectionText: 'secret', editFlags: { ...editFlags, canCopy: false } })).toEqual([])
})
