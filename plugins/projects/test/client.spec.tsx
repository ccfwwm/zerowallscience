// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProjectWorkbenchButton } from '../src/client/ProjectWorkbenchButton.js'
import { translator } from '../../base/test/locale.js'

afterEach(() => cleanup())

function props() {
  const project = { id: 'p1', name: 'Genome', rootPath: 'C:/genome', description: 'Atlas', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }
  return {
    wide: true,
    t: translator(),
    listProjects: vi.fn().mockResolvedValue([project]),
    listRecentProjects: vi.fn().mockResolvedValue([project]),
    createProject: vi.fn(),
    openProject: vi.fn().mockResolvedValue(project),
    updateProject: vi.fn().mockResolvedValue(project),
    getProjectSettings: vi.fn().mockResolvedValue({ projectId: 'p1', settings: { defaultContextId: 'gpu', autoHarvest: true }, updatedAt: '' }),
    updateProjectSettings: vi.fn(),
    exportProject: vi.fn(),
    importProject: vi.fn(),
  }
}

describe('Project workbench', () => {
  it('opens recent projects and exposes persisted settings', async () => {
    const actions = props()
    render(<ProjectWorkbenchButton {...actions} />)
    fireEvent.click(screen.getByRole('button', { name: '科研项目' }))
    await screen.findByText('Genome')
    expect(screen.getByText('最近')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '打开 Genome' }))
    await waitFor(() => expect(actions.openProject).toHaveBeenCalledWith('p1'))
    fireEvent.click(screen.getByRole('button', { name: '设置 Genome' }))
    await screen.findByRole('form', { name: '项目设置' })
    expect(screen.getByDisplayValue('gpu')).toBeTruthy()
  })

  it('uses one Escape press for only the project settings surface', async () => {
    render(<ProjectWorkbenchButton {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: '科研项目' }))
    await screen.findByText('Genome')
    fireEvent.click(screen.getByRole('button', { name: '设置 Genome' }))
    await screen.findByRole('form', { name: '项目设置' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('form', { name: '项目设置' })).toBeNull()
    expect(screen.getByRole('dialog', { name: '科研项目' })).toBeTruthy()
  })
})
