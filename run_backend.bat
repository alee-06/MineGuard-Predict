@echo off
echo ========================================================
echo Starting MineGuard Predict Backend Server (FastAPI)
echo Serving on http://127.0.0.1:8000
echo ========================================================
call .venv\Scripts\activate.bat
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
pause
