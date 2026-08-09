param(
  [string]$Version = "",
  [switch]$SkipLatest
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$target = "x86_64-pc-windows-msvc"
$version = if (-not [string]::IsNullOrWhiteSpace($Version)) { $Version } else { "env-$(Get-Date -Format yyyy.MM.dd.HHmmss)" }
$tempRoot = Join-Path $env:TEMP "zerowall-environment-$target"
$archive = Join-Path $env:TEMP "ZeroWall-Environment-$target.tar.gz"
$manifest = "$archive.json"
$bootstrapper = Join-Path $env:TEMP "ZeroWall-Environment-Bootstrapper-$target.exe"

foreach ($name in @("QINIU_ACCESS_KEY", "QINIU_SECRET_KEY", "ZEROWALL_ENV_UPDATE_PRIVATE_KEY")) {
  $value = [Environment]::GetEnvironmentVariable($name, "User")
  if ([string]::IsNullOrWhiteSpace($value)) { throw "$name is missing from the current user's environment" }
  Set-Item -Path "Env:$name" -Value $value
}
$defaults = @{
  QINIU_BUCKET = "zerowallscience"
  QINIU_REGION = "z2"
  QINIU_UPLOAD_URL = "https://up-z2.qiniup.com"
  QINIU_DOMAIN = "https://zerowall.chengxunkeji.cn"
}
foreach ($entry in $defaults.GetEnumerator()) {
  $value = [Environment]::GetEnvironmentVariable($entry.Key, "User")
  Set-Item -Path "Env:$($entry.Key)" -Value $(if ([string]::IsNullOrWhiteSpace($value)) { $entry.Value } else { $value })
}
$env:ZEROWALL_ENV_UPDATE_PUBLIC_KEY = node (Join-Path $root "scripts\environment\derive-public-key.mjs")
$env:ZEROWALL_ENV_MANIFEST_URL = "$env:QINIU_DOMAIN/environment/latest/index.json"
if ([string]::IsNullOrWhiteSpace($env:ZEROWALL_ENV_UPDATE_PUBLIC_KEY)) { throw "failed to derive environment update public key" }
$smokeNames = @(
  "ZEROWALL_SMOKE_API_KEY",
  "ZEROWALL_SMOKE_BASE_URL",
  "ZEROWALL_SMOKE_PROVIDER_ID",
  "ZEROWALL_SMOKE_MODEL_ID"
)
$smokeConfig = @{}
foreach ($name in $smokeNames) {
  $value = [Environment]::GetEnvironmentVariable($name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) {
    $value = [Environment]::GetEnvironmentVariable($name, "User")
  }
  if (-not [string]::IsNullOrWhiteSpace($value)) {
    $smokeConfig[$name] = $value
  }
}

if (Test-Path $tempRoot) { Remove-Item $tempRoot -Recurse -Force }
New-Item -ItemType Directory -Path $tempRoot | Out-Null
$gitCommand = Get-Command git -ErrorAction Stop
$gitRoot = Split-Path -Parent (Split-Path -Parent $gitCommand.Source)
$gitBash = Join-Path $gitRoot "bin\bash.exe"
if (-not (Test-Path -LiteralPath $gitBash -PathType Leaf)) {
  throw "Git Bash is required to prepare the pinned ACP runtimes"
}
Push-Location $root
try {
  & $gitBash "./scripts/dev/fetch-acp-runtimes.sh" $target
  if ($LASTEXITCODE -ne 0) { throw "failed to prepare the pinned ACP runtimes" }
} finally {
  Pop-Location
}
$codexNode = Join-Path $root "runtime\acp\codex\node\node.exe"
$claudeNode = Join-Path $root "runtime\acp\claude-code\node\node.exe"
$codexCli = Join-Path $root "runtime\acp\codex\bin\codex.cmd"
$claudeCli = Join-Path $root "runtime\acp\claude-code\bin\claude.cmd"
foreach ($requiredRuntime in @($codexNode, $claudeNode, $codexCli, $claudeCli)) {
  if (-not (Test-Path -LiteralPath $requiredRuntime -PathType Leaf)) {
    throw "required ACP runtime file is missing: $requiredRuntime"
  }
}
& $codexCli --version
if ($LASTEXITCODE -ne 0) { throw "Codex runtime health check failed" }
& $claudeCli --version
if ($LASTEXITCODE -ne 0) { throw "Claude Code runtime health check failed" }
node (Join-Path $root "scripts\build-mcp-proxy.mjs") $target
if ($LASTEXITCODE -ne 0) { throw "failed to build the MCP proxy" }
foreach ($name in @("opencode", "uv", "agent-browser", "claude-code-acp", "codex-acp", "zerowall-mcp-proxy")) {
  Copy-Item (Join-Path $root "apps\desktop\src-tauri\binaries\$name-$target.exe") (Join-Path $tempRoot "$name.exe")
}
Copy-Item (Join-Path $root "runtime\acp") (Join-Path $tempRoot "acp-runtime") -Recurse
Copy-Item (Join-Path $root "runtime\skills\core") (Join-Path $tempRoot "skills-core") -Recurse

if ($smokeConfig.Count -eq 0) {
  Write-Host "Skipping OpenCode transport smoke: no model credentials configured"
} elseif ($smokeConfig.Count -ne $smokeNames.Count) {
  throw "OpenCode smoke configuration is incomplete"
} else {
  $smokeWorkspace = Join-Path $env:TEMP "zerowall-opencode-smoke-workspace-$PID"
  if (Test-Path -LiteralPath $smokeWorkspace) {
    Remove-Item -LiteralPath $smokeWorkspace -Recurse -Force
  }
  New-Item -ItemType Directory -Path $smokeWorkspace | Out-Null
  try {
    $env:ZEROWALL_SMOKE_API_KEY = $smokeConfig["ZEROWALL_SMOKE_API_KEY"]
    $env:ZEROWALL_SMOKE_BASE_URL = $smokeConfig["ZEROWALL_SMOKE_BASE_URL"]
    node (Join-Path $root "scripts\environment\smoke-opencode-driver.mjs") `
      (Join-Path $tempRoot "opencode.exe") `
      $smokeWorkspace `
      $smokeConfig["ZEROWALL_SMOKE_PROVIDER_ID"] `
      $smokeConfig["ZEROWALL_SMOKE_MODEL_ID"]
    if ($LASTEXITCODE -ne 0) { throw "OpenCode transport smoke failed" }
  } finally {
    Remove-Item -LiteralPath $smokeWorkspace -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$uv = Join-Path $tempRoot "uv.exe"
$pythonInstall = Join-Path $tempRoot ".mcp-python-install"
& $uv --no-config python install 3.12.13 --install-dir $pythonInstall --no-registry --compile-bytecode
if ($LASTEXITCODE -ne 0) { throw "failed to install the integrated MCP Python runtime" }
$pythonSource = Get-ChildItem -Directory $pythonInstall |
  Where-Object { $_.Name -like "cpython-3.12.13-*" } |
  Select-Object -First 1
if (-not $pythonSource) { throw "integrated MCP Python directory was not created" }
$mcpPythonRoot = Join-Path $tempRoot "mcp-python"
Copy-Item $pythonSource.FullName $mcpPythonRoot -Recurse
$mcpPython = Join-Path $mcpPythonRoot "python.exe"
& $uv --no-config pip install --python $mcpPython --break-system-packages --requirements (Join-Path $root "runtime\mcp\requirements.txt") --compile-bytecode
if ($LASTEXITCODE -ne 0) { throw "failed to install the integrated MCP packages" }
$env:PYTHONNOUSERSITE = "1"
& $mcpPython -s -c "from importlib.metadata import version; [version(name) for name in ('jupyterlab', 'jupyter-mcp-server', 'paper-search-mcp', 'biomcp-python', 'mcp-materials-project', 'fred-mcp', 'spaceweather-mcp', 'mcp-weather-server', 'usgs-mcp', 'uniprot-mcp-server', 'wikipedia-mcp')]"
if ($LASTEXITCODE -ne 0) { throw "integrated MCP Python health check failed" }
node (Join-Path $root "scripts\environment\smoke-mcp-stdio.mjs") $mcpPython
if ($LASTEXITCODE -ne 0) { throw "integrated MCP stdio smoke test failed" }
Remove-Item -LiteralPath $pythonInstall -Recurse -Force

cargo build --manifest-path (Join-Path $root "apps\environment-bootstrapper\Cargo.toml") --release --target $target
Copy-Item (Join-Path $root "apps\environment-bootstrapper\target\$target\release\zerowall-environment-bootstrapper.exe") $bootstrapper
if (Test-Path $archive) { Remove-Item $archive -Force }
tar -czf $archive -C $tempRoot .
$archiveEntries = tar -tf $archive
if (-not ($archiveEntries -match '(^|/)mcp-python/python\.exe$')) {
  throw "published archive does not contain mcp-python/python.exe"
}
foreach ($requiredEntry in @(
  '(^|/)acp-runtime/codex/node/node\.exe$',
  '(^|/)acp-runtime/claude-code/node/node\.exe$',
  '(^|/)acp-runtime/codex/bin/codex\.cmd$',
  '(^|/)acp-runtime/claude-code/bin/claude\.cmd$'
)) {
  if (-not ($archiveEntries -match $requiredEntry)) {
    throw "published archive is missing an ACP runtime file: $requiredEntry"
  }
}
$archiveSmokeRoot = Join-Path $env:TEMP "zerowall-environment-archive-smoke-$PID"
if (Test-Path $archiveSmokeRoot) { Remove-Item -LiteralPath $archiveSmokeRoot -Recurse -Force }
New-Item -ItemType Directory -Path $archiveSmokeRoot | Out-Null
try {
  tar -xzf $archive -C $archiveSmokeRoot
  $archivePython = Join-Path $archiveSmokeRoot "mcp-python\python.exe"
  node (Join-Path $root "scripts\environment\smoke-mcp-stdio.mjs") $archivePython
  if ($LASTEXITCODE -ne 0) { throw "archived MCP stdio smoke test failed" }
  & (Join-Path $archiveSmokeRoot "acp-runtime\codex\bin\codex.cmd") --version
  if ($LASTEXITCODE -ne 0) { throw "archived Codex runtime health check failed" }
  & (Join-Path $archiveSmokeRoot "acp-runtime\claude-code\bin\claude.cmd") --version
  if ($LASTEXITCODE -ne 0) { throw "archived Claude Code runtime health check failed" }
} finally {
  Remove-Item -LiteralPath $archiveSmokeRoot -Recurse -Force -ErrorAction SilentlyContinue
}
$digest = (Get-FileHash -Algorithm SHA256 $archive).Hash.ToLower()
$size = (Get-Item $archive).Length
node (Join-Path $root "scripts\environment\build-manifest.mjs") --version $version --target $target --asset-name (Split-Path $archive -Leaf) --asset-url "$env:QINIU_DOMAIN/environment/$version/$target/ZeroWall-Environment-$target.tar.gz" --sha256 $digest --size $size --output $manifest
node (Join-Path $root "scripts\upload-qiniu-object.mjs") $archive "environment/$version/$target/ZeroWall-Environment-$target.tar.gz"
node (Join-Path $root "scripts\upload-qiniu-object.mjs") $manifest "environment/$version/$target/ZeroWall-Environment-$target.tar.gz.json"
node (Join-Path $root "scripts\upload-qiniu-object.mjs") $bootstrapper "environment/$version/$target/ZeroWall-Environment-Bootstrapper-$target.exe"
node (Join-Path $root "scripts\qiniu-release.mjs") verify "$env:QINIU_DOMAIN/environment/$version/$target/ZeroWall-Environment-$target.tar.gz" $size $digest
$manifestDigest = (Get-FileHash -Algorithm SHA256 $manifest).Hash.ToLower()
$manifestSize = (Get-Item $manifest).Length
node (Join-Path $root "scripts\qiniu-release.mjs") verify "$env:QINIU_DOMAIN/environment/$version/$target/ZeroWall-Environment-$target.tar.gz.json" $manifestSize $manifestDigest
if (-not $SkipLatest) {
  node (Join-Path $root "scripts\qiniu-release.mjs") promote-target $version "$target=$manifest"
}
Write-Host "Published Windows environment $version"
