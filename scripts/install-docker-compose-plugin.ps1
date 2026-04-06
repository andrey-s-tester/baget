# Docker Compose v2 as CLI plugin (docker compose). Run once after Docker Engine.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$rel = Invoke-RestMethod -Uri "https://api.github.com/repos/docker/compose/releases/latest"
$asset = $rel.assets | Where-Object { $_.name -eq "docker-compose-windows-x86_64.exe" } | Select-Object -First 1
if (-not $asset) { throw "docker-compose-windows-x86_64.exe not found in latest release" }

$plug = Join-Path $env:USERPROFILE ".docker\cli-plugins"
New-Item -ItemType Directory -Force -Path $plug | Out-Null
$out = Join-Path $plug "docker-compose.exe"

Write-Host "Downloading" $asset.browser_download_url
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $out -UseBasicParsing

docker compose version
