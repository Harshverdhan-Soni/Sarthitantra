# Sarthitantra — AI-Powered Job Application Assistant

> **Sarthitantra** (सार्थितंत्र) — *a system that drives purpose.*

An end-to-end personal job application pipeline powered by Claude AI (via Cowork). It sources new roles, scores and filters them against your profile, tailors your resume and cover letter for each, pre-fills application forms in your browser, and tracks everything in one place — with you staying in control of the final submit.

---

## Features

- **Job Pilot UI** — A React dashboard to browse sourced jobs, review tailored documents, and approve applications with one click
- **Automated sourcing** — Finds fresh AI/ML roles daily from public career pages and job boards
- **Smart scoring** — Rates each role 0–100 against your skill profile and filters out deal-breakers automatically
- **Resume + cover letter tailoring** — Generates job-specific `.docx` files mirroring the JD's keywords without overstating experience
- **Browser pre-fill** — Uses Claude in Chrome to open the application form and fill fields from your profile; always stops before Submit
- **Application tracker** — Every action is logged to an Excel tracker with color-coded status
- **Approve to Apply** — In-UI button to queue jobs for automated pre-fill; amber "Update & Retry" for already-queued jobs
- **Scheduled daily run** — Configured via Cowork to run the full pipeline at 10:30 AM every day

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Icons | Lucide React |
| Automation | Python 3, openpyxl, python-docx |
| AI | Claude (via Anthropic Cowork) |
| Browser control | Claude in Chrome MCP |
| Tracker | Excel (`.xlsx`) via openpyxl |
| Scheduling | Cowork scheduled tasks (cron) |

---

## Project Structure

```
JobFinder/
├── job-pilot/              # React frontend (Job Pilot UI)
│   ├── src/
│   │   ├── JobPilot.jsx    # Main app component
│   │   ├── skillsCatalog.js
│   │   ├── resumeAnalyzer.js
│   │   └── folderAccess.js
│   ├── dist/               # Built static files (deploy this)
│   └── package.json
│
├── scripts/                # Python automation scripts
│   ├── apply_approved.py   # Generates apply_queue.json from tracker
│   ├── tracker_update.py   # Appends new jobs to tracker (per run)
│   ├── _resume_lib.py      # Shared resume generation helpers
│   ├── run_all.py          # Batch runner for document generation
│   ├── run_all.bat         # Windows batch runner
│   ├── mark_applied.py     # Mark a job as Submitted
│   ├── cancel_application.py
│   ├── delete_job.py
│   └── pending_confirmations.py
│
├── master/                 # Your master resume base (gitignored)
├── jobs/                   # Tailored resumes/covers per job (gitignored)
├── profile.md              # Your personal profile & preferences (gitignored)
├── folder-instructions.md  # Cowork loop instructions
└── applications_tracker_NEW.xlsx  # Live job tracker (gitignored)
```

---

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- Python 3.10+
- [Claude Desktop](https://claude.ai/download) with Cowork mode
- `python-docx` and `openpyxl`: `pip install python-docx openpyxl`

### 1. Clone the repo

```bash
git clone https://github.com/Harshverdhan-Soni/Sarthitantra.git
cd Sarthitantra
```

### 2. Set up your profile

Create `profile.md` in the root (see `profile.md` template below — this file is gitignored and stays local).

Key sections:
- **Section 1** — Personal details (name, email, phone, location, LinkedIn, GitHub, portfolio)
- **Section 2** — Work eligibility (notice period, expected CTC, start date)
- **Section 7** — Skills keyword bank (used for scoring)
- **Section 9** — Job preferences and deal-breakers
- **Section 10** — Tailoring rules

### 3. Set up the master resume

Place your master resume at `master/<YourName>_Master_Resume.docx`. This is never overwritten.

### 4. Run the Job Pilot UI locally

```bash
cd job-pilot
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### 5. Build for deployment

```bash
cd job-pilot
npm run build
# Deploy the contents of job-pilot/dist/ to Netlify or any static host
```

### 6. Configure Cowork

Open the `JobFinder` folder in Cowork. It reads `folder-instructions.md` automatically. The daily scheduled task (`jobfinder-daily-run`) runs Steps 1–6 of the pipeline at 10:30 AM.

---

## How the Pipeline Works

```
Daily run (10:30 AM, automated)
│
├─ Step 1: Source — find 5 new AI/ML roles via web search
├─ Step 2: Dedupe — skip roles already in tracker
├─ Step 3: Score — rate 0–100 against profile.md
├─ Step 4: Filter — skip deal-breakers; flag ineligible roles
├─ Step 5: Tailor — generate resume + cover letter for top 2 roles
└─ Step 6: Pre-fill — open each "Awaiting approval" job in Chrome,
           fill form fields from profile.md, attach resume,
           screenshot filled form, STOP before Submit

Manual steps (you decide)
│
├─ Review tailored documents and pre-filled form screenshots
├─ Click Submit on each application yourself
└─ Mark as Submitted in Job Pilot UI or tracker
```

---

## The "Approve to Apply" Flow

1. A job appears in Job Pilot UI after sourcing and tailoring
2. Click **Approve to Apply** (green button) on any tile
3. Fill in any missing fields in the inline panel that opens
4. Confirm — job status moves to **Awaiting approval** and is queued
5. On the next run, `apply_approved.py` picks it up → browser pre-fill runs automatically
6. You receive a screenshot of the filled form and submit manually

---

## Hard Rules (enforced in all automation)

- Never submit, send, or finalise an application without explicit approval
- Never enter passwords, OTPs, government IDs, or bank/card details into any form
- Never include confidential employer data (internal ratings, government metrics)
- Never apply to a deal-breaker role even if it scores well
- Never invent or overstate experience — only reframe what is true
- Respect the daily application cap defined in `profile.md §9`

---

## Roadmap

- [ ] Supabase backend — move data from localStorage + Excel to a cloud database
- [ ] Multi-user support — each user gets their own profile and tracker
- [ ] Netlify deployment with auth
- [ ] Admin panel to manage user accounts
- [ ] Email/webhook notifications when pre-fill completes

---

## License

Personal project — not licensed for redistribution. Contact the author for collaboration.
