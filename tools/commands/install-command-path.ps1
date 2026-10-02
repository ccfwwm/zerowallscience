param([ValidateSet('install','remove','inspect')][string]$Operation='inspect')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\command-path.ps1"
$key = 'Software\ZeroWallScience\Command'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$machineKey = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\CurrentControlSet\Control\Session Manager\Environment')
try { $machinePath = [string]$machineKey.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } finally { $machineKey.Dispose() }
$request = @{operation='inspect';directory=$PSScriptRoot}
$options = @{EnvironmentKey='Environment';OwnerKey=$key;MachinePath=$machinePath;MutexName=('Global\ZeroWallScience.Command.'+$sid)}
$state = Invoke-DshCommandPath -Request $request @options
if ($Operation -ne 'inspect') {
  $request.operation = $Operation
  $request.expected = $state.fingerprint
  $state = Invoke-DshCommandPath -Request $request @options
  Send-DshCommandEnvironmentChange
}
$state | ConvertTo-Json -Compress
