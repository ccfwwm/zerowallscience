import { expect, it } from 'vitest'
import { mergeProjectSettings } from '../src/host/project-settings.js'

it('preserves existing project settings when the UI updates known fields', () => {
  expect(mergeProjectSettings(
    { autoHarvest: true, researchSessions: { session: 'study' } },
    { rPlatformProjectId: 'existing-r-project', autoHarvest: false },
  )).toEqual({ autoHarvest: false, researchSessions: { session: 'study' }, rPlatformProjectId: 'existing-r-project' })
})
