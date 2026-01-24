#!/bin/bash

# Build script for Kylin 10 / Linux deployment
# Run this on a Linux machine (or WSL) to generate the single-file executable

# 1. Setup Python Environment
if ! command -v python3 &> /dev/null; then
    echo "Python3 could not be found. Please install it."
    exit 1
fi

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate

# 2. Install Dependencies
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
