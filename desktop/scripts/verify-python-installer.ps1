param([Parameter(Mandatory=$true)][string]$Installer, [Parameter(Mandatory=$true)][string]$VerificationRoot, [string]$PreviousInstaller, [switch]$UpgradeOnly, [switch]$LifecycleOnly)
$ErrorActionPreference = 'Stop'
if ($UpgradeOnly -and !$PreviousInstaller) { throw 'UpgradeOnly requires the previous installer; full lifecycle acceptance is separate.' }
if ($LifecycleOnly -and ($PreviousInstaller -or $UpgradeOnly)) { throw 'LifecycleOnly requires an already verified installation.' }
$verification = [IO.Path]::GetFullPath($VerificationRoot)
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if (!$verification.StartsWith((Join-Path $workspace 'artifacts\verification\') , [StringComparison]::OrdinalIgnoreCase)) { throw 'Installer acceptance output must stay in the workspace verification directory.' }
$installation = Join-Path $verification '安装 目录\ZeroWallScience'
if ($LifecycleOnly) {
  $existingReceipt = Get-Content -LiteralPath (Join-Path $verification 'electron\receipt.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if (!$existingReceipt.complete -or $existingReceipt.installation -ne $installation -or !(Test-Path -LiteralPath (Join-Path $installation 'Python\python.exe'))) { throw 'LifecycleOnly requires successful real Electron/Python acceptance in this verification directory.' }
  Copy-Item -LiteralPath (Join-Path $verification 'nsis-receipt.json') -Destination (Join-Path $verification 'nsis-upgrade-receipt.json')
}
New-Item -ItemType Directory -Force -Path $verification | Out-Null
$backup = Join-Path $verification 'host-restore'
New-Item -ItemType Directory -Force -Path $backup | Out-Null
# Back up only the application's registration and its PATH ownership record.
$guid = '8e9e4db6-6ff4-5ad0-93b2-1600e3ae6551'
$keys = @("HKCU\Software\$guid", "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\$guid", 'HKCU\Software\ZeroWallScience\Command')
$savedKeys = @()
for ($index=0; $index -lt $keys.Count; $index++) {
  $key = $keys[$index]; $file = Join-Path $backup "registry-$index.reg"
  if (Test-Path -LiteralPath ('Registry::HKEY_CURRENT_USER\'+$key.Substring(5))) { & reg.exe export $key $file /y | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'Registry backup failed' }; $savedKeys += @{Key=$key; File=$file} }
}
$environment = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')
try { $pathValue = $environment.GetValue('Path', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); $pathKind = if ($null -ne $pathValue) { $environment.GetValueKind('Path') } else { $null } } finally { $environment.Dispose() }
$shortcuts = @()
foreach ($folder in @([Environment]::GetFolderPath('DesktopDirectory'), [Environment]::GetFolderPath('Programs'))) {
  $target = Join-Path $folder 'ZeroWall Science.lnk'; $saved = Join-Path $backup ('shortcut-'+$shortcuts.Count+'.lnk')
  $exists = Test-Path -LiteralPath $target -PathType Leaf
  if ($exists) { Copy-Item -LiteralPath $target -Destination $saved }
  $shortcuts += @{Target=$target; Saved=$saved; Exists=$exists}
}
function Install-VerifiedApplication {
  param([string]$SelectedInstaller=$Installer)
  # NSIS /D consumes the unquoted remainder of the command line, including spaces.
  $process = Start-Process -FilePath $SelectedInstaller -ArgumentList @('/S', '/currentuser', '/no-launch', ('/D='+$installation)) -WindowStyle Hidden -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "NSIS installation failed: $($process.ExitCode)" }
  if (!(Test-Path -LiteralPath (Join-Path $installation 'ZeroWallScience.exe'))) { throw 'NSIS did not install the expected executable.' }
}
try {
  if ($PreviousInstaller) {
    # An old installer may invoke the uninstaller from the real HKCU record.
    # Hide only these backed-up registration keys so its isolated first install
    # cannot uninstall the user's live application. The finally block restores
    # them together with PATH and shortcuts on success or failure.
    foreach ($key in $keys) {
      if (Test-Path -LiteralPath ('Registry::HKEY_CURRENT_USER\'+$key.Substring(5))) {
        & reg.exe delete $key /f | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not isolate the previous installer registration.' }
      }
    }
    Install-VerifiedApplication -SelectedInstaller $PreviousInstaller
    $legacyOfflineFile=Join-Path $installation 'resources\offline-profile\profile-runtime.asar.unpacked\node_modules\@zerowallscience\plugin-mcp\src\client\PythonEnvironmentPanel.module.css'
    if (!(Test-Path -LiteralPath $legacyOfflineFile -PathType Leaf)) { throw 'Previous-version acceptance fixture did not contain the known obsolete runtime file.' }
    $legacySlot=Join-Path $installation 'Python\.zerowall\slots\legacy-8.1.2'
    New-Item -ItemType Directory -Force -Path $legacySlot | Out-Null
    Set-Content -LiteralPath (Join-Path $legacySlot 'preserve.txt') -Value 'legacy-not-migrated' -Encoding utf8
  }
  if (!$LifecycleOnly) { Install-VerifiedApplication }
  if ($PreviousInstaller) {
    if (Test-Path -LiteralPath $legacyOfflineFile) { throw 'Obsolete runtime file remains inside the active signed closure.' }
    if (Test-Path -LiteralPath (Join-Path $installation 'resources\installer-recovery')) { throw 'Upgrade created an unwanted obsolete-runtime backup.' }
  }
  if (!$LifecycleOnly) {
    & node.exe (Join-Path $PSScriptRoot 'verify-fixed-python-electron.mjs') $installation (Join-Path $verification 'electron')
    if ($LASTEXITCODE -ne 0) { throw 'Installed Electron Python acceptance failed.' }
  }
  $python = Join-Path $installation 'Python\python.exe'; $before = (Get-FileHash -LiteralPath $python -Algorithm SHA256).Hash
  if ($UpgradeOnly) {
    if (!(Test-Path -LiteralPath (Join-Path $legacySlot 'preserve.txt'))) { throw 'Legacy slot was removed during upgrade.' }
    if ((Get-Content -LiteralPath (Join-Path $legacySlot 'preserve.txt') -Raw).Trim() -ne 'legacy-not-migrated') { throw 'Legacy slot content was changed.' }
    @{complete=$true; mode='previous-version-upgrade'; installation=$installation; previousInstaller=$PreviousInstaller; pythonSHA256=$before; legacySlotPreserved=$true; fixedPythonVerified=$true; obsoleteRuntimeDeleted=$true; noObsoleteRuntimeBackup=$true} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $verification 'nsis-receipt.json') -Encoding utf8
    return
  }
  $userFile = Join-Path $installation 'resources\user-added.txt'; Set-Content -LiteralPath $userFile -Value 'preserved-user-content' -Encoding utf8
  Install-VerifiedApplication
  if ((Get-FileHash -LiteralPath $python -Algorithm SHA256).Hash -ne $before) { throw 'Upgrade changed Python.' }
  if (!(Test-Path -LiteralPath $userFile)) { throw 'Upgrade removed an unowned resource file.' }
  $uninstaller = Join-Path $installation 'Uninstall ZeroWallScience.exe'
  $process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "NSIS uninstall failed: $($process.ExitCode)" }
  if ((Get-FileHash -LiteralPath $python -Algorithm SHA256).Hash -ne $before) { throw 'Uninstall removed Python.' }
  if (!(Test-Path -LiteralPath $userFile)) { throw 'Uninstall removed an unowned resource file.' }
  Install-VerifiedApplication
  if ((Get-FileHash -LiteralPath $python -Algorithm SHA256).Hash -ne $before) { throw 'Reinstall changed preserved Python.' }
  if ($PreviousInstaller -and !(Test-Path -LiteralPath (Join-Path $legacySlot 'preserve.txt'))) { throw 'Legacy slot was removed during upgrade.' }
  @{complete=$true; installation=$installation; previousInstaller=$PreviousInstaller; pythonSHA256=$before; upgradePreserved=$true; uninstallPreserved=$true; reinstallPreserved=$true} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $verification 'nsis-receipt.json') -Encoding utf8
} finally {
  # Restore the user's original registration, PATH and shortcuts even on failure.
  foreach ($key in $keys) { if (Test-Path -LiteralPath ('Registry::HKEY_CURRENT_USER\'+$key.Substring(5))) { & reg.exe delete $key /f | Out-Null } }
  foreach ($saved in $savedKeys) { & reg.exe import $saved.File | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'Application registration restore failed.' } }
  $environment = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
  try { if ($null -eq $pathValue) { $environment.DeleteValue('Path', $false) } else { $environment.SetValue('Path', $pathValue, $pathKind) } } finally { $environment.Dispose() }
  foreach ($shortcut in $shortcuts) { if ($shortcut.Exists) { Copy-Item -LiteralPath $shortcut.Saved -Destination $shortcut.Target -Force } elseif (Test-Path -LiteralPath $shortcut.Target) { Remove-Item -LiteralPath $shortcut.Target -Force } }
}
