# Поднять стек без Caddy (порты 3000, 3001, 4001 на хосте).
& "$PSScriptRoot\Invoke-DockerCompose.ps1" -ComposeArguments @("up", "-d")
