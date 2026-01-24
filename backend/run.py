import uvicorn
import os
import sys
import argparse
import app.main  # Explicit import for PyInstaller analysis

if __name__ == "__main__":
    # Freeze support for multiprocessing in PyInstaller
    from multiprocessing import freeze_support
    freeze_support()
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Notemind Server")
    parser.add_argument(
        "--host", 
        type=str, 
        default=os.getenv("HOST", "0.0.0.0"),
        help="Host to bind to (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--port", 
        type=int, 
        default=int(os.getenv("PORT", "80")),
        help="Port to bind to (default: 80)"
    )
    args = parser.parse_args()
    
    # Run the app
    # reload=False is important for frozen app
    # Pass the app object directly instead of string to ensure it's loaded
    print(f"Starting server on {args.host}:{args.port}")
    uvicorn.run(app.main.app, host=args.host, port=args.port, reload=False, workers=1)
