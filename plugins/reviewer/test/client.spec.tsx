// @vitest-environment jsdom

import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewerCard } from '../src/client/ReviewerCard.js'
import { reviewerReportDefinition } from '../src/client/definition.js'

afterEach(() => cleanup())

const report = {
  id: 'review-1', turn: 2, summary: 'One issue needs correction.', findings: [{
    messageIndex: 3, claim: 'The output says five.', evidence: 'output: five', fix: 'Use the cited value.', verdict: 'fail' as const, severity: 'high' as const, status: 'open' as const,
  }], reviewerModel: 'mock/reviewer', reviewerBackend: 'spawn', reviewStatus: 'failed' as const, evidenceCoverage: 100, coverageGaps: [], correction: 'requested' as const, reReviewed: false,
}

describe('Reviewer UI projection', () => {
  it('renders status, model, coverage and findings in the conversation', () => {
    render(<ReviewerCard node={{ data: report } as never} />)
    expect(screen.getByText('Needs correction')).toBeTruthy()
    expect(screen.getByText('mock/reviewer')).toBeTruthy()
    expect(screen.getByText('Evidence 100%')).toBeTruthy()
    expect(screen.getByText('[msg:3] The output says five.')).toBeTruthy()
  })

  it('folds a re-review event into the original report context', () => {
    const first = { type: 'zerowall/reviewer/report', seq: 4, time: 4, data: report } as never
    const second = { type: 'zerowall/reviewer/report', seq: 5, time: 5, data: { ...report, reReviewed: true, correction: 'completed', reviewStatus: 'passed', findings: [] } } as never
    expect(reviewerReportDefinition.match(first)).toEqual({ id: 'review-1', role: 'start' })
    expect(reviewerReportDefinition.match(second)).toEqual({ id: 'review-1', role: 'update' })
  })
})
