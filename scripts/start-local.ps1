param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8000,
    [ValidateSet("127.0.0.1", "0.0.0.0")]
    [string]$BindAddress = "127.0.0.1",
    [string]$DatabasePath = "data\rlab_reservation.db"
)

$ErrorActionPreference = "Stop"
Write-Error "This folder is the ONLINE version. Use D:\py\SNR-online-preview\start.ps1 for LOCAL mode."
Set-Location -LiteralPath $ProjectRoot

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python was not found in PATH. Install Python 3.10 or later, then reopen PowerShell."
}

if ($BindAddress -eq "0.0.0.0") {
    Write-Host "LAN mode enabled. Open Windows Firewall for TCP port $Port only if other computers need access."
    Write-Host "Local check: http://127.0.0.1:$Port"
} else {
    Write-Host "Local-only mode: http://127.0.0.1:$Port"
}
Write-Host "Press Ctrl+C to stop the server."

python -m app.server --host $BindAddress --port $Port --db $DatabasePath
