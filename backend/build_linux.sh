#!/bin/bash

# Build script for Kylin 10 / Linux deployment
# Run this on a Linux machine to generate the single-file executable

# Exit on error
set -e

# 1. Setup Python Environment
# You can change this to your specific python executable, e.g., /usr/bin/python3.7
PYTHON_BIN=${PYTHON_BIN:-/usr/bin/python3.7}

echo "Looking for Python at: $PYTHON_BIN"

if ! command -v "$PYTHON_BIN" &> /dev/null; then
    # Fallback to explicit python3.7 if specified path not found
    if command -v /usr/bin/python3.7 &> /dev/null; then
        PYTHON_BIN="/usr/bin/python3.7"
        echo "Found fallback at: $PYTHON_BIN"
    else
        echo "Python executable '$PYTHON_BIN' not found. Please install Python 3.7+."
        exit 1
    fi
fi

echo "Using Python: $PYTHON_BIN"

# Clean up broken venv if present (if bin/python is missing)
if [ -d "venv" ] && [ ! -x "venv/bin/python" ]; then
    echo "Found broken venv directory (missing bin/python). Removing..."
    rm -rf venv
fi

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    # Try standard venv first
    if ! "$PYTHON_BIN" -m venv venv; then
        echo "Standard venv failed. Attempting fallback to 'virtualenv'..."
        
        # Check if virtualenv exists
        if ! command -v virtualenv &> /dev/null; then
            echo "'virtualenv' command not found. Trying to install it via pip..."
            # Try to install virtualenv using whatever pip is available
            # We try pip3 first, then pip
            if command -v pip3 &> /dev/null; then
                 pip3 install virtualenv
            elif command -v pip &> /dev/null; then
                 pip install virtualenv
            else
                 echo "No pip found to install virtualenv. Please install virtualenv manually."
                 exit 1
            fi
        fi
        
        # Try creating venv using virtualenv explicitly pointing to our python binary
        echo "Running: virtualenv -p $PYTHON_BIN venv"
        virtualenv -p "$PYTHON_BIN" venv
    fi
fi

# Define paths to venv binaries
VENV_PYTHON="./venv/bin/python"
VENV_PIP="./venv/bin/pip"

# Check if venv python exists
if [ ! -x "$VENV_PYTHON" ]; then
    echo "Error: Virtual environment python not found at $VENV_PYTHON"
    exit 1
fi

echo "Virtual environment ready."

# 2. Install Dependencies
echo "Installing dependencies using venv pip..."
"$VENV_PIP" install --upgrade pip
"$VENV_PIP" install -r requirements.txt

# 3. Build Frontend (requires Node.js)
if [ -d "../frontend" ]; then
    echo "Checking frontend..."
    if [ ! -d "../frontend/dist" ]; then
        echo "Building Frontend..."
        cd ../frontend
        if command -v npm &> /dev/null; then
            npm install
            npm run build
        else
            echo "Node.js not found. Cannot build frontend. Please ensure 'frontend/dist' exists."
        fi
        cd ../backend
    else
        echo "Frontend dist exists, skipping build."
    fi
fi

# 4. Build Backend Executable
echo "Building Backend Executable..."
# Use venv python explicitly to invoke PyInstaller
if ! "$VENV_PYTHON" -m PyInstaller notemind.spec --clean --noconfirm; then
    echo "----------------------------------------------------------------"
    echo "BUILD FAILED"
    echo "----------------------------------------------------------------"
    echo "If you saw 'OSError: Python library not found: libpython3.7.so',"
    echo "it means you are missing the Python development headers."
    echo ""
    echo "Please run the following command to install them:"
    echo "  sudo apt-get install python3.7-dev"
    echo "----------------------------------------------------------------"
    exit 1
fi

echo "Build Complete!"
echo "The executable is located at: dist/notemind-server"
echo "You can copy 'dist/notemind-server' to your Kylin 10 machine and run it directly."
