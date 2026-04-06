# Docker Engine static zip install for Windows Server (workaround if install-docker-ce.ps1
# stops on false "reboot required" after Add-WindowsFeature Containers).
# Run PowerShell as Administrator.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$current = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $current.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error "Run this script as Administrator."
  exit 1
}

$base = "https://download.docker.com/win/static/stable/x86_64/"
$page = Invoke-WebRequest -Uri $base -UseBasicParsing
$zips = $page.Links | Where-Object { $_.href -match "^docker-\d+\.\d+\.\d+\.zip$" } | ForEach-Object { $_.href } | Sort-Object -Descending
if (-not $zips) { throw "No docker-*.zip found at $base" }
$zipName = $zips[0]
$url = $base + $zipName
$folder = Join-Path $env:USERPROFILE "DockerDownloads"
$zipPath = Join-Path $folder $zipName
$extract = Join-Path $folder ($zipName -replace "\.zip$", "")

Write-Host "Downloading $url"
New-Item -ItemType Directory -Force -Path $folder | Out-Null
Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing

if (Test-Path $extract) { Remove-Item -Recurse -Force $extract }
Expand-Archive -Path $zipPath -DestinationPath $extract -Force

$dockerExe = Join-Path $extract "docker\docker.exe"
$dockerdExe = Join-Path $extract "docker\dockerd.exe"
if (-not (Test-Path $dockerExe)) { throw "docker.exe missing in archive" }

Write-Host "Copying to System32..."
Copy-Item -Path $dockerExe -Destination "$env:WINDIR\System32\docker.exe" -Force
Copy-Item -Path $dockerdExe -Destination "$env:WINDIR\System32\dockerd.exe" -Force

$dataRoot = Join-Path $env:ProgramData "docker"
$configDir = Join-Path $dataRoot "config"
New-Item -ItemType Directory -Force -Path $configDir | Out-Null

$daemonJson = Join-Path $configDir "daemon.json"
@{ "hosts" = @("npipe://") } | ConvertTo-Json | Out-File -FilePath $daemonJson -Encoding ascii -Force

$svc = Get-Service -Name "docker" -ErrorAction SilentlyContinue
if ($svc) {
  Write-Host "Stopping existing docker service..."
  Stop-Service -Name "docker" -Force -ErrorAction SilentlyContinue
  & dockerd.exe --unregister-service 2>$null
}

Write-Host "Registering docker service..."
& dockerd.exe --register-service --service-name docker
Start-Service -Name "docker"

Start-Sleep -Seconds 3
& docker.exe version

Write-Host ""
Write-Host "Done. This engine targets Windows containers by default."
Write-Host "Yanak uses Linux images: prefer Linux VPS or WSL2 + Docker if you need compose up."
