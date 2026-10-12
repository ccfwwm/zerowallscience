$ErrorActionPreference = 'Stop'
$runtime = $env:ZEROWALL_PYTHON_RUNTIME_ROOT
if ([string]::IsNullOrWhiteSpace($runtime) -or $runtime -match '(^|[\\/])(\.zerowall|slots)([\\/]|$)') { throw 'PYTHON_FIXED_PATH_REQUIRED' }
$executable = Join-Path $runtime 'python.exe'
if ([IO.Path]::GetFullPath($env:ZEROWALL_PYTHON_EXECUTABLE) -ne [IO.Path]::GetFullPath($executable)) { throw 'PYTHON_FIXED_PATH_REQUIRED' }
$manager = Join-Path $runtime '.zerowall'
$lock = Join-Path $manager 'write-lock.json'
if (Test-Path -LiteralPath $lock) { throw 'PYTHON_RUNTIME_UPDATING' }
$leases = Join-Path $manager 'leases'
[IO.Directory]::CreateDirectory($leases) | Out-Null
$lease = Join-Path $leases ($PID.ToString() + '-' + [guid]::NewGuid().ToString() + '.json')
try {
  $json = @{pid=$PID;kind='terminal';snapshot=$runtime} | ConvertTo-Json -Compress
  [IO.File]::WriteAllText($lease, $json, [Text.UTF8Encoding]::new($false))
  if (Test-Path -LiteralPath $lock) { throw 'PYTHON_RUNTIME_UPDATING' }
  Remove-Item Env:PYTHONHOME,Env:PYTHONPATH,Env:VIRTUAL_ENV,Env:CONDA_PREFIX -ErrorAction SilentlyContinue
  $env:PYTHONNOUSERSITE = '1'
  $env:PYTHONUTF8 = '1'
  $env:PYTHONIOENCODING = 'utf-8'
  & $executable @args
  exit $LASTEXITCODE
} finally { [IO.File]::Delete($lease) }
