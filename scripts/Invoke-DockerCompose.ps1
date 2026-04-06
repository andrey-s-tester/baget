param(
  [Parameter(Mandatory = $false)]
  [string[]]$ComposeArguments = @("up", "-d"),
  [Parameter(Mandatory = $false)]
  [string[]]$ExtraComposeFiles = @()
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Find-Docker {
  $candidates = @(
    (Join-Path $env:ProgramFiles "Docker\Docker\resources\bin\docker.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Docker\Docker\resources\bin\docker.exe")
  )
  foreach ($p in $candidates) {
    if (Test-Path -LiteralPath $p) {
      return $p
    }
  }
  $cmd = Get-Command docker.exe -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) {
    return $cmd.Source
  }
  return $null
}

$docker = Find-Docker
if (-not $docker) {
  Write-Host "Docker не найден (docker.exe)." -ForegroundColor Red
  Write-Host "Установите Docker Desktop: https://docs.docker.com/desktop/install/windows-install/"
  Write-Host "После установки перезапустите терминал или ПК, затем снова запустите скрипт."
  exit 1
}

Set-Location $ProjectRoot

$composeFiles = @((Join-Path $ProjectRoot "docker-compose.yml"))
foreach ($rel in $ExtraComposeFiles) {
  $composeFiles += (Join-Path $ProjectRoot $rel)
}
$fileArgs = @()
foreach ($f in $composeFiles) {
  $fileArgs += "-f"
  $fileArgs += $f
}

Write-Host "Docker: $docker" -ForegroundColor DarkGray
Write-Host "docker compose $($fileArgs -join ' ') $($ComposeArguments -join ' ')" -ForegroundColor Cyan
& $docker compose @fileArgs @ComposeArguments
exit $LASTEXITCODE
