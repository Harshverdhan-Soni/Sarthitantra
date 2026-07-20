@echo off
REM Run 24 (2026-07-20) - generate this run's tailored docs and update the tracker.
REM Double-click this file (or run from a terminal) on your machine.
cd /d "%~dp0"

echo Installing dependencies (python-docx, openpyxl)...
python -m pip install --quiet python-docx openpyxl

echo.
echo Generating Globalization Partners - Principal Software Engineer, AI Platform documents (JOB-116)...
python globalization_partners_principal_ai_platform_resume_py.py
python globalization_partners_principal_ai_platform_cover_py.py

echo.
echo Generating Unisys - Lead Engineer AI/ML documents (JOB-117)...
python unisys_lead_ai_ml_resume_py.py
python unisys_lead_ai_ml_cover_py.py

echo.
echo Updating applications tracker (Run 24: appends the 5 sourced roles, deduping any already logged)...
python tracker_update_run24.py

echo.
echo Done. Tailored docs are in ..\jobs\ and the tracker is updated.
pause
