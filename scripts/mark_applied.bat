@echo off
REM Double-click this to record a job you have already submitted yourself.
REM It asks for the Job ID (e.g. JOB-014) and marks it Submitted in the tracker.
cd /d "%~dp0"
python -m pip install --quiet openpyxl
python mark_applied.py %*
echo.
pause
