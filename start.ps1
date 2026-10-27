# NER-SMART one-click start (Windows PowerShell)
# Starts the FastAPI backend and the Vite dev server, then opens the dashboard.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== Starting NER-SMART (Windows) ===" -ForegroundColor Cyan

# --- Backend ---
if (-not (Test-Path "$root\backend\venv\Scripts\python.exe")) {
    Write-Host "[1/3] Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv "$root\backend\venv"
    & "$root\backend\venv\Scripts\python.exe" -m pip install --upgrade pip
    & "$root\backend\venv\Scripts\python.exe" -m pip install -r "$root\backend\requirements.txt"
}

Write-Host "[1/3] Starting backend on http://127.0.0.1:8000 ..." -ForegroundColor Yellow
$backend = Start-Process -FilePath "$root\backend\venv\Scripts\python.exe" `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000" `
    -WorkingDirectory "$root\backend" -PassThru -WindowStyle Hidden

Write-Host "[2/3] Waiting for backend... $backend.Id"
Start-Sleep -Seconds 6

# --- Frontend deps ---
if (-not (Test-Path "$root\frontend\node_modules")) {
    Write-Host "[2/3] Installing frontend dependencies..." -ForegroundColor Yellow
    npm install --prefix "$root\frontend"
}

Write-Host "[2/3] Starting frontend on http://localhost:5173 ..." -ForegroundColor Yellow
$frontend = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run dev" `
    -WorkingDirectory "$root\frontend" -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 6
Write-Host "[3/3] Opening dashboard..." -ForegroundColor Yellow
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "NER-SMART running:" -ForegroundColor Green
Write-Host "  Frontend : http://localhost:5173"
Write-Host "  Backend  : http://127.0.0.1:8000   (docs: /docs)"
Write-Host "  Press Ctrl+C or close the terminal to stop the servers."
Write-Host ""
Write-Host "Tip: restart the backend to reset demo data to a clean seed state." -ForegroundColor DarkGray