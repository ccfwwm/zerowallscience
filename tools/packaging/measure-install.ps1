param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [Parameter(Mandatory = $true)][string]$Output,
  [string]$Target = "$env:LOCALAPPDATA\Programs\ZeroWallScience",
  [switch]$Probe
)
$ErrorActionPreference = 'Stop'
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$targetPath = [IO.Path]::GetFullPath($Target)
$outputPath = [IO.Path]::GetFullPath($Output)
# This tool overwrites the explicitly selected installation. It never removes
# user data, profiles, Python environments or arbitrary generated directories.
if ([IO.Path]::GetFileName($targetPath) -ne 'ZeroWallScience') { throw 'The measured target must be a ZeroWallScience installation directory.' }
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
$metricsPath = Join-Path $outputPath 'installer-phases.txt'
if (Test-Path -LiteralPath $metricsPath) { throw 'Use a new measurement output directory.' }
$traceSource = @'
using System;
using System.Runtime.InteropServices;
public static class ZwsInstallTrace {
  [DllImport("kernel32.dll")] public static extern long GetTickCount64();
}
'@
Add-Type -TypeDefinition $traceSource
$trace = $null
if ($Probe) {
  Write-Output 'Windows tick telemetry available; process boundaries are sampled.'
  exit 0
}
$sampled = [Collections.Generic.List[object]]::new()
$startTick = [ZwsInstallTrace]::GetTickCount64()
try {
  $process = Start-Process -FilePath $installerPath -ArgumentList @('/S', '/currentuser', '/no-launch', "/ZW_PERF=`"$metricsPath`"", "/D=$targetPath") -WindowStyle Hidden -PassThru
  & {
    $owned = [Collections.Generic.HashSet[int]]::new()
    [void]$owned.Add($process.Id)
    $previous = @{}
    while (-not $process.HasExited) {
      $tick = [ZwsInstallTrace]::GetTickCount64()
      $snapshot = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name)
      do {
        $added = $false
        foreach ($entry in $snapshot) { if ($owned.Contains([int]$entry.ParentProcessId) -and $owned.Add([int]$entry.ProcessId)) { $added = $true } }
      } while ($added)
      $current = @{}
      foreach ($entry in $snapshot) {
        if (-not $owned.Contains([int]$entry.ProcessId)) { continue }
        $current[[int]$entry.ProcessId] = $entry
        if (-not $previous.ContainsKey([int]$entry.ProcessId)) { $sampled.Add([pscustomobject]@{ Name=$entry.Name; Pid=[int]$entry.ProcessId; Parent=[int]$entry.ParentProcessId; Kind='start'; Tick=$tick }) }
      }
      foreach ($pidValue in $previous.Keys) { if (-not $current.ContainsKey($pidValue)) { $sampled.Add([pscustomobject]@{ Name=$previous[$pidValue].Name; Pid=$pidValue; Parent=0; Kind='stop'; Tick=$tick }) } }
      $previous = $current
      [void]$process.WaitForExit(100)
    }
  }
  $process.Refresh()
  $endTick = [ZwsInstallTrace]::GetTickCount64()
  # Allow queued process events to reach the watcher before taking its snapshot.
  Start-Sleep -Milliseconds 300
} finally { }
$rows = @($sampled.ToArray() | Sort-Object Tick)
$children = [Collections.Generic.HashSet[int]]::new()
[void]$children.Add($process.Id)
foreach ($row in $rows) { if ($row.Kind -eq 'start' -and $children.Contains($row.Parent)) { [void]$children.Add($row.Pid) } }
$rows = @($rows | Where-Object { $children.Contains($_.Pid) })
$phases = @()
if (Test-Path -LiteralPath $metricsPath) {
  foreach ($line in Get-Content -LiteralPath $metricsPath) {
    if ($line -match '^(\d+)\|([a-z-]+)$') { $phases += [pscustomobject]@{ Tick = [long]$Matches[1]; Phase = $Matches[2] } }
  }
}
$helper = $rows | Where-Object { $_.Kind -eq 'start' -and $_.Name -eq 'zerowall-process-control.exe' } | Select-Object -First 1
$helperEnd = if ($helper) { $rows | Where-Object { $_.Kind -eq 'stop' -and $_.Pid -eq $helper.Pid } | Select-Object -First 1 }
$finalizing = $rows | Where-Object { $_.Kind -eq 'start' -and $_.Name -eq 'powershell.exe' -and $_.Tick -gt $helperEnd.Tick } | Select-Object -First 1
$durations = if ($phases.Count) {
  $stop = $phases | Where-Object Phase -eq 'stopping' | Select-Object -First 1
  $extract = $phases | Where-Object Phase -eq 'extracting' | Select-Object -Last 1
  $finish = $phases | Where-Object Phase -eq 'finalizing' | Select-Object -First 1
  $complete = $phases | Where-Object Phase -eq 'complete' | Select-Object -First 1
  [ordered]@{ Method = 'NSIS GetTickCount64 phase markers'; StoppingMs = $extract.Tick - $stop.Tick; ExtractingMs = $finish.Tick - $extract.Tick; FinalizingMs = $complete.Tick - $finish.Tick }
} elseif ($helper -and $helperEnd -and $finalizing) {
  # Historical installers have no timer markers. Process boundaries locate
  # the stop helper and final PATH-registration command to within event delay.
  [ordered]@{ Method = 'sampled process boundaries; historical estimate'; StoppingMs = $helperEnd.Tick - $helper.Tick; ExtractingMs = $finalizing.Tick - $helperEnd.Tick; FinalizingMs = $endTick - $finalizing.Tick }
} else { [ordered]@{ Method = 'total only; phase trace unavailable' } }
$report = [ordered]@{ Installer = $installerPath; InstallerSha256 = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToLowerInvariant(); Target = $targetPath; ExitCode = $process.ExitCode; TotalMs = $endTick - $startTick; Phases = $durations; ProcessEvents = $rows; NsIsMarkers = $phases }
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $outputPath 'report.json') -Encoding utf8
Write-Output ($report | Select-Object Installer,ExitCode,TotalMs,Phases | ConvertTo-Json -Depth 3)
if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
if (-not (Test-Path -LiteralPath (Join-Path $targetPath 'ZeroWallScience.exe'))) { throw 'Installed executable is missing.' }
