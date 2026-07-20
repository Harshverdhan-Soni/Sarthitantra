# Job Pilot — local setup

A control panel for your Cowork job-application pipeline. Start from your
resume, derive preferences, connect your Cowork project folder, and review
listings with their tailored resume/cover files.

## Prerequisites

- **Node.js 18+** (`node -v`). Get the LTS from https://nodejs.org.
- For folder features: **Chrome or Edge** (uses the File System Access API).

## Run it

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually http://localhost:5173).

## How it works

**Setup tab**
- Upload your resume (PDF/DOCX/TXT). It's read in your browser — nothing is
  uploaded. Skills, titles, seniority, locations, and contact details are
  derived and fill the editable form; suggested filters go to the Preferences tab.
- Review/edit, then **Generate & download profile.md**.
- **Connect project folder** (Chrome/Edge) to link your Cowork folder. You can
  then **Update master CV** (writes into `master/`) and read the tracker live.

**Cowork (outside the app)**
- Reads `profile.md`, sources + scores jobs, writes `applications_tracker.xlsx`
  and tailored files into `jobs/<Company>_<Role>/`. Run it manually, or schedule
  it in Claude Desktop with `/schedule`.

**Job Board tab**
- If the folder is connected, **Refresh from folder** reads the latest tracker;
  otherwise use **Import tracker**.
- Each job shows a fit score, status, and — when the folder is connected —
  **Resume** / **Cover** buttons that preview the tailored files inline.
- Star picks and **Export shortlist** for Cowork's tailor/pre-fill stage.

## Build & deploy

```bash
npm run build      # outputs dist/
```
Drag `dist/` onto https://app.netlify.com/drop. Note: folder features need
https (Netlify is fine) or localhost.

## Notes

- Preferences, profile, and listings are saved in your browser (localStorage).
- The folder connection is remembered, but the browser re-asks permission each
  session — click **Reconnect folder**.
- Resume analysis is keyword-based — a strong first draft to refine, not a final read.
