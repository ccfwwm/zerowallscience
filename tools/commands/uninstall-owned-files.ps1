param([Parameter(Mandatory=$true)][string]$InstallRoot, [switch]$PreserveIfUnmanaged)
$ErrorActionPreference = 'Stop'
$resolvedRoot = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
if ((Get-Item -LiteralPath $resolvedRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked installation root refused.' }
$manifestPath = Join-Path $resolvedRoot 'resources\installer-owned.json'
if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  if ($PreserveIfUnmanaged) { Write-Output 'No previous ownership inventory. Existing files preserved for in-place upgrade.'; exit 0 }
  throw 'Missing installer ownership manifest; preserving files.'
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.schema -ne 1 -or !$manifest.files) { throw 'Missing installer ownership manifest; preserving files.' }
$directories = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$targets = [Collections.Generic.List[string]]::new()
foreach ($entry in $manifest.files) {
  if ([IO.Path]::IsPathRooted($entry) -or $entry -match '(^|[\\/])\.\.([\\/]|$)' -or $entry -match '^(?i)Python([\\/]|$)' -or $entry -match '(^|[\\/])\.zerowall([\\/]|$)') { throw 'Unsafe owned-file path.' }
  $target = [IO.Path]::GetFullPath((Join-Path $resolvedRoot $entry))
  if (!$target.StartsWith($resolvedRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Owned file escaped installation root.' }
  $unsafe = $false
  $cursor = $target
  while ($cursor -ne $resolvedRoot) {
    if (Test-Path -LiteralPath $cursor) {
      $item = Get-Item -LiteralPath $cursor -Force
      if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { $unsafe = $true; break }
    }
    $cursor = [IO.Path]::GetDirectoryName($cursor)
  }
  if ($unsafe) { Write-Output 'Preserving a linked installation path.'; continue }
  $targets.Add($target)
}
# Validate the entire inventory before removing its first file.
foreach ($target in $targets) {
  if (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target -Force }
  $cursor = [IO.Path]::GetDirectoryName($target)
  while ($cursor -ne $resolvedRoot) { [void]$directories.Add($cursor); $cursor = [IO.Path]::GetDirectoryName($cursor) }
}
foreach ($directory in ($directories | Sort-Object Length -Descending)) {
  if (Test-Path -LiteralPath $directory -PathType Container) {
    if (@(Get-ChildItem -LiteralPath $directory -Force).Count -eq 0) { Remove-Item -LiteralPath $directory -Force }
  }
}
Write-Output 'Installer-owned files removed. Python and unowned files preserved.'
