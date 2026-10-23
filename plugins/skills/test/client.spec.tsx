// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SkillsSettingsTab } from '../src/client/SkillsSettingsTab.js'
import { translator } from '../../base/test/locale.js'

afterEach(() => cleanup())

describe('Skills settings tab', () => {
  it('loads, searches, filters, and opens bundled scientific Skills', async () => {
    const listSkills = vi.fn().mockResolvedValue([
      { name: 'literature-review', description: '文献综述', source: 'bundled', provider: 'scientific', modelInvocable: true, userInvocable: true },
      { name: 'diffdock', description: '分子对接', source: 'local', provider: 'zerowall', modelInvocable: true, userInvocable: true },
    ])
    const getSkill = vi.fn(async (name: string) => name === 'literature-review' ? {
      name: 'literature-review', description: '文献综述', source: 'bundled', provider: 'scientific',
      modelInvocable: true, userInvocable: true, content: '# Literature Review\n\n完整科研流程',
      declaredVersion: '7.0.0-1', contentHash: 'a'.repeat(64),
    } : {
      name: 'diffdock', description: '分子对接', source: 'local', provider: 'zerowall',
      modelInvocable: true, userInvocable: true, content: '# DiffDock',
    })
    render(<SkillsSettingsTab t={translator()} listSkills={listSkills} getSkill={getSkill} />)

    expect(await screen.findByRole('button', { name: /literature-review/ })).toBeTruthy()
    expect(screen.getByText(/已加载 2 个科研流程/)).toBeTruthy()
    expect(await screen.findByText((_, element) => element?.tagName === 'PRE' && element.textContent?.includes('完整科研流程') === true)).toBeTruthy()
    expect(getSkill).toHaveBeenCalledWith('literature-review')
    fireEvent.change(screen.getByPlaceholderText('搜索名称、描述或使用场景'), { target: { value: '文献' } })
    expect(screen.queryByRole('button', { name: /diffdock/ })).toBeNull()
    expect(screen.getByText('v7.0.0-1')).toBeTruthy()
    expect(screen.getByTitle('a'.repeat(64)).textContent).toBe('SHA-256: aaaaaaaaaaaa')
    fireEvent.change(screen.getByPlaceholderText('搜索名称、描述或使用场景'), { target: { value: '' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Skills 目录', hidden: true }), { target: { value: 'diffdock' } })
    expect(await screen.findByText((_, element) => element?.tagName === 'PRE' && element.textContent === '# DiffDock')).toBeTruthy()
  })

  it('keeps disabled imported Skills visible and allows enabling them again', async () => {
    const listSkills = vi.fn().mockResolvedValue([
      { name: 'custom-analysis', description: '自定义分析', source: 'user', provider: 'zerowall-user-skills', modelInvocable: false, userInvocable: false },
    ])
    const getSkill = vi.fn().mockResolvedValue({
      name: 'custom-analysis', description: '自定义分析', source: 'user', provider: 'zerowall-user-skills',
      modelInvocable: false, userInvocable: false, content: '# Steps',
    })
    const setSkillEnabled = vi.fn().mockResolvedValue(undefined)
    render(<SkillsSettingsTab t={translator()} listSkills={listSkills} getSkill={getSkill}
      listSkillSources={vi.fn().mockResolvedValue({ enabled: [], disabled: ['custom-analysis'] })}
      setSkillEnabled={setSkillEnabled} />)

    fireEvent.click(await screen.findByRole('button', { name: /custom-analysis/ }))
    fireEvent.click(await screen.findByRole('button', { name: /启用/ }))
    await waitFor(() => expect(setSkillEnabled).toHaveBeenCalledWith('custom-analysis', true))
  })

  it('shows a useful empty state when no Skills are available', async () => {
    render(<SkillsSettingsTab t={translator()} listSkills={vi.fn().mockResolvedValue([])} getSkill={vi.fn()} />)
    expect(await screen.findByText('暂无可用 Skill')).toBeTruthy()
    expect(screen.getByText('可导入 Skill，或检查当前 Skill 来源。')).toBeTruthy()
  })

  it('shows a recoverable error when the Skill catalog fails to load', async () => {
    render(<SkillsSettingsTab t={translator()} listSkills={vi.fn().mockRejectedValue(new Error('catalog offline'))} getSkill={vi.fn()} />)
    await waitFor(() => expect(screen.getAllByText('catalog offline')).toHaveLength(2))
    expect(screen.getAllByText('加载 Skills 失败，请刷新后重试。')).toHaveLength(2)
  })
})
