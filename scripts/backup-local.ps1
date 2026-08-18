param(
    [string]$DatabasePath = "data\rlab_reservation.db",
    [string]$BackupDirectory = "backups"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if (-not [System.IO.Path]::IsPathRooted($DatabasePath)) {
    $DatabasePath = Join-Path $ProjectRoot $DatabasePath
}
if (-not (Test-Path -LiteralPath $DatabasePath -PathType Leaf)) {
    throw "Local database was not found: $DatabasePath"
}

if (-not [System.IO.Path]::IsPathRooted($BackupDirectory)) {
    $BackupDirectory = Join-Path $ProjectRoot $BackupDirectory
}
New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Destination = Join-Path $BackupDirectory "rlab_reservation-$Stamp.db"

Copy-Item -LiteralPath $DatabasePath -Destination $Destination
$Hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash
Write-Host "Backup created: $Destination"
Write-Host "SHA256: $Hash"
Write-Host "Keep the service stopped while copying/restoring database files."
