# Сборка Yanak Admin с подстановкой URL из ngrok (localhost:4040).
# Требуется: docker compose --profile ngrok up -d ngrok и запущенные web/api/backoffice на хосте.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$defaultsPath = Join-Path $root "apps\admin-desktop\electron\app-defaults.json"

try {
  $r = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -Method Get
} catch {
  Write-Host "Не удалось прочитать туннели ngrok (http://127.0.0.1:4040)."
  Write-Host "Запустите: docker compose --profile ngrok up -d ngrok"
  exit 1
}

$api = $null
$admin = $null
foreach ($t in $r.tunnels) {
  if ($t.name -eq "yanak-api") { $api = $t.public_url }
  if ($t.name -eq "yanak-admin") { $admin = $t.public_url }
}

if (-not $api -or -not $admin) {
  Write-Host "В ответе ngrok не найдены туннели yanak-api и/или yanak-admin."
  Write-Host "Проверьте ngrok.yml (имена туннелей)."
  exit 1
}

$manifestUrl = ($api.TrimEnd("/")) + "/api/system/desktop-admin-update"
$out = @{
  apiBaseUrl        = $api
  backofficeUrl     = $admin
  updateManifestUrl = $manifestUrl
}
$out | ConvertTo-Json -Compress | Set-Content -LiteralPath $defaultsPath -Encoding utf8

Write-Host ""
Write-Host "Записано apps/admin-desktop/electron/app-defaults.json"
Write-Host "  apiBaseUrl:        $api"
Write-Host "  backofficeUrl:     $admin"
Write-Host "  updateManifestUrl: $manifestUrl"
Write-Host ""

Set-Location $root
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run dist -w @yanak/admin-desktop
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Done. Output folder:"
Write-Host ('  ' + (Join-Path $root 'apps\admin-desktop\dist-pack'))
Write-Host ""
Write-Host "Set DESKTOP_ADMIN_DOWNLOAD_URL on API to a public URL of the installer exe."
Write-Host ""
