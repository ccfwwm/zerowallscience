function powerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

export function buildPowerShellPythonCommand(runtimeRoot, executable) {
  return `$ErrorActionPreference = 'Stop'; Set-Location -LiteralPath ${powerShellLiteral(runtimeRoot)}; & ${powerShellLiteral(executable)}`
}
