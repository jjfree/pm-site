param([ValidateRange(1, 65535)][int]$Port = 8765, [switch]$NoBrowser)
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Test-Path -LiteralPath ".venv\Scripts\python.exe")) { throw "Run scripts\setup.ps1 first" }
if (-not (Test-Path -LiteralPath "app\static\index.html")) { throw "Frontend assets are missing; run the frontend build" }
$url = "http://127.0.0.1:$Port"
$serverStatus = & .\.venv\Scripts\python.exe scripts/check_server.py $Port
if ($LASTEXITCODE -ne 0) { throw "Unable to check local service status" }
if ($serverStatus -eq "same") {
    Write-Host "PM Site is already running at $url. Opening the existing workspace."
    if (-not $NoBrowser) { Start-Process $url }
    exit 0
}
if ($serverStatus -ne "available") { throw "Port $Port is occupied by another or unrecognized service. Select another port with -Port. No process was stopped." }
if (-not $NoBrowser) {
    Start-Process powershell -WindowStyle Hidden -ArgumentList @("-NoProfile", "-Command", "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:$Port'")
}
& .\.venv\Scripts\python.exe -m uvicorn app.api:app --host 127.0.0.1 --port $Port --no-access-log
exit $LASTEXITCODE
