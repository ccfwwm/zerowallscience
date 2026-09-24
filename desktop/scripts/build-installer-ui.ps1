$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vsRoot = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vsRoot) { throw 'Visual Studio C++ tools are required to build the installer UI.' }
$outputDir = Join-Path $repoRoot '.build/installer-ui'
New-Item -ItemType Directory -Force $outputDir | Out-Null
$source = Join-Path $repoRoot 'desktop/installer/modern-installer.cpp'
$icon = (Join-Path $repoRoot 'resources/brand/app-icons/icon.ico').Replace('\','/')
Set-Content -LiteralPath (Join-Path $outputDir 'brand.rc') -Value ('1 ICON "' + $icon + '"') -Encoding ascii
$png = (Join-Path $repoRoot 'resources/brand/app-icons/icon.png').Replace('\','/')
Add-Content -LiteralPath (Join-Path $outputDir 'brand.rc') -Value ('101 RCDATA "' + $png + '"') -Encoding ascii
$command = '@call "' + $vsRoot + '\VC\Auxiliary\Build\vcvars64.bat" >nul' + "`r`n" + 'rc /nologo brand.rc' + "`r`n" + 'cl /nologo /std:c++17 /utf-8 /EHsc /O2 /MT /DWINVER=0x0A00 /D_WIN32_WINNT=0x0A00 "' + $source + '" brand.res /Fe:modern-installer.exe /link /SUBSYSTEM:WINDOWS /DYNAMICBASE /NXCOMPAT' + "`r`n" + 'exit /b %errorlevel%'
$script = Join-Path $outputDir 'build.cmd'
Set-Content -LiteralPath $script -Value $command -Encoding ascii
Push-Location $outputDir
# Resolve the batch by absolute path: a machine with NoDefaultCurrentDirectoryInExePath=1
# makes cmd refuse the bare `build.cmd` form from the current directory.
try { & cmd.exe /d /c "`"$script`""; if ($LASTEXITCODE -ne 0) { throw 'Installer UI compilation failed.' } } finally { Pop-Location }
