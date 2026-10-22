@echo off
rem Starts the Python server (venv "dt") and opens the browser. Close this window to stop the server.
cd /d "%~dp0"
if not exist dt\Scripts\activate.bat (
  echo [dt] virtual environment not found. Run once:
  echo   python -m venv dt ^&^& dt\Scripts\activate ^&^& pip install -r requirements.txt
  pause
  exit /b 1
)
call dt\Scripts\activate.bat
start "" http://127.0.0.1:8000
uvicorn server.main:app --reload
