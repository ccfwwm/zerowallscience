import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { probeBrainGlobe, probeEngine } from '../src/host/index.js'
import { auditBrainregOutputDirectory, parseBrainregMetadata, validateBrainregOutputs } from '../src/host/brain-atlas.js'

describe('engine subprocess health', () => {
  it.each([
    ['console.log("1.2.3")', true],
    ['console.log("1.2.3"); process.exit(2)', false],
    ['', false],
    ['console.error("warning only")', false],
  ])('reports actual process outcome: %s', async (code, available) => {
    expect(await probeEngine('napari', process.execPath, process.execPath, ['-e', code])).toMatchObject({ available })
  })
  it('does not report a timeout as available', async () => {
    expect(await probeEngine('napari', process.execPath, process.execPath, ['-e', 'setInterval(() => {}, 1000)'], 100)).toMatchObject({ available: false, reason: '版本探测超时。' })
  })
  it('keeps BrainGlobe unavailable when the shared runtime is explicitly unavailable', async () => {
    const previous = { shared: process.env.ZEROWALL_PYTHON_ROOT, managed: process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT, legacy: process.env.ZEROWALL_BRAINGLOBE_PYTHON }
    process.env.ZEROWALL_PYTHON_ROOT = join(tmpdir(), 'zerowall-python-does-not-exist')
    delete process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT
    delete process.env.ZEROWALL_BRAINGLOBE_PYTHON
    try { await expect(probeBrainGlobe()).resolves.toMatchObject({ id: 'brainglobe', available: false }) }
    finally {
      if (previous.shared === undefined) delete process.env.ZEROWALL_PYTHON_ROOT; else process.env.ZEROWALL_PYTHON_ROOT = previous.shared
      if (previous.managed === undefined) delete process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT; else process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = previous.managed
      if (previous.legacy === undefined) delete process.env.ZEROWALL_BRAINGLOBE_PYTHON; else process.env.ZEROWALL_BRAINGLOBE_PYTHON = previous.legacy
    }
  })
  it('requires the brainreg metadata and registered atlas output before recording success', () => {
    expect(validateBrainregOutputs(['brainreg.json', 'registered_atlas.tiff', 'boundaries.tiff'])).toEqual({ valid: true, missing: [] })
    expect(validateBrainregOutputs(['boundaries.tiff'])).toEqual({ valid: false, missing: ['brainreg.json', 'registered_atlas.tiff|registered_atlas.nii'] })
    expect(validateBrainregOutputs(['brainreg.json', 'registered_atlas.nii'])).toEqual({ valid: true, missing: [] })
    expect(parseBrainregMetadata('{"atlas":"allen_mouse_25um"}')).toEqual({ valid: true, metadata: { atlas: 'allen_mouse_25um' } })
    expect(parseBrainregMetadata('[]')).toMatchObject({ valid: false })
  })
  it('audits brainreg output files with non-empty size and reproducible hashes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zerowall-brainreg-audit-'))
    try {
      await writeFile(join(directory, 'brainreg.json'), '{"atlas":"allen_mouse_25um","orientation":"asr"}\n')
      await writeFile(join(directory, 'registered_atlas.tiff'), Buffer.from([1, 2, 3, 4]))
      await writeFile(join(directory, 'boundaries.tiff'), Buffer.from([5]))
      const audit = await auditBrainregOutputDirectory(directory)
      expect(audit.valid).toBe(true)
      expect(audit.metadata).toMatchObject({ atlas: 'allen_mouse_25um' })
      expect(audit.files).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'brainreg.json', bytes: expect.any(Number), sha256: expect.stringMatching(/^[a-f0-9]{64}$/u) }),
        expect.objectContaining({ name: 'registered_atlas.tiff', bytes: 4 }),
      ]))
      await writeFile(join(directory, 'registered_atlas.tiff'), Buffer.alloc(0))
      const empty = await auditBrainregOutputDirectory(directory)
      expect(empty.valid).toBe(false)
      expect(empty.empty).toContain('registered_atlas.tiff')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
