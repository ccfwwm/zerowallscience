// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SequenceFeatureMap } from '../src/client/sequence-feature-map.js'
import { parseGenBank } from '../src/host/sequence.js'

afterEach(cleanup)
const record = parseGenBank('LOCUS       plasmid 20 bp DNA circular\nFEATURES             Location/Qualifiers\n     CDS             complement(join(18..20,1..6))\n                     /gene="example"\nORIGIN\n        1 atgcatgcatgcatgcatgc\n//\n')[0]!

describe('GenBank feature map', () => {
  it('renders each origin-spanning segment and selects the real coordinate bounds', () => {
    const onSelect = vi.fn()
    const { container } = render(<SequenceFeatureMap length={20} name="plasmid" mode="circular" features={record.features} selection={[1, 6]} onSelect={onSelect} />)
    expect(screen.getByRole('img', { name: 'plasmid 环形图谱' })).toBeTruthy()
    expect(container.querySelectorAll('g path')).toHaveLength(2)
    fireEvent.keyDown(screen.getByRole('button', { name: /选择注释 example/u }), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(1, 20)
  })
  it('places negative strand segments on the lower linear track', () => {
    const { container } = render(<SequenceFeatureMap length={20} name="plasmid" mode="linear" features={record.features} selection={[1, 6]} onSelect={() => {}} />)
    const segments = Array.from(container.querySelectorAll('g rect'))
    expect(segments).toHaveLength(2)
    expect(segments.every(segment => Number(segment.getAttribute('y')) >= 110)).toBe(true)
    expect(screen.getByText('complement(join(18..20,1..6))')).toBeTruthy()
  })
})
