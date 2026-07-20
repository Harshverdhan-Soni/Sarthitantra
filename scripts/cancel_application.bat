@echo off
REM Double-click to CANCEL an approved/queued application so the next scheduled
REM run will NOT pre-fill or apply to it. The row stays in the tracker (marked
REM Cancelled). It asks for the Job ID (e.g. JOB-048).
cd /d "%~dp0"
python -m pip install --quiet openpyxl
python cancel_application.py %*
echo.
pause
