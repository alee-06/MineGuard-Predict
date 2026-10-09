@echo off
echo ========================================================
echo Running MineGuard Predict Data Generator & Training Pipeline
echo ========================================================
call .venv\Scripts\activate.bat
python -m ml.train
pause
