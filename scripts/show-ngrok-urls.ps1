# Показать публичные URL туннелей (инспектор ngrok на localhost:4040)
$ErrorActionPreference = "Stop"
try {
  $r = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -Method Get
} catch {
  Write-Host "Инспектор ngrok недоступен. Запустите: docker compose --profile ngrok up -d ngrok"
  Write-Host "И задайте NGROK_AUTHTOKEN в .env"
  exit 1
}
Write-Host ""
Write-Host "Публичные ссылки (скопируйте public_url):"
foreach ($t in $r.tunnels) {
  Write-Host ("  {0,-14} {1}" -f ($t.name + ":"), $t.public_url)
}
Write-Host ""
Write-Host "Веб-инспектор: http://localhost:4040"
