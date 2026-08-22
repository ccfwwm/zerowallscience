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
    const getSkill = vi.fn().mockResolvedValue({
      name: 'literature-review', description: '文献综述', source: 'bundled', provider: 'scientific',
      modelInvocable: true, userInvocable: true, content: '# Literature Review\n\n完整科研流程',
    })
    render(<SkillsSettingsTab t={translator()} listSkills={listSkills} getSkill={getSkill} />)

    expect(await screen.findByText('literature-review')).toBeTruthy()
    expect(screen.getByText(/已加载 2 个科研流程/)).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('搜索名称、描述或使用场景'), { target: { value: '文献' } })
    expect(screen.queryByText('diffdock')).toBeNull()
    fireEvent.click(screen.getByText('literature-review'))
    await waitFor(() => expect(getSkill).toHaveBeenCalledWith('literature-review'))
    expect(screen.getByText((_, element) => element?.tagName === 'PRE' && element.textContent?.includes('完整科研流程') === true)).toBeTruthy()
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

    fireEvent.click(await screen.findByText('custom-analysis'))
    fireEvent.click(await screen.findByRole('button', { name: /启用/ }))
    await waitFor(() => expect(setSkillEnabled).toHaveBeenCalledWith('custom-analysis', true))
  })
})
