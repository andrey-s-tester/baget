# Quick check: apps, tunnel, token, HTTP status (Windows + Cloudflare).
$ErrorActionPreference = "SilentlyContinue"
Write-Host "=== Yanak domain diagnose ===" -ForegroundColor Cyan

function PortUp($p) {
  $x = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  if ($x) { "OK port $p" } else { "NO  port $p" }
}

Write-Host "Apps:" (PortUp 3000) (PortUp 3001) (PortUp 4000)

function LocalHttp($url) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0
    return "HTTP " + [int]$r.StatusCode
  } catch {
    $resp = $_.Exception.Response
    if ($resp -and $resp.StatusCode) { return "HTTP " + [int]$resp.StatusCode }
    return "FAIL " + $_.Exception.Message
  }
}

Write-Host "Local GET http://127.0.0.1:3000 ->" (LocalHttp "http://127.0.0.1:3000")
Write-Host "Local GET http://127.0.0.1:4000/api/system/health ->" (LocalHttp "http://127.0.0.1:4000/api/system/health")

$v4ok = Test-NetConnection 127.0.0.1 -Port 3000 -WarningAction SilentlyContinue | Select-Object -ExpandProperty TcpTestSucceeded
$v6ok = Test-NetConnection ::1 -Port 3000 -WarningAction SilentlyContinue | Select-Object -ExpandProperty TcpTestSucceeded
if ($v4ok -and -not $v6ok) {
  Write-Host "Loopback: 127.0.0.1:3000 OK, ::1:3000 NO — if tunnel URL uses localhost, set 127.0.0.1 in CF (fixes 502)." -ForegroundColor Yellow
}

$cfProc = Get-Process cloudflared -ErrorAction SilentlyContinue
$cfSvc = Get-Service -Name Cloudflared -ErrorAction SilentlyContinue
if ($cfProc -or ($cfSvc -and $cfSvc.Status -eq "Running")) {
  Write-Host "cloudflared: RUNNING (process or Cloudflared service)" -ForegroundColor Green
} else {
  Write-Host "cloudflared: NOT running (522 if ISP blocks 80/443)" -ForegroundColor Yellow
}
if (Get-Process caddy -ErrorAction SilentlyContinue) { Write-Host "caddy: running" } else { Write-Host "caddy: not running" }

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envPath = Join-Path $root ".env"
$hasTok = $false
if (Test-Path $envPath) {
  $c = Get-Content $envPath -Raw
  if ($c -match 'CLOUDFLARE_TUNNEL_TOKEN\s*=\s*\S+') { $hasTok = $true }
}
if ($hasTok) { Write-Host "CLOUDFLARE_TUNNEL_TOKEN in .env: YES" -ForegroundColor Green }
else { Write-Host "CLOUDFLARE_TUNNEL_TOKEN in .env: NO - add token from Zero Trust Tunnels" -ForegroundColor Red }

Write-Host "`nGET https://bagetnaya-yanak.ru ..." -ForegroundColor Gray
try {
  $r = Invoke-WebRequest -Uri "https://bagetnaya-yanak.ru" -UseBasicParsing -TimeoutSec 25 -MaximumRedirection 3
  Write-Host "HTTP" $r.StatusCode
} catch {
  $resp = $_.Exception.Response
  if ($resp -and $resp.StatusCode) { Write-Host "HTTP" ([int]$resp.StatusCode) }
  else { Write-Host $_.Exception.Message }
}

Write-Host "`n522 = Cloudflare cannot reach your server IP on 80/443. Fix: Tunnel or open ports." -ForegroundColor Yellow
Write-Host "502 = Tunnel OK but origin failed. Start web: npm run win:native:start:web" -ForegroundColor Yellow
Write-Host "    CF route Service must be http://127.0.0.1:3000 (not https:// — Next has no TLS on :3000)." -ForegroundColor Gray
Write-Host "See deploy/WINDOWS.md section Cloudflare Tunnel" -ForegroundColor Gray
