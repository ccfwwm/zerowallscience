import { describe, expect, it } from 'vitest'
import { canGrantWindowPermission, isTrustedAppUrl, isZoteroOpenUrl } from '../src/main/security-policy.js'

describe('desktop navigation policy', () => {
  const origin = 'http://127.0.0.1:43127'
  it('limits external Zotero launches to item selection and PDF viewing', () => {
    for (const url of ['zotero://select/library/items/ABCD1234', 'zotero://select/groups/12/items/ABCD1234', 'zotero://open-pdf/library/items/ABCD1234?page=2&annotation=ZXCV1234']) expect(isZoteroOpenUrl(url)).toBe(true)
    for (const url of ['zotero://user/0/item/ABCD1234', 'zotero://debug/run', 'file:///C:/Windows/cmd.exe', 'zotero://select/library/items/ABCD1234?run=1', null]) expect(isZoteroOpenUrl(url)).toBe(false)
  })

  it('trusts only the active Harness origin and local splash', () => {
    expect(isTrustedAppUrl(`${origin}/`, origin)).toBe(true)
    expect(isTrustedAppUrl('file:///splash.html', origin)).toBe(true)
    expect(isTrustedAppUrl('http://127.0.0.1:43128/', origin)).toBe(false)
    expect(isTrustedAppUrl('https://example.com/', origin)).toBe(false)
  })

  it('grants only sanitized clipboard writes to the main frame', () => {
    expect(canGrantWindowPermission('clipboard-sanitized-write', `${origin}/`, true, origin)).toBe(true)
    expect(canGrantWindowPermission('media', `${origin}/`, true, origin)).toBe(false)
    expect(canGrantWindowPermission('clipboard-sanitized-write', `${origin}/`, false, origin)).toBe(false)
  })
})
