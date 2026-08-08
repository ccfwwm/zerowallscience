param(
  [string]$Version,
  [switch]$SkipLatest
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$target = "x86_64-pc-windows-msvc"
$version = if (-not [string]::IsNullOrWhiteSpace($Version)) { $Version } else { "env-$(Get-Date -Format yyyy.MM.dd).1" }
$tempRoot = Join-Path $env:TEMP "zerowall-environment-$target"
$archive = Join-Path $env:TEMP "ZeroWall-Environment-$target.tar.gz"
$manifest = "$archive.json"
$bootstrapper = Join-Path $env:TEMP "ZeroWall-Environment-Bootstrapper-$target.exe"

foreach ($name in @("QINIU_ACCESS_KEY", "QINIU_SECRET_KEY", "QINIU_BUCKET", "QINIU_UPLOAD_URL", "QINIU_DOMAIN", "ZEROWALL_ENV_UPDATE_PRIVATE_KEY")) {
  $value = [Environment]::GetEnvironmentVariable($name, "User")
  if ([string]::IsNullOrWhiteSpace($value)) { throw "$name is missing from the current user's environment" }
  Set-Item -Path "Env:$name" -Value $value
}
$env:QINIU_REGION = [Environment]::GetEnvironmentVariable("QINIU_REGION", "User")

if (Test-Path $tempRoot) { Remove-Item $tempRoot -Recurse -Force }
New-Item -ItemType Directory -Path $tempRoot | Out-Null
foreach ($name in @("opencode", "uv", "agent-browser", "claude-code-acp", "codex-acp", "zerowall-mcp-proxy")) {
  Copy-Item (Join-Path $root "apps\desktop\src-tauri\binaries\$name-$target.exe") (Join-Path $tempRoot "$name.exe")
}
Copy-Item (Join-Path $root "runtime\acp") (Join-Path $tempRoot "acp-runtime") -Recurse
Copy-Item (Join-Path $root "runtime\skills\core") (Join-Path $tempRoot "skills-core") -Recurse

cargo build --manifest-path (Join-Path $root "apps\environment-bootstrapper\Cargo.toml") --release --target $target
Copy-Item (Join-Path $root "apps\environment-bootstrapper\target\$target\release\zerowall-environment-bootstrapper.exe") $bootstrapper
if (Test-Path $archive) { Remove-Item $archive -Force }
tar -czf $archive -C $tempRoot .
$digest = (Get-FileHash -Algorithm SHA256 $archive).Hash.ToLower()
$size = (Get-Item $archive).Length
node (Join-Path $root "scripts\environment\build-manifest.mjs") --version $version --target $target --asset-name (Split-Path $archive -Leaf) --asset-url "$env:QINIU_DOMAIN/environment/$version/$target/ZeroWall-Environment-$target.tar.gz" --sha256 $digest --size $size --output $manifest
node (Join-Path $root "scripts\upload-qiniu-object.mjs") $archive "environment/$version/$target/ZeroWall-Environment-$target.tar.gz"
node (Join-Path $root "scripts\upload-qiniu-object.mjs") $manifest "environment/$version/$target/ZeroWall-Environment-$target.tar.gz.json"
node (Join-Path $root "scripts\upload-qiniu-object.mjs") $bootstrapper "environment/$version/$target/ZeroWall-Environment-Bootstrapper-$target.exe"
node (Join-Path $root "scripts\qiniu-release.mjs") verify "$env:QINIU_DOMAIN/environment/$version/$target/ZeroWall-Environment-$target.tar.gz" $size $digest
if (-not $SkipLatest) {
  node (Join-Path $root "scripts\qiniu-release.mjs") promote $version "$target=$manifest"
}
Write-Host "Published Windows environment $version"
