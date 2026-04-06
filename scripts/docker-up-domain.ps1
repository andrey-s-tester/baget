# Подъём Docker-стека + Caddy (TLS) после проверки переменных для домена.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

& node "$PSScriptRoot\verify-domain-env.mjs"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Запуск docker compose --profile https up -d ..." -ForegroundColor Cyan
& "$PSScriptRoot\Invoke-DockerCompose.ps1" -ComposeArguments @("--profile", "https", "up", "-d")
exit $LASTEXITCODE
