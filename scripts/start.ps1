param([ValidateRange(1, 65535)][int]$Port = 8765, [switch]$NoBrowser)
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Test-Path -LiteralPath ".venv\Scripts\python.exe")) { throw "Run scripts\setup.ps1 first" }
if (-not (Test-Path -LiteralPath "app\static\index.html")) { throw "Frontend assets are missing; run the frontend build" }
$assetTag = (Get-FileHash -LiteralPath "app\static\index.html" -Algorithm SHA256).Hash.Substring(0, 12)
$url = "http://127.0.0.1:$Port/?v=$assetTag"
$serverStatus = & .\.venv\Scripts\python.exe scripts/check_server.py $Port
if ($LASTEXITCODE -ne 0) { throw "Unable to check local service status" }
if ($serverStatus -eq "same" -or $serverStatus -eq "stale") {
    $listenerIds = @(netstat -ano -p TCP | ForEach-Object {
        if ($_ -match "^\s*TCP\s+127\.0\.0\.1:$Port\s+0\.0\.0\.0:0\s+\S+\s+(\d+)\s*$") {
            [int]$Matches[1]
        }
    } | Sort-Object -Unique)
    if ($listenerIds.Count -ne 1) { throw "Could not identify the PM Site process on port $Port. Stop its original terminal and retry." }
    $serverProcess = Get-Process -Id $listenerIds[0] -ErrorAction Stop
    if ($serverProcess.ProcessName -notin @("python", "pythonw")) {
        throw "The process on port $Port is not a Python server. Stop its original terminal and retry."
    }
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 3
    if ($health.pid) {
        if ([int]$health.pid -ne $serverProcess.Id) {
            throw "The PM Site process identity did not match port $Port. Stop its original terminal and retry."
        }
    } elseif ($serverStatus -eq "stale") {
        # Older PM Site releases had no PID in health; verify their bootstrap response before replacing them.
        $bootstrapResponse = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/bootstrap" -UseBasicParsing -TimeoutSec 3
        $bootstrap = $bootstrapResponse.Content | ConvertFrom-Json
        if (-not $bootstrap.csrf -or $bootstrap.version -ne $health.version -or
            $bootstrapResponse.Headers["Set-Cookie"] -notmatch "pm_session=") {
            throw "Could not verify the older PM Site server on port $Port. Stop its original terminal and retry."
        }
    } else {
        throw "Could not verify the PM Site process on port $Port. Stop its original terminal and retry."
    }
    $confirmedStatus = & .\.venv\Scripts\python.exe scripts/check_server.py $Port
    if ($LASTEXITCODE -ne 0 -or $confirmedStatus -notin @("same", "stale")) {
        throw "The process on port $Port changed before restart. Retry start.bat."
    }
    Write-Host "Restarting PM Site on port $Port (process $($serverProcess.Id))."
    Stop-Process -Id $serverProcess.Id -ErrorAction Stop
    $serverStatus = "occupied"
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        $serverStatus = & .\.venv\Scripts\python.exe scripts/check_server.py $Port
        if ($serverStatus -eq "available") { break }
    }
    if ($serverStatus -ne "available") { throw "The old PM Site server did not release port $Port. Retry after its terminal closes." }
}
if ($serverStatus -ne "available") { throw "Port $Port is occupied by another or unrecognized service. Select another port with -Port. No process was stopped." }
if (-not $NoBrowser) {
    Start-Process powershell -WindowStyle Hidden -ArgumentList @("-NoProfile", "-Command", "Start-Sleep -Seconds 2; Start-Process '$url'")
}
& .\.venv\Scripts\python.exe -m uvicorn app.api:app --host 127.0.0.1 --port $Port --no-access-log
exit $LASTEXITCODE
