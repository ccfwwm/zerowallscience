param(
  [string]$Python = (Join-Path $env:APPDATA 'zerowall-science/Python/python.exe')
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
  throw "ZeroWall shared Python was not found: $Python. Start ZeroWall once to initialize the one shared runtime."
}
$runtimeRoot = Split-Path -Parent $Python
if ((Split-Path -Leaf $runtimeRoot) -ne 'Python' -or (Split-Path -Leaf (Split-Path -Parent $runtimeRoot)) -ne 'zerowall-science') {
  throw 'HE dependencies must use %APPDATA%\zerowall-science\Python\python.exe; isolated or user-selected Python paths are not supported.'
}
$sitePackages = Join-Path $runtimeRoot 'Lib/site-packages'
$manifestPath = Join-Path $PSScriptRoot '../../resources/python/dependency-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$sharedPackages = @{}
foreach ($name in @('openslide-python','openslide-bin','pillow','numpy','tifffile','tensorflow','keras','stardist','csbdeep')) {
  $package = $manifest.packages | Where-Object { $_.name -eq $name } | Select-Object -First 1
  if (-not $package -or -not $package.required) { throw "The signed shared dependency list does not require $name." }
  $sharedPackages[$name] = $package.version
}
$requiredJson = ConvertTo-Json -InputObject $sharedPackages -Compress
& $Python -I -c 'import importlib.metadata as m,json,sys; required=json.loads(sys.argv[1]); actual={name:(m.version(name) if any(d.metadata.get("Name","").lower()==name for d in m.distributions()) else None) for name in required}; missing={name:{"required":version,"installed":actual[name]} for name,version in required.items() if actual[name]!=version}; print(json.dumps({"python":sys.executable,"sitePackages":sys.argv[2],"versions":actual,"missing":missing})); sys.exit(bool(missing))' $requiredJson $sitePackages
if ($LASTEXITCODE -ne 0) { throw 'Shared HE/StarDist dependencies are not ready. Install the signed required ZeroWall dependency manifest; this script does not create environments or install a private profile.' }
Write-Output "HE engine verified in the shared runtime: $Python"
Write-Output "Shared package directory: $sitePackages"
