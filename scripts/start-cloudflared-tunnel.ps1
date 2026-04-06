# Запуск Cloudflare Tunnel по токену из .env (CLOUDFLARE_TUNNEL_TOKEN).
# Токен: Zero Trust -> Networks -> Tunnels -> ваш туннель -> кнопка с токеном для установки.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$exe = Join-Path $root "deploy\cloudflared\cloudflared.exe"
$envFile = Join-Path $root ".env"

if (-not (Test-Path $exe)) {
  Write-Host "Сначала: npm run tunnel:win:download" -ForegroundColor Yellow
  exit 1
}

$token = $null
$bestLen = 0
if (Test-Path $envFile) {
  Get-Content $envFile -Encoding UTF8 | ForEach-Object {
    $line = $_ -replace "^\xEF\xBB\xBF", ""
    if ($line -match '^\s*CLOUDFLARE_TUNNEL_TOKEN\s*=\s*(.+)$') {
      $cand = $Matches[1].Trim().Trim('"').Trim("'")
      if ($cand.Length -gt $bestLen) {
        $bestLen = $cand.Length
        $token = $cand
      }
    }
  }
}

if (-not $token) {
  Write-Host "Add to .env: CLOUDFLARE_TUNNEL_TOKEN=..." -ForegroundColor Yellow
  Write-Host "See deploy/WINDOWS.md Cloudflare Tunnel" -ForegroundColor Gray
  exit 1
}

if ($token -match '^cfat_') {
  Write-Host "ERROR: This is CLOUDFLARE API TOKEN (cfat_). cloudflared needs the TUNNEL token." -ForegroundColor Red
  Write-Host "Get it: Zero Trust -> Networks -> Tunnels -> your tunnel -> copy token from install step (long eyJ... string)." -ForegroundColor Yellow
  exit 1
}

if ($token.Length -lt 120) {
  Write-Host "ERROR: Token is too short ($($token.Length) chars). Real tunnel JWT is usually 200+ chars, starts with eyJ." -ForegroundColor Red
  Write-Host "In Cloudflare: Zero Trust -> Tunnels -> your tunnel -> copy the FULL string after: cloudflared tunnel run --token" -ForegroundColor Yellow
  exit 1
}

Write-Host "Starting cloudflared (Ctrl+C to stop)..." -ForegroundColor Green
& $exe tunnel run --token $token
