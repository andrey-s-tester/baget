# Start Caddy for deploy/Caddyfile.windows-host (run as Administrator for ports 80/443).
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$caddy = Join-Path $root "deploy\caddy\caddy.exe"
$config = Join-Path $root "deploy\Caddyfile.windows-host"

if (-not (Test-Path $caddy)) {
  Write-Error "No caddy.exe. Run: powershell -File scripts\download-caddy-windows.ps1"
  exit 1
}

Set-Location $root
Write-Host "Starting Caddy: $caddy"
& $caddy run --config $config
