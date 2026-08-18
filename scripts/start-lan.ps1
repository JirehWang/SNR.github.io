param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8000,
    [string]$IpAddress,
    [switch]$ShowOnly
)

$ErrorActionPreference = "Stop"
Write-Error "This folder is the ONLINE version. Use ..\start.ps1; the LOCAL version is D:\py\SNR-online-preview."

function Test-UsableIpv4 {
    param([string]$Value)

    $Parsed = $null
    if (-not [System.Net.IPAddress]::TryParse($Value, [ref]$Parsed)) { return $false }
    if ($Parsed.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { return $false }
    return $Value -ne "127.0.0.1" -and -not $Value.StartsWith("169.254.")
}

if ($IpAddress) {
    if (-not (Test-UsableIpv4 $IpAddress)) {
        throw "IpAddress must be a usable IPv4 address (not loopback or APIPA): $IpAddress"
    }
} else {
    $Candidates = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
        Where-Object {
            $_.OperationalStatus -eq [System.Net.NetworkInformation.OperationalStatus]::Up -and
            $_.NetworkInterfaceType -ne [System.Net.NetworkInformation.NetworkInterfaceType]::Loopback
        } |
        ForEach-Object {
            $Interface = $_
            $Properties = $Interface.GetIPProperties()
            $HasGateway = @($Properties.GatewayAddresses | Where-Object {
                $_.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
                $_.Address.ToString() -ne "0.0.0.0"
            }).Count -gt 0
            if ($HasGateway) {
                $Rank = switch ($Interface.NetworkInterfaceType) {
                    ([System.Net.NetworkInformation.NetworkInterfaceType]::Ethernet) { 0 }
                    ([System.Net.NetworkInformation.NetworkInterfaceType]::Wireless80211) { 1 }
                    default { 2 }
                }
                $Properties.UnicastAddresses |
                    Where-Object { Test-UsableIpv4 $_.Address.ToString() } |
                    ForEach-Object {
                        [pscustomobject]@{ Address = $_.Address.ToString(); Rank = $Rank }
                    }
            }
        } |
        Sort-Object Rank |
        ForEach-Object Address

    $IpAddress = $Candidates | Select-Object -First 1
    if (-not $IpAddress) {
        throw "No usable LAN IPv4 address was found. Connect the network or pass -IpAddress manually."
    }
}

$HomeUrl = "http://${IpAddress}:$Port"
$BulletinUrl = "$HomeUrl/?view=bulletin"

Write-Host "Detected LAN IPv4: $IpAddress"
Write-Host "Home: $HomeUrl"
Write-Host "Bulletin: $BulletinUrl"
Write-Host "The server will listen on all local interfaces (0.0.0.0)."

if ($ShowOnly) {
    exit 0
}

@(
    "Current LAN IPv4: $IpAddress",
    "Home: $HomeUrl",
    "Bulletin: $BulletinUrl",
    "Updated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
) | Set-Content -LiteralPath (Join-Path $ProjectRoot "LAN-ACCESS.txt") -Encoding UTF8

& (Join-Path $PSScriptRoot "start-local.ps1") -BindAddress "0.0.0.0" -Port $Port
