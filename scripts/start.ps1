param([int]$Port = 8765, [switch]$NoBrowser)
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Test-Path -LiteralPath ".venv\Scripts\python.exe")) { throw "Run scripts\setup.ps1 first" }
if (-not (Test-Path -LiteralPath "app\static\index.html")) { throw "Frontend assets are missing; run the frontend build" }
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) { throw "Port $Port is occupied. Select another port with -Port. No process was stopped." }
if (-not $NoBrowser) {
    Start-Process powershell -WindowStyle Hidden -ArgumentList @("-NoProfile", "-Command", "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:$Port'")
}
& .\.venv\Scripts\python.exe -m uvicorn app.api:app --host 127.0.0.1 --port $Port --no-access-log
exit $LASTEXITCODE
