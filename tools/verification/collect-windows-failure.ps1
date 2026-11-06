param(
  [string[]]$InstallRoots = @('C:\zw', 'D:\zerowallscience'),
  [string]$UserDataRoot = (Join-Path $env:LOCALAPPDATA 'zerowall-science'),
  [string]$OutputFile = (Join-Path ([Environment]::GetFolderPath('Desktop')) ('ZeroWall-Diagnostics-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt'))
)
$ErrorActionPreference = 'Stop'
$taskReport = New-Object System.Collections.Generic.List[string]
function Add-Report([string]$Text) {
  # Collect diagnostics only. Never read settings, credentials or environment.
  $Text = $Text -replace '(?i)(Bearer\s+)[^\s"'',;]+', '$1[redacted]'
  $Text = $Text -replace '(?i)((?:token|api[_-]?key|password|secret|authorization)["'']?\s*[:=]\s*["'']?)[^\s"''&,;]+', '$1[redacted]'
  $taskReport.Add($Text)
}
function Read-Tail([string]$Path, [int]$Lines) {
  Add-Report ("`r`n--- " + $Path + ' ---')
  if (-not [IO.File]::Exists($Path)) { Add-Report 'NOT_FOUND'; return }
  # StreamReader detects the NSIS UTF-16 BOM and the Host UTF-8 log.
  $taskStream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
  $taskReader = New-Object IO.StreamReader($taskStream, [Text.Encoding]::UTF8, $true)
  try {
    $taskTail = New-Object 'System.Collections.Generic.Queue[string]'
    while (($taskLine = $taskReader.ReadLine()) -ne $null) {
      $taskTail.Enqueue($taskLine)
      if ($taskTail.Count -gt $Lines) { $null = $taskTail.Dequeue() }
    }
    foreach ($taskLine in $taskTail) { Add-Report $taskLine }
  } finally { $taskReader.Dispose() }
}
Add-Report ('ZeroWall diagnostics ' + (Get-Date).ToUniversalTime().ToString('o'))
Add-Report ('OS: ' + [Environment]::OSVersion.VersionString + '; 64-bit: ' + [Environment]::Is64BitOperatingSystem)
$taskLogs = Join-Path $UserDataRoot 'logs'
foreach ($taskName in @('harness.log', 'startup.log')) {
  try { Read-Tail (Join-Path $taskLogs $taskName) 120 }
  catch { Add-Report ('READ_FAILED: ' + $_.Exception.Message) }
}
if ([IO.Directory]::Exists($taskLogs)) {
  $taskInstallLogs = Get-ChildItem -LiteralPath $taskLogs -Filter 'installer-*.log' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 3
  foreach ($taskFile in $taskInstallLogs) {
    try { Read-Tail $taskFile.FullName 120; if ([IO.File]::Exists($taskFile.FullName + '.result.ini')) { Read-Tail ($taskFile.FullName + '.result.ini') 30 } }
    catch { Add-Report ('READ_FAILED: ' + $_.Exception.Message) }
  }
}
$taskPortFile = Join-Path $UserDataRoot 'harness\endpoint-port.txt'
try { Read-Tail $taskPortFile 1 } catch { Add-Report ('PORT_RECORD_READ_FAILED: ' + $_.Exception.Message) }
foreach ($taskInstallRoot in $InstallRoots) {
  Add-Report ("`r`n--- Installation: " + $taskInstallRoot + ' ---')
  $taskExe = Join-Path $taskInstallRoot 'ZeroWallScience.exe'
  if ([IO.File]::Exists($taskExe)) { Add-Report ('Executable version: ' + [Diagnostics.FileVersionInfo]::GetVersionInfo($taskExe).FileVersion) }
  $taskRecoveryRoot = Join-Path $taskInstallRoot 'resources\installer-recovery'
  $taskJournals = New-Object System.Collections.Generic.List[string]
  $taskLegacyJournal = Join-Path $taskRecoveryRoot 'transaction.json'
  if ([IO.File]::Exists($taskLegacyJournal)) { $taskJournals.Add($taskLegacyJournal) }
  try {
    $taskTransactions = Join-Path $taskRecoveryRoot 'transactions'
    if ([IO.Directory]::Exists($taskTransactions)) {
      $taskTransactionRoot = Get-Item -LiteralPath $taskTransactions
      if ($taskTransactionRoot.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked transaction root is not collected.' }
      $taskDirectories = @(Get-ChildItem -LiteralPath $taskTransactions -Directory | Where-Object {
        $_.Name -cmatch '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)
      } | Sort-Object LastWriteTime -Descending)
      Add-Report ('Independent recovery transactions: ' + $taskDirectories.Count + '; collecting the latest 20.')
      foreach ($taskDirectory in ($taskDirectories | Select-Object -First 20)) { $taskJournals.Add((Join-Path $taskDirectory.FullName 'transaction.json')) }
    }
  } catch { Add-Report ('RECOVERY_ENUMERATION_FAILED: ' + $_.Exception.Message) }
  if ($taskJournals.Count -eq 0) { Add-Report 'Recovery journal: NOT_FOUND'; continue }
  foreach ($taskJournal in $taskJournals) {
    try {
      $taskJournalInfo = Get-Item -LiteralPath $taskJournal
      if ($taskJournalInfo.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked journal is not collected.' }
      $taskDocument = [IO.File]::ReadAllText($taskJournal) | ConvertFrom-Json
      # Do not include inventory paths or copy any recovery/backup content.
      Add-Report (([ordered]@{ schema = $taskDocument.schema; id = $taskDocument.id; root = $taskDocument.root; state = $taskDocument.state; rows = @($taskDocument.rows).Count; primaryError = $taskDocument.primaryError; rollbackError = $taskDocument.rollbackError; cleanupPending = $taskDocument.cleanupPending; cleanupError = $taskDocument.cleanupError } | ConvertTo-Json -Depth 6))
    } catch { Add-Report ('JOURNAL_READ_FAILED: ' + $_.Exception.Message) }
  }
}
try {
  Add-Report "`r`n--- Windows excluded TCP ranges ---"
  Add-Report ((& "$env:SystemRoot\System32\netsh.exe" interface ipv4 show excludedportrange protocol=tcp 2>&1) -join "`r`n")
} catch { Add-Report ('PORT_QUERY_FAILED: ' + $_.Exception.Message) }
try {
  Add-Report "`r`n--- Recent application crashes ---"
  $taskEvents = Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = @(1000, 1001); StartTime = (Get-Date).AddDays(-1) } -MaxEvents 80 -ErrorAction SilentlyContinue
  foreach ($taskEvent in $taskEvents) {
    if ($taskEvent.Message -match '(?i)ZeroWallScience\.exe|copy-runtime\.exe') { Add-Report ($taskEvent.TimeCreated.ToUniversalTime().ToString('o') + ' ' + $taskEvent.Message) }
  }
} catch { Add-Report ('EVENT_QUERY_UNAVAILABLE: ' + $_.Exception.Message) }
[IO.File]::WriteAllText([IO.Path]::GetFullPath($OutputFile), ($taskReport -join "`r`n"), (New-Object Text.UTF8Encoding($true)))
Write-Output ('Saved diagnostics: ' + [IO.Path]::GetFullPath($OutputFile))
