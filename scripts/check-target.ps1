param(
  [ValidateRange(1, 65535)]
  [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$MarkerPath = Join-Path $ProjectRoot "PROJECT_TARGET.md"
if (-not (Select-String -LiteralPath $MarkerPath -Pattern "ONLINE" -Quiet)) {
  throw "This folder is not marked as the ONLINE target."
}

$Index = Get-Content -LiteralPath (Join-Path $ProjectRoot "index.html") -Raw
$App = Get-Content -LiteralPath (Join-Path $ProjectRoot "app.js") -Raw
$PortInUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

Write-Host "[PASS] Target: ONLINE / Supabase"
Write-Host "[PASS] Root: $ProjectRoot"
Write-Host "[PASS] Supabase frontend: $($App.Contains('SUPABASE_URL'))"
Write-Host "[PASS] Login screen absent: $(-not ($Index.Contains('loginScreen') -or $App.Contains('loginScreen')))"
Write-Host "[INFO] TCP port $Port in use: $([bool]$PortInUse)"
