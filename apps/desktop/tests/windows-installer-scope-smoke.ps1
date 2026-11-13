<# Both registry scopes use the fixture's unique identity; production installations are never targets. #>
[CmdletBinding()]
param([Parameter(Mandatory)][string]$FixtureDirectory, [string]$Language = 'zh_CN')
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Scope tests require an elevated PowerShell process' }
$fixture = Get-Content (Join-Path $FixtureDirectory 'fixture.json') -Raw | ConvertFrom-Json
if ($fixture.productName -notmatch '^Harness Installer Test [a-f0-9]{8}$' -or $fixture.guid -notmatch '^[a-f0-9-]{36}$') { throw 'A private installer fixture is required' }
$output = Join-Path $FixtureDirectory $Language
$installer = Join-Path $output 'installer-test.exe'
$userPath = Join-Path $output 'Scope Current User'
$machinePath = Join-Path $env:ProgramW6432 ('HarnessInstallerScope-' + $fixture.guid)
$registry = 'Software\' + $fixture.guid
$results = [Collections.Generic.List[string]]::new()
$copy = (Get-Content (Join-Path $PSScriptRoot "../installer/locales/$Language.json") -Encoding UTF8 -Raw | ConvertFrom-Json).strings
. (Join-Path $PSScriptRoot 'windows-installer-ui.ps1')
[InstallerCapture]::Initialize()
[InstallerCapture]::ProductName = $fixture.productName
function Run-Setup([string]$Arguments, [int]$Expected = 0) {
    $process = Start-Process -FilePath $installer -ArgumentList $Arguments -PassThru -WindowStyle Hidden
    try {
        if (-not $process.WaitForExit(60000)) { $process.Kill(); $process.WaitForExit(); throw 'Scope installer timed out' }
        if ($process.ExitCode -ne $Expected) { throw "Scope installer returned $($process.ExitCode), expected $Expected for $Arguments" }
    } finally { $process.Dispose() }
}
function Assert-Installed([string]$Hive, [string]$Path, [string]$Flag) {
    $entry = Get-ItemProperty ($Hive + ':\' + $registry)
    if ($entry.InstallLocation -ne $Path -or -not (Test-Path -LiteralPath (Join-Path $Path ($fixture.productName + '.exe')))) { throw "Missing $Hive installation" }
    $uninstall = Get-ItemProperty ($Hive + ':\Software\Microsoft\Windows\CurrentVersion\Uninstall\' + $fixture.guid)
    if ($uninstall.InstallLocation -ne $Path -or $uninstall.QuietUninstallString -notlike ('*' + $Flag + ' /S')) { throw "Wrong $Hive uninstall registration" }
}
function Assert-Welcome([int]$State, [string]$Path) {
    $process = Start-Process -FilePath $installer -ArgumentList '/THEME=dark' -PassThru
    try {
        $timer = [Diagnostics.Stopwatch]::StartNew()
        do {
            $window = [InstallerCapture]::Find($process.Id)
            $control = [InstallerCapture]::FindButton($process.Id, $copy.INSTALLER_ALL_USERS)
            if ($window -ne [IntPtr]::Zero -and $control -ne [IntPtr]::Zero) { break }
            if ($process.HasExited -or $timer.ElapsedMilliseconds -gt 15000) { throw 'Scope selector did not appear' }
            Start-Sleep -Milliseconds 25
        } while ($true)
        $actualState = [InstallerCapture]::SendMessage($control, 0xF0, [IntPtr]::Zero, [IntPtr]::Zero).ToInt32()
        if ($actualState -ne $State) { throw "Wrong default installation scope: expected $State, received $actualState for $Path" }
        if ([InstallerCapture]::FindText($process.Id, $Path) -eq [IntPtr]::Zero) { throw 'Wrong default installation directory' }
    } finally {
        if (-not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
        $process.Dispose()
    }
}
function Remove-Fixture([string]$Path, [string]$Flag) {
    $uninstaller = Join-Path $Path ('Uninstall ' + $fixture.productName + '.exe')
    if (-not (Test-Path -LiteralPath $uninstaller)) { return }
    $process = Start-Process -FilePath $uninstaller -ArgumentList ("/S $Flag") -PassThru -WindowStyle Hidden
    try {
        if (-not $process.WaitForExit(60000)) { $process.Kill(); $process.WaitForExit(); throw 'Scope uninstall timed out' }
        $hive = 'HKCU'
        if ($Flag -eq '/allusers') { $hive = 'HKLM' }
        $installKey = $hive + ':\' + $registry
        $uninstallKey = $hive + ':\Software\Microsoft\Windows\CurrentVersion\Uninstall\' + $fixture.guid
        $timer = [Diagnostics.Stopwatch]::StartNew()
        while ((Test-Path -LiteralPath (Join-Path $Path ($fixture.productName + '.exe'))) -or (Test-Path $installKey) -or (Test-Path $uninstallKey)) {
            if ($timer.ElapsedMilliseconds -gt 20000) { throw "Scope uninstall did not remove its payload and $hive registrations" }
            Start-Sleep -Milliseconds 25
        }
    } finally { $process.Dispose() }
}
try {
    Run-Setup ('/S /currentuser /D=' + $userPath)
    Assert-Installed HKCU $userPath '/currentuser'
    $results.Add('current-user-custom-directory-and-uninstall-registration')
    Run-Setup ('/S /allusers /D=' + $machinePath)
    Assert-Installed HKLM $machinePath '/allusers'
    Assert-Installed HKCU $userPath '/currentuser'
    $results.Add('all-users-program-files-and-coexisting-user-installation')
    Assert-Welcome 0 $userPath
    $results.Add('dual-scope-manual-install-defaults-to-current-user')
    Set-Content -LiteralPath (Join-Path $userPath 'scope-sentinel.txt') -Value 'current-user'
    Run-Setup ('/S --updated /D=' + $machinePath)
    Assert-Installed HKLM $machinePath '/allusers'
    if ((Get-Content (Join-Path $userPath 'scope-sentinel.txt')) -ne 'current-user') { throw 'Machine update changed current-user files' }
    $results.Add('automatic-update-matches-machine-directory')
    Set-Content -LiteralPath (Join-Path $machinePath 'scope-sentinel.txt') -Value 'machine'
    Run-Setup ('/S --updated /D=' + $userPath)
    Assert-Installed HKCU $userPath '/currentuser'
    if ((Get-Content (Join-Path $machinePath 'scope-sentinel.txt')) -ne 'machine') { throw 'User update changed machine files' }
    $results.Add('automatic-update-matches-user-directory')
    Run-Setup '/S --updated' 2
    Run-Setup ('/S --updated /D=' + (Join-Path $output 'Unregistered')) 2
    Run-Setup ('/S /allusers /D=' + $userPath) 2
    Run-Setup ('/S /currentuser /D=' + $machinePath) 2
    $results.Add('ambiguous-update-and-cross-scope-destinations-rejected')
    Run-Setup ('/S /allusers /D=' + $env:ProgramW6432) 2
    Run-Setup ('/S /allusers /D=' + (Join-Path $env:windir 'HarnessScopeTest')) 2
    $foreign = Join-Path $output 'Scope Foreign'
    New-Item -ItemType Directory -Force -Path $foreign | Out-Null
    Set-Content (Join-Path $foreign 'keep.txt') 'preserved'
    Run-Setup ('/S /allusers /D=' + $foreign) 2
    $linked = Join-Path $output 'Scope Junction'
    New-Item -ItemType Junction -Path $linked -Target $foreign | Out-Null
    try { Run-Setup ('/S /allusers /D=' + (Join-Path $linked 'App')) 2 }
    finally { [IO.Directory]::Delete($linked) }
    if ((Get-Content (Join-Path $foreign 'keep.txt')) -ne 'preserved') { throw 'Rejected destination was modified' }
    $results.Add('machine-root-system-foreign-and-reparse-destinations-rejected')
    $app = Join-Path $machinePath ($fixture.productName + '.exe')
    $before = (Get-FileHash -LiteralPath $app -Algorithm SHA256).Hash
    $locked = [IO.File]::Open($app, 'Open', 'Read', 'Read')
    try { Run-Setup ('/S --updated /D=' + $machinePath) 2 } finally { $locked.Dispose() }
    if ((Get-FileHash -LiteralPath $app -Algorithm SHA256).Hash -ne $before) { throw 'Failed machine update damaged existing files' }
    $results.Add('locked-machine-update-preserves-installed-payload')
    Remove-Fixture $userPath '/currentuser'
    Assert-Installed HKLM $machinePath '/allusers'
    Assert-Welcome 1 $machinePath
    Run-Setup '/S --updated'
    Assert-Installed HKLM $machinePath '/allusers'
    $results.Add('single-machine-install-retains-scope-and-directory')
    Remove-Fixture $machinePath '/allusers'
    if ((Test-Path ('HKLM:\' + $registry)) -or (Test-Path ('HKCU:\' + $registry))) { throw 'Uninstall left a fixture registration' }
    $results.Add('both-uninstall-registrations-removed-independently')
    $results | ConvertTo-Json | Set-Content (Join-Path $output 'scope-results.json') -Encoding UTF8
    $results | ForEach-Object { Write-Output "PASS: $_" }
} catch {
    $results | ConvertTo-Json | Set-Content (Join-Path $output 'scope-progress.json') -Encoding UTF8
    $_ | Out-String | Set-Content (Join-Path $output 'scope-error.txt') -Encoding UTF8
    throw
} finally {
    Remove-Fixture $userPath '/currentuser'
    Remove-Fixture $machinePath '/allusers'
}
