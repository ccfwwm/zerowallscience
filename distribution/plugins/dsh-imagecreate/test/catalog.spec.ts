import { expect, it } from 'vitest'
import type { AiCloudAccountSnapshot, AiCloudMediaModel } from '@zerowall/dsh-plugin-ai-cloud/account-types'
import { imageCatalog } from '../src/host/catalog.js'

const model: AiCloudMediaModel = { providerId: 'provider', groupId: 'group', groupName: 'Images', modelId: 'image-model', baseUrl: 'https://example.test', capability: 'media', mediaType: 'image', profileId: 'generation', version: '1', operations: ['image'], sizes: ['1024x1024'], resolutions: [], aspectRatios: [], qualities: [], formats: [], duration: {}, materials: {}, pollSeconds: 1 }
const snapshot = (mediaModels: AiCloudMediaModel[]): AiCloudAccountSnapshot => ({ status: 'signedIn', models: [], mediaModels, balanceFreshness: 'current', lowBalance: false })

it('offers only image operations and exposes the declared image sizes', () => {
  const rows = imageCatalog(snapshot([model, { ...model, modelId: 'unsupported', operations: ['video'] }, { ...model, modelId: 'audio', mediaType: 'audio' }]))
  expect(rows.map(row => row.modelId)).toEqual(['image-model'])
  expect(rows[0]?.resolutions).toEqual(['1024x1024'])
})

it('collapses repeated identities while retaining distinct image profiles', () => {
  const rows = imageCatalog(snapshot([model, model, { ...model, profileId: 'editing', operations: ['image_edit'] }]))
  expect(rows).toHaveLength(2)
})

it('keeps stale routes available for settings display and excludes them from generation', () => {
  const account = snapshot([{ ...model, stale: true }])
  expect(imageCatalog(account)).toEqual([])
  expect(imageCatalog(account, true)).toHaveLength(1)
})
