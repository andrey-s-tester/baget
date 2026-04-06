$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$dest = Join-Path $PSScriptRoot "..\deploy\caddy"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$rel = Invoke-RestMethod -Uri "https://api.github.com/repos/caddyserver/caddy/releases/latest"
$asset = $rel.assets | Where-Object { $_.name -match "windows_amd64\.zip$" } | Select-Object -First 1
if (-not $asset) { throw "No windows_amd64 zip in latest caddy release" }
$zip = Join-Path $env:TEMP $asset.name
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath $dest -Force
Write-Host "Caddy at: $(Join-Path $dest 'caddy.exe')"
