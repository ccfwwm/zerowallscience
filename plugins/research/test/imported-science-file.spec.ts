import { describe, expect, it } from 'vitest'
import { scienceToolForImportedPath } from '../src/client/imported-science-file.js'

describe('scienceToolForImportedPath', () => {
  it('routes Windows and POSIX filenames without depending on Node path APIs', () => {
    expect(scienceToolForImportedPath('C:\\data\\sample.PNG')).toBe('imagej')
    expect(scienceToolForImportedPath('/data/sample.svs')).toBe('he')
    expect(scienceToolForImportedPath('C:\\data\\sample.tiff', 'he')).toBe('he')
    expect(scienceToolForImportedPath('/data/sample.gb')).toBe('sequence')
    expect(scienceToolForImportedPath('C:\\data\\sample.ab1')).toBe('sanger')
  })

  it('ignores dotfiles, trailing dots, and unsupported files', () => {
    expect(scienceToolForImportedPath('/data/.sample')).toBeUndefined()
    expect(scienceToolForImportedPath('/data/sample.')).toBeUndefined()
    expect(scienceToolForImportedPath('/data/sample.csv')).toBeUndefined()
  })
})
