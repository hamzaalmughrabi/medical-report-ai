@echo off
echo [MedEcho] Starting Clinical AI Engine...
cd backend\app
..\..\.venv\Scripts\python.exe backend_api.py
pause
