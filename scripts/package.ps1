$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot\..

& "$PSScriptRoot\verify.ps1"
Write-Host "No packaging step is configured for this project."
