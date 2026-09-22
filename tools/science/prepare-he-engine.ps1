param(
  [string]$Python = 'python',
  [string]$EngineRoot = (Join-Path $env:LOCALAPPDATA 'ZeroWallScience/science-engines/he-7.0.0'),
  [switch]$WithReferenceTools
)
$ErrorActionPreference = 'Stop'
$enginePython = Join-Path $EngineRoot 'venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $enginePython)) {
  & $Python -m venv (Join-Path $EngineRoot 'venv')
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated HE environment.' }
}
& $enginePython -m pip install --timeout 60 --retries 3 'openslide-python==1.4.6' 'openslide-bin==4.0.1.2' 'Pillow==11.3.0'
if ($LASTEXITCODE -ne 0) { throw 'OpenSlide dependency installation failed.' }
if ($WithReferenceTools) {
  & $enginePython -m pip install --timeout 60 --retries 3 'numpy==2.2.6' 'tifffile==2025.6.11'
  if ($LASTEXITCODE -ne 0) { throw 'HE reference tool installation failed.' }
}
& $enginePython -E -P -c 'import json,openslide; print(json.dumps({"engine":"openslide","python":__import__("sys").executable,"binding":openslide.__version__,"library":openslide.__library_version__}))'
if ($LASTEXITCODE -ne 0) { throw 'OpenSlide import/linked-library probe failed.' }
Write-Output "HE engine ready: $enginePython"
Write-Output 'The Host discovers the default directory; a custom directory requires ZEROWALL_HE_PYTHON.'
