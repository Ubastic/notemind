# Build script for Windows deployment
# Run this on a Windows machine to generate the single-file executable

# Exit on error
$ErrorActionPreference = "Stop"

Write-Host "=== NoteMind Windows Build Script ===" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$localPythonDir = Join-Path $scriptDir ".python38"
$localPythonExe = Join-Path $localPythonDir "python.exe"

$PYTHON_BIN = $null
$PYTHON_ARGS = @()

function Install-LocalPython38 {
    Write-Host "No Python found. Downloading local Python 3.8.10 (amd64)..." -ForegroundColor Yellow
    if (-not (Test-Path $localPythonDir)) { New-Item -ItemType Directory -Path $localPythonDir | Out-Null }
    $installerPath = Join-Path $env:TEMP "python-3.8.10-amd64.exe"
    $downloadUrl = "https://www.python.org/ftp/python/3.8.10/python-3.8.10-amd64.exe"
    Write-Host "Downloading: $downloadUrl" -ForegroundColor Yellow
    Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing
    Write-Host "Installing Python 3.8.10 to $localPythonDir ..." -ForegroundColor Yellow
    $installArgs = @(
        '/quiet',
        'InstallAllUsers=0',
        'PrependPath=0',
        'Include_pip=1',
        "TargetDir=$localPythonDir",
        'SimpleInstall=1'
    )
    $process = Start-Process -FilePath $installerPath -ArgumentList $installArgs -PassThru -Wait
    if ($process.ExitCode -ne 0 -or -not (Test-Path $localPythonExe)) {
        Write-Host "Failed to install Python 3.8.10 (exit code $($process.ExitCode))." -ForegroundColor Red
        exit 1
    }
    Write-Host "Local Python 3.8.10 installed." -ForegroundColor Green
}

# 1. Setup Python Environment
$envPython = $env:PYTHON_BIN

function Test-Python38 {
    param(
        [string]$Path,
        [string[]]$Args
    )
    if (-not $Path) { return $false }
    $cmd = Get-Command $Path -ErrorAction SilentlyContinue
    $cmdExists = (Test-Path $Path) -or $cmd
    if (-not $cmdExists) { return $false }
    if ($cmd -and $cmd.Source -eq 'AppX') { return $false }
    try {
        $versionOutput = (& $Path @Args --version 2>$null)
    } catch {
        return $false
    }
    if ($LASTEXITCODE -ne 0) { return $false }
    return $versionOutput -match "^Python 3\.8"
}

$candidates = @(
    @{Path=$envPython; Args=@()},
    @{Path=$localPythonExe; Args=@()},
    @{Path="py"; Args=@("-3.8")},
    @{Path="python"; Args=@()},
    @{Path="python3"; Args=@()}
)

foreach ($c in $candidates) {
    if (Test-Python38 -Path $c.Path -Args $c.Args) {
        $PYTHON_BIN = $c.Path
        $PYTHON_ARGS = $c.Args
        break
    }
}

if (-not $PYTHON_BIN) {
    Install-LocalPython38
    $PYTHON_BIN = $localPythonExe
    $PYTHON_ARGS = @()
}

Write-Host "Using Python: $PYTHON_BIN $($PYTHON_ARGS -join ' ')" -ForegroundColor Green

# Verify Python version
$pythonVersion = & $PYTHON_BIN @PYTHON_ARGS --version 2>&1
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
    & $PYTHON_BIN @PYTHON_ARGS -m venv venv
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

# Avoid slow/failed version checks
$env:PIP_DISABLE_PIP_VERSION_CHECK = "1"
$env:HTTP_PROXY = ""
$env:HTTPS_PROXY = ""
$env:ALL_PROXY = ""
$env:NO_PROXY = "*"
$env:PIP_NO_PROXY = "*"
$env:PIP_CONFIG_FILE = Join-Path $scriptDir "pip-no-config.ini"
if (-not (Test-Path $env:PIP_CONFIG_FILE)) { Set-Content -Path $env:PIP_CONFIG_FILE -Value "" -Encoding ascii }

# Ensure pip is available in venv (Python 3.7 may not include it)
& $VENV_PYTHON -m ensurepip --default-pip
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to ensure pip in venv." -ForegroundColor Red
    exit 1
}

try {
    & $VENV_PYTHON -m pip install --upgrade pip --trusted-host pypi.org --trusted-host files.pythonhosted.org --no-cache-dir
    if ($LASTEXITCODE -ne 0) {
        throw "pip upgrade returned $LASTEXITCODE"
    }
} catch {
    Write-Host "Warning: pip upgrade failed, continue with existing pip. Details: $_" -ForegroundColor Yellow
}

$pipArgs = @(
    '-m','pip','install','-r','requirements.txt',
    '--no-cache-dir',
    '--trusted-host','pypi.org',
    '--trusted-host','files.pythonhosted.org'
)

& $VENV_PYTHON @pipArgs
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
