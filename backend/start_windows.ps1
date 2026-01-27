# Quick start script for Windows - runs the built executable
# This is a convenience wrapper for the notemind-server.exe

param(
    [string]$Host = "0.0.0.0",
    [int]$Port = 80
)

$exePath = ".\dist\notemind-server.exe"

if (-not (Test-Path $exePath)) {
    Write-Host "Error: notemind-server.exe not found at $exePath" -ForegroundColor Red
    Write-Host "Please run build_windows.ps1 first to build the executable." -ForegroundColor Yellow
    exit 1
}

Write-Host "Starting NoteMind Server..." -ForegroundColor Green
Write-Host "Host: $Host" -ForegroundColor Cyan
Write-Host "Port: $Port" -ForegroundColor Cyan
Write-Host ""
Write-Host "Access the application at: http://localhost:$Port" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

& $exePath --host $Host --port $Port
