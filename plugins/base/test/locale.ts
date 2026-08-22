import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { en, NS, zh, type ZeroWallKey } from '../src/client/locales.js'

export function translator(locale: 'zh' | 'en' = 'zh'): TranslateNS<typeof NS> {
  const dictionary = locale === 'zh' ? zh : en
  return ((key: ZeroWallKey, params?: Record<string, unknown>) => {
    let value = dictionary[key]
    for (const [name, replacement] of Object.entries(params ?? {})) {
      value = value.replaceAll(`{${name}}`, String(replacement))
    }
    return value
  }) as TranslateNS<typeof NS>
}
