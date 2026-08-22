export function parseLines(value: string): string[] {
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}

export function formatLines(values: string[]): string {
  return values.join('\n')
}

export function parseReferences(
  value: string,
  label: string,
  targetPattern: RegExp,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of parseLines(value)) {
    const separator = line.indexOf('=')
    if (separator <= 0 || separator === line.length - 1) throw new Error(`${label} must use TARGET=ENV_NAME.`)
    const target = line.slice(0, separator).trim()
    const source = line.slice(separator + 1).trim()
    if (!targetPattern.test(target)) throw new Error(`${label} contains an invalid target name: ${target}`)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(source)) throw new Error(`${label} contains an invalid environment variable name: ${source}`)
    if (Object.hasOwn(result, target)) throw new Error(`${label} contains a duplicate target: ${target}`)
    result[target] = source
  }
  return result
}

export function formatReferences(value: Record<string, string>): string {
  return Object.entries(value).map(([target, source]) => `${target}=${source}`).join('\n')
}

export const ENVIRONMENT_TARGET = /^[A-Za-z_][A-Za-z0-9_]*$/
export const HTTP_HEADER_TARGET = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
