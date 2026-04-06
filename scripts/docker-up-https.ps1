# Поднять стек + Caddy на 80/443 (Let's Encrypt, deploy/Caddyfile).
& "$PSScriptRoot\Invoke-DockerCompose.ps1" -ComposeArguments @("--profile", "https", "up", "-d")
