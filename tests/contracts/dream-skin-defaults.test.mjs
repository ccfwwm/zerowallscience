import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const source = await readFile(resolve(root, 'desktop/node_modules/dsh-dream-skin/lib/client.js'), 'utf8')
const skinKey = 'dsh-dream-skin:skin'
const wallpaperKey = 'dsh-dream-skin:wallpaper'
const gradientKey = 'dsh-dream-skin:wallpaper-gradient'

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} must exist in the installed Dream Skin bundle`)
  const bodyStart = source.indexOf('{', start)
  let depth = 0
  for (let end = bodyStart; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1
    if (source[end] === '}') depth -= 1
    if (depth === 0) return source.slice(start, end + 1)
  }
  throw new Error(`Unterminated ${name}`)
}

function migrateLocal(stateEntries, factoryEntries) {
  const state = new Map(stateEntries)
  const factorySnapshot = new Map(factoryEntries)
  const writes = []
  const readStorage = key => state.get(key) ?? null
  const writeStorage = (key, value, options) => {
    state.set(key, value)
    writes.push({ key, value, options })
  }
  const run = new Function(
    'factorySnapshot', 'readStorage', 'writeStorage', 'FACTORY_DEFAULTS',
    'STORAGE_KEY', 'WALLPAPER_KEY', 'WALLPAPER_GRADIENT_KEY',
    'LEGACY_FACTORY_SKIN', 'LEGACY_FACTORY_WALLPAPER', 'LEGACY_FACTORY_GRADIENT',
    `${extractFunction('migrateLegacyFactoryAppearance')}\nreturn migrateLegacyFactoryAppearance;`,
  )(
    factorySnapshot, readStorage, writeStorage,
    { [skinKey]: 'ivory', [wallpaperKey]: '', [gradientKey]: '' },
    skinKey, wallpaperKey, gradientKey,
    'nebula', 'factory-svg', 'factory-purple',
  )
  run()
  return { state, writes }
}

function hostMatchesFactory(state) {
  const predicate = source.match(/const legacyHostFactory = ([\s\S]*?);\r?\n\t\t\t\tconst hostKeys/u)?.[1]
  assert.ok(predicate, 'old factory host predicate must exist')
  return new Function(
    'parsed', 'STORAGE_KEY', 'WALLPAPER_KIND_KEY', 'WALLPAPER_KEY',
    'WALLPAPER_HISTORY_KEY', 'LEGACY_FACTORY_SKIN', 'LEGACY_FACTORY_WALLPAPER',
    `return ${predicate};`,
  )(
    { value: state }, skinKey, 'dsh-dream-skin:wallpaper-kind', wallpaperKey,
    'dsh-dream-skin:wallpaper-history', 'nebula', 'factory-svg',
  )
}

test('old local factory appearance becomes iOS Flat without a wallpaper', () => {
  const old = [[skinKey, 'nebula'], [wallpaperKey, 'factory-svg'], [gradientKey, 'factory-purple']]
  const { state, writes } = migrateLocal(old, old)
  assert.equal(state.get(skinKey), 'ivory')
  assert.equal(state.get(wallpaperKey), '')
  assert.equal(state.get(gradientKey), '')
  assert.equal(writes.length, 3)
  assert.ok(writes.every(({ options }) => options.factory === true))
})

test('manual skin and wallpaper survive the old factory migration', () => {
  const old = [[skinKey, 'nebula'], [wallpaperKey, 'factory-svg'], [gradientKey, 'factory-purple']]
  const { state, writes } = migrateLocal(
    [[skinKey, 'rose'], [wallpaperKey, 'custom-image'], [gradientKey, 'custom-gradient']], old,
  )
  assert.equal(state.get(skinKey), 'rose')
  assert.equal(state.get(wallpaperKey), 'custom-image')
  assert.equal(state.get(gradientKey), 'custom-gradient')
  assert.equal(writes.length, 0)
})

test('a custom wallpaper survives when the skin itself was a factory value', () => {
  const { state, writes } = migrateLocal(
    [[skinKey, 'nebula'], [wallpaperKey, 'custom-image']], [[skinKey, 'nebula']],
  )
  assert.equal(state.get(skinKey), 'ivory')
  assert.equal(state.get(wallpaperKey), 'custom-image')
  assert.deepEqual(writes.map(({ key }) => key), [skinKey])
})

test('host migration recognizes only the complete old factory pair', () => {
  const old = { [skinKey]: 'nebula', 'dsh-dream-skin:wallpaper-kind': 'image', [wallpaperKey]: 'factory-svg' }
  assert.equal(hostMatchesFactory(old), true)
  assert.equal(hostMatchesFactory({ ...old, [skinKey]: 'rose' }), false)
  assert.equal(hostMatchesFactory({ ...old, [wallpaperKey]: 'custom-image' }), false)
  assert.equal(hostMatchesFactory({ ...old, 'dsh-dream-skin:wallpaper-history': '[]' }), false)
})
