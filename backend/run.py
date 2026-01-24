import uvicorn
import os
import sys

if __name__ == "__main__":
    # Freeze support for multiprocessing in PyInstaller
    from multiprocessing import freeze_support
    freeze_support()
    
    # Determine port from env or default
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    
    # Run the app
    # reload=False is important for frozen app
    uvicorn.run("app.main:app", host=host, port=port, reload=False, workers=1)
