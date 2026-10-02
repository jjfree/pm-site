param([string]$PythonCommand = "python")
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
& $PythonCommand -m venv .venv
if ($LASTEXITCODE -ne 0) { throw "Python environment setup failed" }
& .\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed" }
Write-Host "Setup complete. Run scripts\start.bat to open the local app."
