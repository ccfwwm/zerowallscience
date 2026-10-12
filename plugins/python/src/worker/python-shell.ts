import { spawn } from 'node:child_process'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { resolveFixedPythonRuntime } from '../shared/runtime-path.js'
import { resolveMirror, sanitizePythonTlsEnvironment } from './python-mirror.js'

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`

/** Kept in the independently updated worker so 8.1.3 needs no desktop rebuild. */
export function pythonShellScript(root: string, mirror = resolveMirror().indexUrl): string {
  return `$ErrorActionPreference = 'Stop'
$env:ZEROWALL_PYTHON_RUNTIME_ROOT = ${literal(root)}
$env:ZEROWALL_PYTHON_EXECUTABLE = Join-Path $env:ZEROWALL_PYTHON_RUNTIME_ROOT 'python.exe'
$env:ZEROWALL_PYTHON_ROOT = Join-Path $env:ZEROWALL_PYTHON_RUNTIME_ROOT '.zerowall'
$env:ZEROWALL_PYTHON_MANAGEMENT_ROOT = $env:ZEROWALL_PYTHON_ROOT
Remove-Item Env:PYTHONHOME,Env:PYTHONPATH,Env:VIRTUAL_ENV,Env:CONDA_PREFIX -ErrorAction SilentlyContinue
$env:PYTHONNOUSERSITE = '1'; $env:PYTHONUTF8 = '1'; $env:PYTHONIOENCODING = 'utf-8'
Get-ChildItem Env:PIP_* | Where-Object { $_.Name -notin @('PIP_PROXY','PIP_CERT') } | Remove-Item -ErrorAction SilentlyContinue
$env:PIP_CONFIG_FILE = 'NUL'; $env:PIP_INDEX_URL = ${literal(mirror)}
$env:PATH = $env:ZEROWALL_PYTHON_RUNTIME_ROOT + ';' + (Join-Path $env:ZEROWALL_PYTHON_RUNTIME_ROOT 'Scripts') + ';' + $env:PATH
Set-Location -LiteralPath $env:ZEROWALL_PYTHON_RUNTIME_ROOT
Remove-Item Alias:python,Alias:pip,Alias:pip3 -ErrorAction SilentlyContinue
function global:Test-ZeroWallWriter {
  $lock = Join-Path $env:ZEROWALL_PYTHON_MANAGEMENT_ROOT 'write-lock.json'
  if (!(Test-Path -LiteralPath $lock)) { return $false }
  try {
    $owner = Get-Content -LiteralPath $lock -Raw | ConvertFrom-Json
    if (!$owner.pid) { return ((Get-Date) - (Get-Item -LiteralPath $lock).LastWriteTime).TotalSeconds -lt 10 }
    return $null -ne (Get-Process -Id $owner.pid -ErrorAction SilentlyContinue)
  } catch { return (Test-Path -LiteralPath $lock) -and (((Get-Date) - (Get-Item -LiteralPath $lock).LastWriteTime).TotalSeconds -lt 10) }
}
function global:Invoke-ZeroWallPython {
  if (Test-ZeroWallWriter) {
    Write-Host 'Python is installing packages. Waiting up to 20 seconds; Ctrl+C cancels this command.'
    $deadline = (Get-Date).AddSeconds(20)
    while ((Test-ZeroWallWriter) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }
    if (Test-ZeroWallWriter) { Write-Warning 'Installation is still running. Wait for it to finish, or cancel it in Python settings, then retry.'; return }
  }
  $leases = Join-Path $env:ZEROWALL_PYTHON_MANAGEMENT_ROOT 'leases'
  [IO.Directory]::CreateDirectory($leases) | Out-Null
  $lease = Join-Path $leases ($PID.ToString() + '-' + [guid]::NewGuid().ToString() + '.json')
  try {
    [IO.File]::WriteAllText($lease, (@{pid=$PID;kind='terminal';snapshot=$env:ZEROWALL_PYTHON_RUNTIME_ROOT} | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
    if (Test-ZeroWallWriter) { Write-Warning 'A Python update started. Retry after it finishes.'; return }
    & $env:ZEROWALL_PYTHON_EXECUTABLE @args
    $global:LASTEXITCODE = $LASTEXITCODE
  } finally { [IO.File]::Delete($lease) }
}
function global:python { Invoke-ZeroWallPython @args }
function global:pip { Invoke-ZeroWallPython -m pip @args }
function global:pip3 { Invoke-ZeroWallPython -m pip @args }
function global:prompt { "[ZeroWall Python] $((Get-Location).Path)> " }
Write-Host ('ZeroWall Python: ' + $env:ZEROWALL_PYTHON_EXECUTABLE)
`
}

export async function openPythonShell(root: string): Promise<void> {
  if (process.platform !== 'win32') throw new Error('PYTHON_SHELL_UNSUPPORTED: Windows shell required.')
  const paths = await resolveFixedPythonRuntime(root)
  const runtime = await realpath(paths.root)
  if (resolve(await realpath(paths.executable)).toLowerCase() !== resolve(runtime, 'python.exe').toLowerCase()) throw new Error('PYTHON_FIXED_PATH_REQUIRED')
  const manager = join(runtime, '.zerowall')
  await mkdir(manager, { recursive: true })
  const file = join(manager, 'python-shell-plugin.ps1')
  // BOM is required by Windows PowerShell 5 for Chinese and other Unicode paths.
  const settings = await readFile(join(manager, 'settings.json'), 'utf8').then(JSON.parse, () => undefined)
  await writeFile(file, '\uFEFF' + pythonShellScript(runtime, resolveMirror(settings?.mirrorUrl).indexUrl), 'utf8')
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
  const command = `Start-Process -FilePath ${literal(powershell)} -ArgumentList @('-NoLogo','-NoProfile','-NoExit','-ExecutionPolicy','Bypass','-File','"' + ${literal(file)} + '"') -WorkingDirectory ${literal(runtime)}`
  await new Promise<void>((accept, reject) => {
    const child = spawn(powershell, ['-NoLogo', '-NoProfile', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: sanitizePythonTlsEnvironment() })
    let stderr = ''; child.stderr.on('data', data => { stderr = (stderr + data).slice(-2000) })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? accept() : reject(new Error('PYTHON_SHELL_FAILED: ' + stderr)))
  })
}
