# Полный стек в Docker без прод-доменов в сборке витрины (docker-compose.local.yml).
& "$PSScriptRoot\Invoke-DockerCompose.ps1" -ExtraComposeFiles @("docker-compose.local.yml") -ComposeArguments @("up", "-d")
