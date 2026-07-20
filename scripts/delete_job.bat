@echo off
REM Double-click to permanently DELETE a job from the tracker list.
REM It asks for the Job ID (e.g. JOB-095) and confirms before deleting.
REM Add --files after the Job ID to also delete its tailored documents.
cd /d "%~dp0"
python -m pip install --quiet openpyxl
python delete_job.py %*
echo.
pause
