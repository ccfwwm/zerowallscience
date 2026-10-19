param([string]$OldInstallRoot, [Parameter(Mandatory=$true)][string]$InstallRoot)
$ErrorActionPreference = 'Stop'
if (!$OldInstallRoot) { exit 0 }
$previous = [IO.Path]::GetFullPath($OldInstallRoot).TrimEnd('\')
$current = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
if ($previous -ieq $current) { exit 0 }
$runtime = Join-Path $previous 'Python'
if (!(Test-Path -LiteralPath $runtime -PathType Container)) { exit 0 }
if ((Get-Item -LiteralPath $runtime -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked previous Python root refused.' }
$location = Join-Path $env:LOCALAPPDATA 'ZeroWall Science\python-location.json'
if (Test-Path -LiteralPath $location) {
  $saved = Get-Content -LiteralPath $location -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($saved.source -ne 'install-default') { exit 0 }
}
New-Item -ItemType Directory -Path (Split-Path $location) -Force | Out-Null
$temporary = $location + '.' + [guid]::NewGuid().ToString() + '.tmp'
$document = @{runtimeRoot=$runtime;source='user-selected';reason='preserved-install-directory-change'} | ConvertTo-Json
[IO.File]::WriteAllText($temporary,$document,[Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporary -Destination $location -Force
Write-Output 'Existing fixed Python path preserved for the original user.'
