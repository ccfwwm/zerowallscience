import { createHash } from 'node:crypto'

// SciMaster 0.3.15 ships this exact bundle. The guard prevents a future
// upstream layout change from producing an unverified or partially patched
// MCP environment.
export const SCIMASTER_0315_MCP_SHA256 = '0ffbbf40bfb890491467abd6cb52ea8b9e6bad570075bd38cf40560af6a4fabc'
export const SCIMASTER_0315_MCP_PATCHED_SHA256 = 'dd9a19a68da5bc9d4a01c7a5621e8de8f0ad4d888e830b1e142c89eb078b2fa0'

export function patchSciMasterMcp(source) {
  const input = Buffer.isBuffer(source) ? source : Buffer.from(source, 'utf8')
  const sourceHash = createHash('sha256').update(input).digest('hex')
  if (sourceHash === SCIMASTER_0315_MCP_PATCHED_SHA256) return input
  if (sourceHash !== SCIMASTER_0315_MCP_SHA256) {
    throw new Error(`Unsupported SciMaster 0.3.15 MCP bundle hash: ${sourceHash}`)
  }
  let text = input.toString('utf8')
  const yearNeedle = 'const year = (item.year || "").trim();'
  const yearReplacement = 'const yearText = String(item.year ?? "").trim();\n  const parsedYear = Number.parseInt(yearText, 10);\n  const year = /^\\d{4}$/u.test(yearText) && Number.isInteger(parsedYear) && parsedYear >= 1000 && parsedYear <= 2100 ? parsedYear : void 0;'
  const schemaNeedle = 'year: external_exports.number(),'
  if (text.split(yearNeedle).length !== 2 || text.split(schemaNeedle).length !== 2) {
    throw new Error('SciMaster 0.3.15 MCP bundle compatibility patch points are ambiguous.')
  }
  text = text.replace(yearNeedle, yearReplacement).replace(schemaNeedle, 'year: external_exports.number().optional(),')
  const output = Buffer.from(text, 'utf8')
  if (!text.includes('parsedYear') || !text.includes('year: external_exports.number().optional()')) {
    throw new Error('SciMaster MCP compatibility patch did not apply.')
  }
  return output
}
