#!/bin/bash

# Build script for Kylin 10 / Linux deployment
# Run this on a Linux machine (or WSL) to generate the single-file executable

# 1. Setup Python Environment
# You can change this to your specific python executable, e.g., /usr/bin/python3.7
PYTHON_BIN=${PYTHON_BIN:-python3}

if ! command -v "$PYTHON_BIN" &> /dev/null; then
    # Fallback to explicit python3.7 if python3 not found, or user specified path
    if command -v /usr/bin/python3.7 &> /dev/null; then
        PYTHON_BIN="/usr/bin/python3.7"
    else
        echo "Python executable '$PYTHON_BIN' not found. Please install Python 3.7+."
        exit 1
    fi
fi

echo "Using Python: $PYTHON_BIN"

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    "$PYTHON_BIN" -m venv venv
    if [ $? -ne 0 ]; then
        echo "Error: Failed to create virtual environment."
        echo "On Debian/Ubuntu/Kylin with Python 3.7, you likely need to install the venv module:"
        echo "  apt-get install python3.7-venv"
        echo "Or for generic python3:"
        echo "  apt-get install python3-venv"
        exit 1
    fi
fi

source venv/bin/activate

# 2. Install Dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# 3. Build Frontend (requires Node.js)
# If you have already built frontend on Windows and copied dist/, you can skip this
if [ -d "../frontend" ]; then
    echo "Check if we need to build frontend..."
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
pyinstaller notemind.spec --clean --noconfirm

echo "Build Complete!"
echo "The executable is located at: dist/notemind-server"
echo "You can copy 'dist/notemind-server' to your Kylin 10 machine and run it directly."
