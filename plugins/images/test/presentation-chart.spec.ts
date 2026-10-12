import { expect, it } from 'vitest'
import { chartAxisCode } from '../src/host/presentation-chart.js'
import { SNAPSHOT_CODE } from '../src/host/presentation-workflow.js'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
it('persists fixed tick units with the official chart command and restores automatic ticks without losing chart settings', async () => {
  let data = { chart: { id: 'chart-1', dataSourceId: 'data-1', style: { palette: ['#17777E'], yAxis: { min: 0, max: 1.8, majorUnit: undefined as number | undefined }, xAxis: { reverse: true } } }, dataSource: { values: [['PA', 1.61]] } }
  const chart = { getId: () => data.chart.id, getChartData: () => data }
  const slide = { getId: () => 'slide-1', getCharts: () => [chart] }
  const presentation = { getId: () => 'unit-1', getSlideByIndex: (index: number) => index === 0 ? slide : undefined }
  const calls: any[] = []
  const api = { executeCommand: async (name: string, args: any) => { calls.push({ name, args }); data = { ...data, chart: { ...data.chart, ...args.patch } }; return true } }
  const fixed = chartAxisCode({ page: 1, chartId: 'chart-1', axis: 'y', mode: 'fixed', majorUnit: 0.3 })
  expect(await new AsyncFunction('presentation', 'univerAPI', fixed)(presentation, api)).toMatchObject({ majorUnit: 0.3 })
  expect(calls[0]).toMatchObject({ name: 'slide.command.update-slide-chart-snapshot', args: { unitId: 'unit-1', subUnitId: 'slide-1', chartId: 'chart-1' } })
  expect(data.chart.style.yAxis).toEqual({ min: 0, max: 1.8, majorUnit: 0.3 })
  expect(data.chart.style.xAxis).toEqual({ reverse: true }); expect(data.dataSource.values).toEqual([['PA', 1.61]])
  await new AsyncFunction('presentation', 'univerAPI', chartAxisCode({ page: 1, chartId: 'chart-1', axis: 'y', mode: 'automatic' }))(presentation, api)
  expect(data.chart.style.yAxis).toEqual({ min: 0, max: 1.8 }); expect(data.chart.style.palette).toEqual(['#17777E'])
  await expect(new AsyncFunction('presentation', 'univerAPI', chartAxisCode({ page: 1, chartId: "other';throw new Error('injected')", axis: 'y', mode: 'automatic' }))(presentation, api)).rejects.toThrow('Chart ID is not on this page')
  expect(calls).toHaveLength(2)
})
it('rejects invalid intervals and unresolved chart pages before mutation', async () => {
  for (const majorUnit of [0, -1, NaN, Infinity]) expect(() => chartAxisCode({ page: 1, chartId: 'a', axis: 'y', mode: 'fixed', majorUnit })).toThrow('positive finite')
  expect(() => chartAxisCode({ page: 1, chartId: 'a', axis: 'y', mode: 'automatic', majorUnit: 1 })).toThrow('omit')
  const code = chartAxisCode({ page: 2, chartId: 'a', axis: 'y', mode: 'fixed', majorUnit: 0.3 })
  await expect(new AsyncFunction('presentation', code)({ getSlideByIndex: () => undefined })).rejects.toThrow('page does not exist')
})
it('detects chart resource and notes changes even when Slide element data is unchanged', () => {
  let majorUnit = 0.3, notes = 'source'
  const slide = { getData: () => ({ elements: { chart: { chartId: 'chart-1' } } }), getId: () => 'slide-1', getCharts: () => [{ getChartData: () => ({ chart: { style: { yAxis: { majorUnit } } }, dataSource: { values: [['PA', 1.61]] } }) }], getSpeakerNotes: () => notes }
  const capture = () => new Function('presentation', SNAPSHOT_CODE)({ getSlides: () => [slide] })[0].fingerprint
  const original = capture(); expect(capture()).toBe(original)
  majorUnit = 0.2; const updated = capture(); expect(updated).not.toBe(original)
  notes = 'changed source'; expect(capture()).not.toBe(updated)
})
