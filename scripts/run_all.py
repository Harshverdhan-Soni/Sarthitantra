"""
Run this script from Windows to generate all 4 docx files + update tracker.

Requirements (install once):
    pip install python-docx openpyxl

Then run:
    python run_all.py
"""
import subprocess, sys, importlib

# ── auto-install missing deps ──────────────────────────────────────────────
for pkg, imp in [("docx", "docx"), ("openpyxl", "openpyxl")]:
    try:
        importlib.import_module(imp)
    except ImportError:
        print(f"Installing {pkg}…")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "-q"])

# ── generate docs ──────────────────────────────────────────────────────────
import os, pathlib
base = pathlib.Path(__file__).parent.parent  # JobFinder root

scripts = [
    # Run 3 (2026-06-30)
    "buzzboard_resume_py.py",
    "buzzboard_cover_py.py",
    "breachlock_resume_py.py",
    "breachlock_cover_py.py",
    "tracker_update.py",
    # Run 4 (2026-07-01)
    "northbay_genai_lead_resume_py.py",
    "northbay_genai_lead_cover_py.py",
    "northbay_azure_ai_resume_py.py",
    "northbay_azure_ai_cover_py.py",
    "tracker_update_run4.py",
    # Run 5 (2026-07-02)
    "nagarro_genai_resume_py.py",
    "nagarro_genai_cover_py.py",
    "cotiviti_principal_ai_resume_py.py",
    "cotiviti_principal_ai_cover_py.py",
    "tracker_update_run5.py",
    # Run 6 (2026-07-03)
    "nagarro_principal_ml_resume_py.py",
    "nagarro_principal_ml_cover_py.py",
    "ahead_data_ai_resume_py.py",
    "ahead_data_ai_cover_py.py",
    "tracker_update_run6.py",
    # Run 7 (2026-07-05)
    "bridgeit_ai_architect_resume_py.py",
    "bridgeit_ai_architect_cover_py.py",
    "wadhwaniai_ml_scientist_llm_resume_py.py",
    "wadhwaniai_ml_scientist_llm_cover_py.py",
    "tracker_update_run7.py",
    # Run 8 (2026-07-06) — already executed via Cowork bash this run;
    # kept here for reference / re-run only if you need to regenerate the docs.
    # NOTE: re-running tracker_update_run8.py will re-append duplicate rows.
    # "plextrac_resume_py.py",
    # "plextrac_cover_py.py",
    # "xenon7_senior_resume_py.py",
    # "xenon7_senior_cover_py.py",
    # "tracker_update_run8.py",
    # Run 9 (2026-07-08) — already executed via Cowork bash this run;
    # kept here for reference / re-run only if you need to regenerate the docs.
    # NOTE: re-running tracker_update_run9.py will re-append duplicate rows.
    # "siapartners_genai_resume_py.py",
    # "siapartners_genai_cover_py.py",
    # "highlevel_sde3_genai_resume_py.py",
    # "highlevel_sde3_genai_cover_py.py",
    # "tracker_update_run9.py",
    # Run 10 (2026-07-08) — docx files already generated via Cowork bash this run.
    # tracker_update_run10.py could NOT be applied automatically because
    # applications_tracker_NEW.xlsx was open/locked in Excel at run time.
    # Close the tracker in Excel before running this script.
    # "srijan_lead_ai_resume_py.py",
    # "srijan_lead_ai_cover_py.py",
    # "quantumloopai_promptengineer_resume_py.py",
    # "quantumloopai_promptengineer_cover_py.py",
    "tracker_update_run10.py",
]

for s in scripts:
    p = pathlib.Path(__file__).parent / s
    print(f"\n▶ {s}")
    result = subprocess.run([sys.executable, str(p)], capture_output=True, text=True)
    if result.stdout: print(result.stdout.strip())
    if result.returncode != 0:
        print(f"  ERROR: {result.stderr.strip()}")
    else:
        print("  ✓")

print("\nDone. Check jobs/ subfolders and applications_tracker_NEW.xlsx.")
