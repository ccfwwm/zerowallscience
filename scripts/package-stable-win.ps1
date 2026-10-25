$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

function Invoke-PnpmStep {
  param([string[]]$Arguments)

  Write-Host "`n> pnpm $($Arguments -join ' ')"
  & pnpm @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

try {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'This packaging entry point is for Windows x64.'
  }

  Invoke-PnpmStep @('release:sync')
  $version = node -p "require('./package.json').version"
  if ($LASTEXITCODE -ne 0) { throw 'Could not read the synchronized desktop version.' }

  $stable = Get-Content config/build/stable.json -Raw | ConvertFrom-Json
  $pathsJson = node tools/build/print-paths.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the artifact path contract.' }
  $paths = ($pathsJson -join [Environment]::NewLine) | ConvertFrom-Json

  $expectedArtifacts = [IO.Path]::GetFullPath((Join-Path $repoRoot 'artifacts'))
  $expectedPackage = [IO.Path]::GetFullPath((Join-Path $repoRoot "artifacts/packages/$version/windows-x64"))
  if ($stable.target -ne 'windows-x64' -or
      [IO.Path]::GetFullPath($paths.artifacts) -ine $expectedArtifacts -or
      [IO.Path]::GetFullPath($paths.packages) -ine $expectedPackage) {
    throw "Package path contract does not resolve to artifacts/packages/$version/windows-x64. Check ZEROWALL_ARTIFACT_ROOT and ZEROWALL_PACKAGE_OUTPUT."
  }

  $installer = Join-Path $expectedPackage "zerowall-science-$version-win-x64.exe"
  if (Test-Path -LiteralPath $installer) {
    throw "Stable installer already exists at $installer. Set a new version in config/build/desktop-release.json; published bytes are immutable."
  }

  Invoke-PnpmStep @('plugins:generate')
  Invoke-PnpmStep @('profiles:generate')
  Invoke-PnpmStep @('version:check')
  Invoke-PnpmStep @('profiles:check')
  Invoke-PnpmStep @('dsh:verify')
  Invoke-PnpmStep @('package:stable:win')

  if (-not (Test-Path -LiteralPath $installer)) {
    throw "Packaging completed without the expected installer: $installer"
  }
  $file = Get-Item -LiteralPath $installer
  $hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest = Get-Content (Join-Path $expectedPackage 'artifact-manifest.json') -Raw | ConvertFrom-Json

  Write-Host "`nPackage: $($file.FullName)"
  Write-Host "Build ID: $($manifest.buildId)"
  Write-Host "Size: $($file.Length) bytes"
  Write-Host "SHA-256: $hash"
} catch {
  Write-Error $_
  exit 1
}
