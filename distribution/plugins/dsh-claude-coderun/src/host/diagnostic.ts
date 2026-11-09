/** Classify the provider's actual response before broad HTTP/auth wrappers. */
export function claudeFailureCategory(detail: string): string {
  if (/insufficient[ _-]?(?:balance|credit|fund)|credit balance|billing|payment.required|quota.exceeded/iu.test(detail)) return 'provider-billing'
  if (/401|403|authentication|invalid.*key|unauthorized/iu.test(detail)) return 'authentication'
  if (/429|rate.limit|overload|529/iu.test(detail)) return 'provider-capacity'
  if (/permission|denied|not.*support|不支持/iu.test(detail)) return 'permission-or-capability'
  if (/connect|fetch|network|timeout|ECONN/iu.test(detail)) return 'connection'
  return 'runtime'
}
