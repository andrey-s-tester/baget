# Перезапуск контейнера ngrok — новые публичные URL (бесплатный план ngrok).
# Требуется: Docker Desktop запущен, в .env задан NGROK_AUTHTOKEN.
# Использование: из корня репозитория  powershell -ExecutionPolicy Bypass -File scripts/docker-ngrok-refresh.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "Поднимаю стек (postgres, redis, api, web, backoffice)..." -ForegroundColor Cyan
docker compose up -d postgres redis api web backoffice
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Пересоздаю ngrok (новые ссылки)..." -ForegroundColor Cyan
docker compose --profile ngrok up -d --force-recreate ngrok
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Start-Sleep -Seconds 4
Write-Host ""
node scripts/print-ngrok-urls.mjs
