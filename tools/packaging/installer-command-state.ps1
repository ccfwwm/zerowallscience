param(
    [Parameter(Mandatory=$true)][ValidateSet('capture','restore')][string]$Operation,
    [Parameter(Mandatory=$true)][string]$Snapshot,
    [Parameter(Mandatory=$true)][string]$Directory,
    [string]$EnvironmentKey='Environment',
    [string]$OwnerKey='Software\ZeroWallScience\Command',
    [string]$MutexName=('Global\ZeroWallScience.Command.'+[Security.Principal.WindowsIdentity]::GetCurrent().User.Value)
)
$ErrorActionPreference = 'Stop'
$directoryPath = [IO.Path]::GetFullPath($Directory)
$fields = @('Directory','PathWasAbsent','RetainedEntries')
function Read-State {
    $state = [ordered]@{ path=$null; owner=[ordered]@{} }
    foreach ($pair in @(@{key=$EnvironmentKey;names=@('Path')}, @{key=$OwnerKey;names=$fields})) {
        $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($pair.key)
        try {
            foreach ($name in $pair.names) {
                $value = $null
                if ($key -and $name -in $key.GetValueNames()) {
                    $value = [ordered]@{ value=$key.GetValue($name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); kind=[string]$key.GetValueKind($name) }
                }
                if ($name -eq 'Path') { $state.path=$value } else { $state.owner[$name]=$value }
            }
        } finally { if ($key) { $key.Dispose() } }
    }
    return $state
}
$mutex = [Threading.Mutex]::new($false,$MutexName)
$locked = $false
try {
    try { $locked=$mutex.WaitOne(5000) } catch [Threading.AbandonedMutexException] { $locked=$true }
    if (-not $locked) { throw 'Another command-management operation is running.' }
    $current = Read-State
    if ($Operation -eq 'capture') {
        [ordered]@{ directory=$directoryPath; environmentKey=$EnvironmentKey; ownerKey=$OwnerKey; state=$current } |
            ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $Snapshot -Encoding UTF8
        Write-Output 'Captured command registration without printing PATH.'
        return
    }
    $saved = Get-Content -LiteralPath $Snapshot -Raw | ConvertFrom-Json
    if ($saved.directory -cne $directoryPath -or $saved.environmentKey -cne $EnvironmentKey -or $saved.ownerKey -cne $OwnerKey) { throw 'Command snapshot belongs to another installation.' }
    $before = $saved.state
    # An installer that failed before registration has nothing to restore.
    if (($current | ConvertTo-Json -Depth 6 -Compress) -ceq ($before | ConvertTo-Json -Depth 6 -Compress)) { return }
    $parts = if ($null -eq $before.path) { @() } else { @(([string]$before.path.value).Split(';')) }
    $owned = $before.owner.Directory.value
    $retained = [int]$before.owner.RetainedEntries.value
    $kept = $parts
    if ($owned -and @($parts | Where-Object { $_ -ceq $owned }).Count -gt $retained) {
        $remove = [Array]::IndexOf($parts,$owned)
        $kept = @(); for ($i=0; $i -lt $parts.Count; $i++) { if ($i -ne $remove) { $kept += $parts[$i] } }
    }
    $expectedPath = (@($directoryPath) + $kept) -join ';'
    $expectedKind = if ($before.path) { $before.path.kind } else { 'ExpandString' }
    $expectedAbsent = [int](($null -eq $before.path) -or ($owned -and $before.owner.PathWasAbsent.value -eq 1))
    $expectedRetained = @($kept | Where-Object { $_ -ceq $directoryPath }).Count
    if ($current.owner.Directory.value -cne $directoryPath -or $current.path.value -cne $expectedPath -or $current.path.kind -cne $expectedKind -or
        $current.owner.Directory.kind -ne 'String' -or $current.owner.PathWasAbsent.kind -ne 'DWord' -or $current.owner.RetainedEntries.kind -ne 'DWord' -or
        $current.owner.PathWasAbsent.value -ne $expectedAbsent -or $current.owner.RetainedEntries.value -ne $expectedRetained) {
        throw 'Command registration changed outside this isolated installer; refusing to overwrite it.'
    }
    foreach ($pair in @(@{key=$EnvironmentKey;values=@{Path=$before.path}}, @{key=$OwnerKey;values=$before.owner})) {
        $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($pair.key)
        try {
            foreach ($name in $(if ($pair.key -eq $EnvironmentKey) { @('Path') } else { $fields })) {
                $value = $pair.values.$name
                if ($null -eq $value) { $key.DeleteValue($name,$false) }
                else { $key.SetValue($name,$value.value,[Microsoft.Win32.RegistryValueKind]($value.kind)) }
            }
        } finally { $key.Dispose() }
    }
    if ((Read-State | ConvertTo-Json -Depth 6 -Compress) -cne ($before | ConvertTo-Json -Depth 6 -Compress)) { throw 'Command snapshot restoration did not match.' }
    . "$PSScriptRoot\..\..\deepseek-harness\apps\desktop\scripts\command-path.ps1"
    Send-DshCommandEnvironmentChange
    Write-Output 'Restored exact PATH and command ownership; unrelated registry values preserved.'
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
