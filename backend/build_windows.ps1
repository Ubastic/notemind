# Build script for Windows deployment
# Run this on a Windows machine to generate the single-file executable

# Exit on error
$ErrorActionPreference = "Stop"

Write-Host "=== NoteMind Windows Build Script ===" -ForegroundColor Cyan

# 1. Setup Python Environment
$PYTHON_BIN = $env:PYTHON_BIN
if (-not $PYTHON_BIN) {
    # Try to find python in PATH
    if (Get-Command python -ErrorAction SilentlyContinue) {
        $PYTHON_BIN = "python"
    } elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
        $PYTHON_BIN = "python3"
    } else {
        Write-Host "Python not found. Please install Python 3.7+ or set PYTHON_BIN environment variable." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Using Python: $PYTHON_BIN" -ForegroundColor Green

# Verify Python version
$pythonVersion = & $PYTHON_BIN --version 2>&1
Write-Host "Python version: $pythonVersion" -ForegroundColor Green

# Clean up broken venv if present
if (Test-Path "venv") {
    $venvPython = "venv\Scripts\python.exe"
    if (-not (Test-Path $venvPython)) {
        Write-Host "Found broken venv directory (missing Scripts\python.exe). Removing..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force venv
    }
}

# Create virtual environment if it doesn't exist
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    & $PYTHON_BIN -m venv venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to create virtual environment." -ForegroundColor Red
        exit 1
    }
}

# Define paths to venv binaries
$VENV_PYTHON = ".\venv\Scripts\python.exe"
$VENV_PIP = ".\venv\Scripts\pip.exe"

# Check if venv python exists
if (-not (Test-Path $VENV_PYTHON)) {
    Write-Host "Error: Virtual environment python not found at $VENV_PYTHON" -ForegroundColor Red
    exit 1
}

Write-Host "Virtual environment ready." -ForegroundColor Green

# 2. Install Dependencies
Write-Host "Installing dependencies using venv pip..." -ForegroundColor Yellow
& $VENV_PIP install --upgrade pip
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to upgrade pip." -ForegroundColor Red
    exit 1
}

& $VENV_PIP install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install requirements." -ForegroundColor Red
    exit 1
}

# 3. Build Frontend (requires Node.js)
if (Test-Path "..\frontend") {
    Write-Host "Checking frontend..." -ForegroundColor Yellow
    if (-not (Test-Path "..\frontend\dist")) {
        Write-Host "Building Frontend..." -ForegroundColor Yellow
        Push-Location ..\frontend
        if (Get-Command npm -ErrorAction SilentlyContinue) {
            npm install
            if ($LASTEXITCODE -ne 0) {
                Write-Host "npm install failed." -ForegroundColor Red
                Pop-Location
                exit 1
            }
            npm run build
            if ($LASTEXITCODE -ne 0) {
                Write-Host "npm run build failed." -ForegroundColor Red
                Pop-Location
                exit 1
            }
        } else {
            Write-Host "Node.js not found. Cannot build frontend. Please ensure 'frontend\dist' exists." -ForegroundColor Red
            Pop-Location
            exit 1
        }
        Pop-Location
    } else {
        Write-Host "Frontend dist exists, skipping build." -ForegroundColor Green
    }
}

# 4. Build Backend Executable
Write-Host "Building Backend Executable..." -ForegroundColor Yellow

# Clean previous build
if (Test-Path "dist") {
    Write-Host "Cleaning previous build..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force dist
}
if (Test-Path "build") {
    Remove-Item -Recurse -Force build
}

# Use venv python explicitly to invoke PyInstaller
& $VENV_PYTHON -m PyInstaller notemind.spec --clean --noconfirm
if ($LASTEXITCODE -ne 0) {
    Write-Host "----------------------------------------------------------------" -ForegroundColor Red
    Write-Host "BUILD FAILED" -ForegroundColor Red
    Write-Host "----------------------------------------------------------------" -ForegroundColor Red
    Write-Host "Please check the error messages above." -ForegroundColor Yellow
    Write-Host "Common issues:" -ForegroundColor Yellow
    Write-Host "  1. Missing dependencies in requirements.txt" -ForegroundColor Yellow
    Write-Host "  2. PyInstaller compatibility issues" -ForegroundColor Yellow
    Write-Host "  3. Frontend not built (check frontend\dist exists)" -ForegroundColor Yellow
    Write-Host "----------------------------------------------------------------" -ForegroundColor Red
    exit 1
}

Write-Host "================================================================" -ForegroundColor Green
Write-Host "Build Complete!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host "The executable is located at: dist\notemind-server.exe" -ForegroundColor Cyan
Write-Host ""
Write-Host "To run the server:" -ForegroundColor Yellow
Write-Host "  .\dist\notemind-server.exe --host 0.0.0.0 --port 80" -ForegroundColor White
Write-Host ""
Write-Host "Or simply double-click the executable (defaults to 0.0.0.0:80)" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Green
