# Folder instructions — resume auto-apply

> Cowork reads this file automatically at the start of every task in this folder.
> It defines how you (Claude) run the job-application loop. `profile.md` is the
> source of truth for who I am and what I want — read it before every run.

## Context

You are running a personal job-application assistant. The goal is to source
matching roles, tailor my resume and cover letter for each, pre-fill the
application, and queue it for my approval — never to submit anything on your own.

## Files in this folder

- `profile.md` — my details, preferences, tailoring rules, and guardrails. Always read first.
- `applications_tracker.xlsx` — the log. One row per job; update it at every step.
- `master/` — my master resume (the base you tailor from; never overwrite it).
- `jobs/<Company>_<Role>/` — create one subfolder per job for its tailored outputs.

## The loop (run in this order)

0. **Sync profile (always first).** Run `python scripts/fetch_profile.py` to pull
   the latest profile from the Sarthitantra cloud. This writes (or overwrites)
   `profile.md` locally and downloads the master resume to `master/`. If
   `sarthitantra_config.json` is missing, stop and tell me to download it from
   sarthitantra.netlify.app → Profile → Cowork Setup. Skip this step only if you
   are explicitly told to use the existing local `profile.md` for this run.

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
3. **Score.** Rate each new job 0–100 against `profile.md` (Sections 7 and 9).
   Write the score and a one-line rationale. Set Status to `Scored`.
4. **Filter.** If a job hits any deal-breaker (Section 9), set `Deal-breaker? = Yes`,
   Status = `Skipped`, note why, and stop processing it. If it's below my score
   threshold, leave it `Scored` and do not tailor.
4a. **Eligibility check (gates auto pre-fill).** For each role at/above the score
   threshold, decide if my skills are *sufficient to apply*. Mark
   `Eligible = Yes` only when ALL of these hold:
   - The must-have in Section 9 (AI/ML focus) is present, and no deal-breaker.
   - I plausibly match the JD's core/required skills using the Section 7 keyword
     bank — treat a role as eligible when it needs no hard requirement I clearly
     lack (e.g. a specific mandatory technology, certification, security
     clearance, or a stated minimum years of experience above mine).
   - The JD does not require on-site presence outside my Section 9 target
     locations, and does not demand sensitive data to even apply.
   Record the verdict as `Eligible: Yes` or `Eligible: No (<gap>)` at the start of
   the Notes column (column K) — no new column needed. If not eligible, keep
   Status `Scored`, do NOT pre-fill, and surface it in the approval batch instead.
5. **Tailor.** For jobs at/above the threshold, generate a tailored resume and
   cover letter into the job's subfolder using the rules in Section 10 of
   `profile.md`. Save as `<Company>_<Role>_resume.docx` and
   `<Company>_<Role>_cover.docx`. Set Status to `Tailored`.
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
   set `Last updated` to today.
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
- Never include DO-NOT-SHARE items (APAR scores, internal ratings, any
  government-internal metrics or confidential C-DAC details) anywhere.
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
