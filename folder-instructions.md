# Folder instructions — resume auto-apply

> Cowork reads this file automatically at the start of every task in this folder.
> It defines how you (Claude) run the job-application loop. `profile.md` is the
> source of truth for who I am and what I want — read it before every run.

## Context

You are running a personal job-application assistant. The goal is to source
matching roles, tailor my resume and cover letter for each, pre-fill the
application, and queue it for my approval — never to submit anything on your own.

## Files in this folder

- `active_track.json` — **read this first every session.** Written by `fetch_profile.py`; tells you which career track is active, which profile file to use, and which tracker file to write to.
- `profile.md` — Main track profile (details, preferences, tailoring rules, guardrails).
- `profile_<track>.md` — Profile for other career tracks (e.g. `profile_photography.md`).
- `applications_tracker.xlsx` — Main track job log. One row per job; update at every step.
- `applications_tracker_<track>.xlsx` — Job log for non-Main tracks (e.g. `applications_tracker_photography.xlsx`).
- `master/<TrackName>/` — Master resume for that track. Tailor from here; never overwrite.
- `jobs/<Company>_<Role>/` — One subfolder per job for tailored outputs.

## The loop (run in this order)

0. **Sync profile and read active track (always first).**

   a. Run `python scripts/fetch_profile.py` (or `python scripts/fetch_profile.py --profile "TrackName"` to work on a specific track). This pulls the latest profile from the Sarthitantra cloud, writes `profile.md` / `profile_<track>.md`, downloads the master resume to `master/<TrackName>/`, and writes `active_track.json`.

   b. Read `active_track.json` immediately after the script finishes. It tells you:
      - `track` — the active career track name (e.g. `"Photography"`)
      - `profile_file` — which profile file to read (e.g. `"profile_photography.md"`)
      - `tracker_file` — which tracker to update (e.g. `"applications_tracker_photography.xlsx"`)
      - `resume_dir` — where the master resume lives (e.g. `"master/Photography/"`)

   Use **only** the files named in `active_track.json` for all subsequent steps. Do not read a different profile or write to a different tracker.

   If `sarthitantra_config.json` is missing, stop and tell me to download it from sarthitantra.netlify.app → Profile → Cowork Setup. Skip step 0 only if explicitly told to use the existing local files.

0c. **Apply for web-app-approved jobs — MANDATORY, do this before anything else.**

   Run: `python scripts/apply_approved.py`

   This script reads the tracker and writes `apply_queue.json` containing every
   job whose Status = "Awaiting approval". If `apply_queue.json` is empty or
   missing, skip ahead to step 1.

   For EACH entry in `apply_queue.json` you MUST perform ALL of the following
   browser actions immediately — do not defer, do not skip:

   a. **Open a new browser tab** using your Claude in Chrome browser tools
      (`tabs_create_mcp` or equivalent). One dedicated tab per job — never reuse
      a tab that already has a form open, as navigating away loses everything typed.

   b. **Navigate to the application URL.** Use the `Job URL` from the tracker row.
      If that URL is an aggregator (LinkedIn, Internshala, Himalayas, Naukri,
      Indeed, etc.) or the URL is dead, search the web for the company's official
      ATS / careers page for the same role and navigate there instead. Update the
      tracker Job URL to the official link.

   c. **Read the page** to identify every visible form field (name, email, phone,
      location, LinkedIn, portfolio, work authorization, sponsorship, notice period,
      expected CTC, start date, relocation, work mode, cover letter text, etc.).

   d. **Fill every field** using data from `profile.md` and the tracker row.
      Use your `form_input` / `find` / `javascript_tool` browser tools to target
      and fill each field. Do not leave any mandatory field blank if the data
      exists in `profile.md`.

   e. **Upload the tailored resume.** Use `file_upload` to attach
      `jobs/<Company>_<Role>/<Company>_<Role>_resume.docx` if it exists.
      Otherwise upload the master resume from `master/<TrackName>/`.

   f. **STOP — do NOT click Submit, Apply, Send, or any final confirmation button.
      Never solve a CAPTCHA. Never click "I'm not a robot".** The user always
      submits themselves.

   g. **Take a screenshot** of the filled form and include it in your run summary
      so the user can see what's ready.

   h. **Leave the tab open.** Do not close it. The user will review and click
      Submit from this tab.

   i. **Update the tracker row:** set `Last updated` = today and append
      `"Pre-filled on <YYYY-MM-DD>"` to the Notes field. Keep Status as
      "Awaiting approval" until the user confirms submission.

   Repeat a–i for every job in `apply_queue.json` before proceeding to step 1.

   If a form requires a field not in `profile.md` (unexpected screening questions,
   sensitive data), leave that field blank, note it in the tracker, and flag it
   in the summary. Do NOT stop the entire run because of one unknown field.

   Only after all "Awaiting approval" jobs are pre-filled should you proceed
   to sourcing new roles in step 1.

1. **Source.** Pull new roles from my job-alert emails (Gmail) and from public
   company career pages found via web search. Do not scrape job portals in ways
   that breach their terms — alerts and public career pages only.
   **Always prefer the company's official careers page as the canonical apply
   source.** Aggregators (Himalayas, LinkedIn, etc.) are fine for discovery, but
   before queuing a role, find the same posting on the company's own careers/ATS
   site (Greenhouse, Lever, Workday, Ashby, SmartRecruiters, etc.) and record
   that official URL as the apply link. Aggregator listings expire and often have
   no working apply form; the official careers page is the source of truth.
2. **Dedupe.** Skip anything whose URL or Company+Role already exists in the
   tracker. Assign a new `Job ID` to each genuinely new listing.
3. **Score.** Rate each new job 0–100 against the active profile file (from `active_track.json`, e.g. `profile.md` or `profile_photography.md`) — Sections 7 and 9.
   Write the score and a one-line rationale. Set Status to `Scored`.
4. **Filter.** If a job hits any deal-breaker (Section 9 of the active profile), set `Deal-breaker? = Yes`,
   Status = `Skipped`, note why, and stop processing it. If it's below my score
   threshold, leave it `Scored` and do not tailor.
4a. **Eligibility check (gates auto pre-fill).** For each role at/above the score
   threshold, decide if my skills are *sufficient to apply*. Mark
   `Eligible = Yes` only when ALL of these hold:
   - Every must-have listed in Section 9 of the active profile file is present in
     the job description, and no deal-breaker is triggered.
   - I plausibly match the JD's core/required skills using the Section 7 keyword
     bank — treat a role as eligible when it needs no hard requirement I clearly
     lack (e.g. a specific mandatory technology, certification, security
     clearance, or a stated minimum years of experience above mine).
   - The JD does not require on-site presence outside my Section 9 target
     locations, and does not demand sensitive data to even apply.
   Record the verdict as `Eligible: Yes` or `Eligible: No (<gap>)` at the start of
   the Notes column — no new column needed. If not eligible, keep Status `Scored`,
   do NOT pre-fill, and surface it in the approval batch instead.
5. **Tailor.** For jobs at/above the threshold, generate a tailored resume and
   cover letter into the job's subfolder using the rules in Section 10 of the
   active profile file. Use the master resume from the `resume_dir` in
   `active_track.json` (e.g. `master/Photography/`). Save as
   `<Company>_<Role>_resume.docx` and `<Company>_<Role>_cover.docx`.
   Set Status to `Tailored`.
6. **Pre-fill (auto for eligible ≥-threshold roles).** For every role that is
   both at/above the score threshold AND `Eligible = Yes`, automatically use
   Claude in Chrome to open the application in my logged-in browser, fill fields
   from `profile.md`, and attach the tailored resume — without waiting for me to
   ask per role. **Always open the application on the company's official careers
   page / ATS, not the aggregator apply link.** If the stored URL is an aggregator
   (e.g. Himalayas) or its apply button is expired / leads to no external form,
   first web-search the company's official careers site for the same role, open
   the live posting there, and update the tracker's Job URL to that official link
   before pre-filling. If no live official posting can be found, mark the role
   `Status = Posting expired`, note it, and surface it in the approval batch
   instead of pre-filling. **Open each application in its own dedicated browser
   tab and pre-fill it there — one tab per job, never reuse a tab.** When
   pre-filling several roles in a run, open a separate tab for each and fill them
   independently; never navigate a tab that already holds a filled form (doing so
   discards everything typed into it). Keep every pre-filled tab open for my
   review. **Always stop before the final submit — never click Submit, Apply, or
   Send, and never solve a CAPTCHA / "I'm not a robot" check.** Set Status to `Awaiting approval`. If a form asks anything
   not covered by `profile.md` (screening questions, sensitive fields), leave
   those blank, note it, and still stop for approval. This step runs automatically
   as part of every job run (scheduled or interactive) via Claude in Chrome — no
   manual trigger needed. After pre-filling, capture a screenshot of each filled
   form and include it in the run summary so I can review before submitting.
7. **Present for approval.** Give me one batch summary: each job, its score, the
   tailored files, and a screenshot of the filled form. Wait for my decision.
8. **Act on my decision.** You (Claude) can never click Submit — I submit each
   application myself from the pre-filled tab. When I tell you I've applied to a
   role, run `python scripts/mark_applied.py <JOB-ID>` (optionally with a date
   and `--outcome "..."`) to set Status = `Submitted`, `Date submitted`, a +7-day
   follow-up, and colour the row blue. If I decide to skip one, set Status =
   `Skipped` with a note.
9. **Log everything.** Update the relevant tracker row at every step above and
   set `Last updated` to today. After each sourcing or status-update run, push
   the tracker to Supabase so the web app reflects the latest state:

   ```
   python scripts/sync_jobs.py
   ```

   This reads `active_track.json` automatically and upserts all rows for the
   active track. Run `python scripts/sync_jobs.py --dry-run` first if you want
   to preview what will be written without committing to the database.
10. **Submission confirmation (always end every run with this).** After the run
    summary, run `python scripts/pending_confirmations.py` and show its output. It
    lists every role that is pre-filled / ready but still `Awaiting approval` or
    `Tailored` with no `Date submitted` — i.e. waiting on me to click Submit.
    Explicitly remind me: *"Since I can't submit for you, tell me which of these
    you've already applied to and I'll mark them Submitted (or run
    `scripts/mark_applied.py JOB-XXX` / double-click `scripts/mark_applied.bat`
    yourself)."* This runs on every scheduled or interactive run so the tracker
    reflects what I've actually submitted.

## Hard rules (never violate)

- Never submit, send, or finalise an application without my explicit approval.
- Never enter passwords, OTPs, government ID numbers, or bank/card details into
  any form. If a portal demands these, stop and tell me.
- Never include DO-NOT-SHARE items (internal performance scores/ratings, government-internal
  metrics, confidential employer details, or any data the user has marked private) anywhere.
- Never apply to a deal-breaker role even if it scores well.
- Never invent or overstate experience — only reframe what's true.
- Respect the daily application cap in `profile.md` Section 9.

## When in doubt

If a JD requires something I clearly lack, a form asks for unexpected sensitive
data, or a listing is ambiguous, do not guess — flag it in the tracker's notes
column and surface it to me in the approval batch.

## Self-service controls (scripts I can run any time)

These live in `scripts/` and each has a double-click `.bat` on Windows. Claude
should also offer to run them for me when I ask in chat (e.g. "cancel JOB-048",
"delete JOB-095", "I applied to JOB-092").

- **Record a submission** — `mark_applied.py JOB-XXX [date] [--outcome "..."]`.
  Claude can't click Submit, so once I apply myself this sets Status = `Submitted`,
  `Date submitted`, a +7-day follow-up, and colours the row blue.
- **Cancel an approved/queued application** — `cancel_application.py JOB-XXX
  [--reason "..."]`. Use before a scheduled run acts on it: sets Status =
  `Cancelled`, removes it from `apply_queue.json`, and greys the row so the next
  run skips pre-fill/apply. The row stays for my records.
- **Delete a job from the list** — `delete_job.py JOB-XXX [--yes] [--files]`.
  Permanently removes the row from the tracker and from `apply_queue.json`
  (add `--files` to also delete its `jobs/<folder>` docs). Confirms first unless
  `--yes`. Irreversible.

A `Cancelled` row is never pre-filled, applied to, or re-surfaced for approval.
`apply_approved.py` only ever queues rows whose Status is `Awaiting approval`.

## Output conventions

- One subfolder per job under `jobs/`, named `<Company>_<Role>/`.
- File names: `<Company>_<Role>_resume.docx`, `<Company>_<Role>_cover.docx`.
- Dates as `YYYY-MM-DD`. CTC and currency in INR.
- Keep the tracker as the single record of what happened — if it isn't logged,
  it didn't happen.
