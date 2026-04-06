# Install cloudflared as Windows service (reads CLOUDFLARE_TUNNEL_TOKEN from .env).
# Run PowerShell AS ADMINISTRATOR once.

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "Run this script as Administrator (right-click PowerShell)." -ForegroundColor Red
  exit 1
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$exe = Join-Path $root "deploy\cloudflared\cloudflared.exe"
$envFile = Join-Path $root ".env"

if (-not (Test-Path $exe)) {
  Write-Host "Run first: npm run tunnel:win:download" -ForegroundColor Yellow
  exit 1
}

$token = $null
$bestLen = 0
if (Test-Path $envFile) {
  Get-Content $envFile -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*CLOUDFLARE_TUNNEL_TOKEN\s*=\s*(.+)$') {
      $cand = $Matches[1].Trim().Trim('"').Trim("'")
      if ($cand.Length -gt $bestLen) { $bestLen = $cand.Length; $token = $cand }
    }
  }
}

if (-not $token -or $token.Length -lt 120) {
  Write-Host "Put full CLOUDFLARE_TUNNEL_TOKEN=... in .env (long eyJ... JWT)." -ForegroundColor Red
  exit 1
}

Write-Host "Stopping/removing old cloudflared service if any..." -ForegroundColor Gray
# cloudflared пишет INF в stderr — при $ErrorActionPreference Stop PowerShell падает
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
& $exe service uninstall 2>&1 | Out-Null
$ErrorActionPreference = $prevEap
Start-Sleep -Seconds 2

Write-Host "Installing service..." -ForegroundColor Cyan
$ErrorActionPreference = "SilentlyContinue"
& $exe service install $token 2>&1 | ForEach-Object { $_ }
$ErrorActionPreference = $prevEap
if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
  Write-Host "service install failed exit $LASTEXITCODE" -ForegroundColor Red
  exit $LASTEXITCODE
}

# Имя службы в Windows: Cloudflared (с большой C)
$svcName = "Cloudflared"
$svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
if (-not $svc) {
  Write-Host "Service $svcName not found after install." -ForegroundColor Red
  exit 1
}
if ($svc.Status -eq "Running") {
  Write-Host "Service $svcName already running (skip start)." -ForegroundColor Gray
} else {
  Write-Host "Starting service $svcName ..." -ForegroundColor Cyan
  Start-Service -Name $svcName
}
Start-Sleep -Seconds 2
cmd /c "sc.exe query $svcName"

Write-Host "Done. Check Zero Trust -> Tunnels -> Overview for connector." -ForegroundColor Green
