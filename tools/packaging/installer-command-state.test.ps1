$ErrorActionPreference='Stop'
$helper=Join-Path $PSScriptRoot 'installer-command-state.ps1'
$id=[Guid]::NewGuid().ToString('N')
$key='Software\ZeroWallScience\InstallerRegression\'+$id
$environmentKey=$key+'\Environment'
$ownerKey=$key+'\Owner'
$mutex='Local\ZeroWallScience.InstallerRegression.'+$id
$directory=Join-Path ([IO.Path]::GetTempPath()) ('zws-command-regression-'+$id)
[void](New-Item -Path $directory -ItemType Directory)
$launcher=Join-Path $directory 'dsh.cmd'
$snapshot=Join-Path $directory 'snapshot.json'
$worker=Join-Path $directory 'command-path.ps1'
Set-Content -LiteralPath $launcher -Value '@exit /b 0'
function Assert([bool]$condition,[string]$message) { if (!$condition) { throw $message } }
function Capture { & $helper -Operation capture -Snapshot $snapshot -Directory $directory -EnvironmentKey $environmentKey -OwnerKey $ownerKey -MutexName $mutex }
function Restore { & $helper -Operation restore -Snapshot $snapshot -Directory $directory -EnvironmentKey $environmentKey -OwnerKey $ownerKey -MutexName $mutex }
function Install {
    $state=Invoke-DshCommandPath -Request @{operation='inspect';directory=$directory} -EnvironmentKey $environmentKey -OwnerKey $ownerKey -MachinePath '' -MutexName $mutex
    [void](Invoke-DshCommandPath -Request @{operation='install';directory=$directory;expected=$state.fingerprint} -EnvironmentKey $environmentKey -OwnerKey $ownerKey -MachinePath '' -MutexName $mutex)
}
try {
    # Exercise the same adapted worker that ships in the ZeroWall installer.
    # The upstream worker prepends PATH, whereas ZeroWall intentionally appends.
    $generator=([Uri][IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../commands/path-worker.mjs'))).AbsoluteUri
    & node --input-type=module --eval "const { writeFile } = await import('node:fs/promises'); const { commandPathWorker } = await import(process.argv[1]); await writeFile(process.argv[2], await commandPathWorker());" $generator $worker
    if ($LASTEXITCODE -ne 0) { throw 'Failed to generate the shipped command PATH worker' }
    . $worker
    $environment=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($environmentKey)
    $owner=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($ownerKey)
    try {
        $old='C:\Existing Science\commands'
        $originalPath='C:\First;'+$old+';C:\Last;;%ExistingReference%'
        $environment.SetValue('Path',$originalPath,[Microsoft.Win32.RegistryValueKind]::ExpandString)
        $owner.SetValue('Directory',$old,[Microsoft.Win32.RegistryValueKind]::String)
        $owner.SetValue('PathWasAbsent',0,[Microsoft.Win32.RegistryValueKind]::DWord)
        $owner.SetValue('RetainedEntries',0,[Microsoft.Win32.RegistryValueKind]::DWord)
        $owner.SetValue('OtherUserValue','preserve')
    } finally { $environment.Dispose(); $owner.Dispose() }
    Capture; Install
    $environment=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($environmentKey)
    try {
        Assert ($environment.GetValue('Path','',[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) -ceq ('C:\First;C:\Last;;%ExistingReference%;'+$directory)) 'Installer must append its command directory'
    } finally { $environment.Dispose() }
    Restore
    $environment=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($environmentKey)
    $owner=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($ownerKey)
    try {
        Assert ($environment.GetValue('Path','',[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) -ceq $originalPath) 'PATH order/value changed'
        Assert ($environment.GetValueKind('Path') -eq [Microsoft.Win32.RegistryValueKind]::ExpandString) 'PATH kind changed'
        Assert ($owner.GetValue('Directory') -ceq $old) 'Original command owner not restored'
        Assert ($owner.GetValue('OtherUserValue') -ceq 'preserve') 'Unrelated registry value changed'
    } finally { $environment.Dispose(); $owner.Dispose() }
    Restore # Installer failed before registration; no-op.
    Install
    $environment=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($environmentKey,$true)
    try {
        $concurrent=$environment.GetValue('Path','',[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)+';C:\Concurrent'
        $environment.SetValue('Path',$concurrent,[Microsoft.Win32.RegistryValueKind]::ExpandString)
    } finally { $environment.Dispose() }
    $rejected=$false
    try { Restore } catch { $rejected=$_.Exception.Message -like '*refusing to overwrite*' }
    Assert $rejected 'Concurrent edit was not rejected'
    $environment=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($environmentKey,$true)
    $owner=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($ownerKey,$true)
    try {
        Assert ($environment.GetValue('Path','',[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) -ceq $concurrent) 'Concurrent edit was changed'
        $environment.DeleteValue('Path',$false)
        foreach ($name in @('Directory','PathWasAbsent','RetainedEntries')) { $owner.DeleteValue($name,$false) }
    } finally { $environment.Dispose(); $owner.Dispose() }
    Capture; Install; Restore
    $environment=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($environmentKey,$true)
    $owner=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($ownerKey)
    try {
        Assert ('Path' -notin $environment.GetValueNames()) 'Originally absent PATH must remain absent'
        Assert ('Directory' -notin $owner.GetValueNames()) 'Originally absent command owner must remain absent'
        Assert ($owner.GetValue('OtherUserValue') -ceq 'preserve') 'Unrelated registry value changed'
        # String PATH and an existing identical entry must preserve kind and duplicate ownership.
        $environment.SetValue('Path',$directory+';C:\Existing',[Microsoft.Win32.RegistryValueKind]::String)
    } finally { $environment.Dispose(); $owner.Dispose() }
    Capture; Install; Restore
    $environment=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($environmentKey)
    try {
        Assert ($environment.GetValue('Path') -ceq ($directory+';C:\Existing')) 'Pre-existing identical entry changed'
        Assert ($environment.GetValueKind('Path') -eq [Microsoft.Win32.RegistryValueKind]::String) 'String PATH kind changed'
    } finally { $environment.Dispose() }
    # An old managed entry can coexist with a retained user-owned duplicate.
    # Remove exactly one occurrence and restore both original occurrences.
    $environment=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($environmentKey,$true)
    $owner=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($ownerKey,$true)
    try {
        $duplicatePath='C:\First;'+$old+';C:\Middle;'+$old+';C:\Last'
        $environment.SetValue('Path',$duplicatePath,[Microsoft.Win32.RegistryValueKind]::String)
        $owner.SetValue('Directory',$old,[Microsoft.Win32.RegistryValueKind]::String)
        $owner.SetValue('PathWasAbsent',0,[Microsoft.Win32.RegistryValueKind]::DWord)
        $owner.SetValue('RetainedEntries',1,[Microsoft.Win32.RegistryValueKind]::DWord)
    } finally { $environment.Dispose(); $owner.Dispose() }
    Capture; Install
    $environment=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($environmentKey)
    try {
        Assert ($environment.GetValue('Path') -ceq ('C:\First;C:\Middle;'+$old+';C:\Last;'+$directory)) 'Retained duplicate or append order changed'
    } finally { $environment.Dispose() }
    Restore
    $environment=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($environmentKey)
    $owner=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($ownerKey)
    try {
        Assert ($environment.GetValue('Path') -ceq $duplicatePath) 'Old owner duplicates were not restored exactly'
        Assert ($environment.GetValueKind('Path') -eq [Microsoft.Win32.RegistryValueKind]::String) 'Duplicate PATH kind changed'
        Assert ($owner.GetValue('Directory') -ceq $old) 'Duplicate owner not restored'
        Assert ($owner.GetValue('RetainedEntries') -eq 1) 'Retained duplicate ownership not restored'
        Assert ($owner.GetValue('OtherUserValue') -ceq 'preserve') 'Unrelated registry value changed'
    } finally { $environment.Dispose(); $owner.Dispose() }
    Write-Output 'Command restoration passed: shipped append order, exact order/kind, no-op, concurrent-edit refusal, absent PATH/owner, pre-existing entries and retained owner duplicates.'
} finally {
    [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($key,$false)
    Remove-Item -LiteralPath $launcher,$snapshot,$worker -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $directory -ErrorAction SilentlyContinue
}
