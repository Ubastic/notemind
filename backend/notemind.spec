# -*- mode: python ; coding: utf-8 -*-
import sys
import os
from PyInstaller.utils.hooks import copy_metadata, collect_submodules

block_cipher = None

# Ensure we can find the app module
sys.path.insert(0, os.path.abspath("."))

# Collect all submodules for complex packages to avoid missing hidden imports
hidden_imports = []
hidden_imports += collect_submodules('fastapi')
hidden_imports += collect_submodules('starlette')
hidden_imports += collect_submodules('uvicorn')
hidden_imports += collect_submodules('pydantic')
hidden_imports += collect_submodules('sqlalchemy')
hidden_imports += collect_submodules('cryptography')
hidden_imports += collect_submodules('jose')
hidden_imports += collect_submodules('passlib')
hidden_imports += collect_submodules('multipart')
hidden_imports += collect_submodules('anyio')

# Add specific individual modules that might be missed
hidden_imports += [
    'uvloop',
    'httptools',
    'watchfiles',
    'email',
    'email.message',
    'email.mime',
    'python_multipart',
    'bcrypt',
    'pytz',
    'aiofiles',
    'dashscope',
    'requests',
    'idna',
    'certifi',
    'charset_normalizer',
    'urllib3',
    'sqlite3',
    'distutils',
    'python-dotenv',
    'importlib_metadata',
    'typing_extensions',
]

a = Analysis(
    ['run.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('app', 'app'),
        ('../frontend/dist', 'frontend/dist'),  # Embed frontend if built
        ('.env.example', '.'),
    ] + copy_metadata('sqlalchemy') + copy_metadata('requests'),
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'unittest', 'pdb'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='notemind-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
