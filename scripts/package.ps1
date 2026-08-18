param(
    [switch]$SkipVerification,
    [string]$OutputDirectory = "artifacts"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $ProjectRoot

if (-not $SkipVerification) {
    & (Join-Path $PSScriptRoot "verify.ps1")
}

if (-not [System.IO.Path]::IsPathRooted($OutputDirectory)) {
    $OutputDirectory = Join-Path $ProjectRoot $OutputDirectory
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$OutputDirectory = (Resolve-Path -LiteralPath $OutputDirectory).Path

$StageParent = Join-Path $OutputDirectory (".transfer-" + [guid]::NewGuid().ToString("N"))
$StageRoot = Join-Path $StageParent "SNR-reservation"
$ArchiveName = "SNR-reservation-{0}.zip" -f (Get-Date -Format "yyyyMMdd-HHmmss")
$ArchivePath = Join-Path $OutputDirectory $ArchiveName

try {
    New-Item -ItemType Directory -Force -Path $StageRoot | Out-Null

    $Files = @(
        "index.html",
        "app.js",
        "styles.css",
        "start.ps1",
        "README.md",
        "app\__init__.py",
        "app\server.py",
        "docs\HANDOFF.md",
        "docs\LOCAL_DEPLOYMENT.md",
        "scripts\start-local.ps1",
        "scripts\start-lan.ps1",
        "scripts\check-target.ps1",
        "scripts\backup-local.ps1",
        "data\rlab_reservation.db"
    )

    foreach ($RelativePath in $Files) {
        $Source = Join-Path $ProjectRoot $RelativePath
        if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
            throw "Required transfer file is missing: $RelativePath"
        }
        $Destination = Join-Path $StageRoot $RelativePath
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
        Copy-Item -LiteralPath $Source -Destination $Destination
    }

    $Commit = git rev-parse --short HEAD 2>$null
    if (-not $Commit) { $Commit = "unknown" }
    @(
        "Package created: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')",
        "Source commit: $Commit",
        "Data source: local SQLite (data\rlab_reservation.db)",
        "Start guide: docs\LOCAL_DEPLOYMENT.md"
    ) | Set-Content -LiteralPath (Join-Path $StageRoot "DEPLOYMENT_INFO.txt") -Encoding UTF8

    if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) {
        throw "Windows tar.exe was not found; it is required to create the transfer ZIP."
    }
    & tar.exe -a -c -f $ArchivePath -C $StageParent "SNR-reservation"
    if ($LASTEXITCODE -ne 0) {
        throw "tar.exe failed to create the transfer ZIP (exit code $LASTEXITCODE)."
    }
    Write-Host "Transfer package created: $ArchivePath"
}
finally {
    $ResolvedStageParent = [System.IO.Path]::GetFullPath($StageParent)
    $ResolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory).TrimEnd('\') + '\'
    if ($ResolvedStageParent.StartsWith($ResolvedOutput, [System.StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $ResolvedStageParent).StartsWith(".transfer-")) {
        Remove-Item -LiteralPath $ResolvedStageParent -Recurse -Force -ErrorAction SilentlyContinue
    }
}
