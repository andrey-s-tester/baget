# Скачивает cloudflared.exe в deploy/cloudflared/ (для Cloudflare Tunnel).
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$destDir = Join-Path (Split-Path $PSScriptRoot -Parent) "deploy\cloudflared"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$rel = Invoke-RestMethod -Uri "https://api.github.com/repos/cloudflare/cloudflared/releases/latest"
$asset = $rel.assets | Where-Object { $_.name -eq "cloudflared-windows-amd64.exe" } | Select-Object -First 1
if (-not $asset) { throw "cloudflared-windows-amd64.exe not found" }
$out = Join-Path $destDir "cloudflared.exe"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $out -UseBasicParsing
Write-Host "OK: $out"
