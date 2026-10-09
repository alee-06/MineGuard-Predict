@echo off
echo ========================================================
echo Running MineGuard Predict Automated Test Suite (Pytest)
echo ========================================================
call .venv\Scripts\activate.bat
pytest
pause
