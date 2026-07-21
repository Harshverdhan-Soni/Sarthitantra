#!/usr/bin/env python3
"""
sync_jobs.py — Push local tracker rows to Supabase job_listings for the active career track.

Reads active_track.json (written by fetch_profile.py) to determine the active
track and its tracker file. Uploads every row to the job_listings table tagged
with profile_name = active track. Rows are upserted by job_id so re-running is
safe and idempotent.

Usage:
    python scripts/sync_jobs.py                        # uses active_track.json
    python scripts/sync_jobs.py --profile "Photography" # override track
    python scripts/sync_jobs.py --dry-run              # preview without writing

Dependencies:
    pip install supabase openpyxl
"""

import json
import pathlib
import sys
import argparse
from datetime import datetime, date

BASE = pathlib.Path(__file__).parent.parent
CONFIG_FILE       = BASE / "sarthitantra_config.json"
SESSION_FILE      = BASE / ".sarthitantra_session.json"
ACTIVE_TRACK_FILE = BASE / "active_track.json"

# ── Helpers ───────────────────────────────────────────────────────────────────

def load_config():
    if not CONFIG_FILE.exists():
        print("❌  sarthitantra_config.json not found.")
        print("    Download from sarthitantra.netlify.app → Profile → Cowork Setup.")
        sys.exit(1)
    with CONFIG_FILE.open() as f:
        return json.load(f)

def get_client(cfg):
    """
    Returns an authenticated Supabase client.
    Path 1 (new): api_token in config → anon client is sufficient (RPC handles auth).
    Path 2 (legacy): refresh cached session from SESSION_FILE.
    """
    try:
        from supabase import create_client
    except ImportError:
        print("❌  supabase not installed.  Run: pip install supabase")
        sys.exit(1)
    client = create_client(cfg["supabase_url"], cfg["supabase_key"])

    # Path 1: API token — no session needed (sync_to_supabase will use the RPC)
    if cfg.get("user_id") and cfg.get("api_token"):
        return client  # anon client is fine; RPC does its own token check

    # Path 2: session file (legacy)
    if SESSION_FILE.exists():
        try:
            with SESSION_FILE.open() as f:
                sess = json.load(f)
            rt = sess.get("refresh_token")
            if rt:
                res = client.auth.refresh_session(rt)
                if res and res.session:
                    return client
        except Exception:
            pass
    print("❌  Not signed in and no api_token in config.")
    print("    Run fetch_profile.py first, or re-download the starter kit.")
    sys.exit(1)

def load_active_track(profile_override=None):
    if profile_override:
        safe = profile_override.lower().replace(" ", "-")
        tracker = "applications_tracker.xlsx" if profile_override == "Main" \
                  else f"applications_tracker_{safe}.xlsx"
        return {
            "track":        profile_override,
            "tracker_file": tracker,
            "profile_file": "profile.md" if profile_override == "Main"
                            else f"profile_{safe.replace('-', '_')}.md",
            "resume_dir":   f"master/{profile_override}/",
        }
    if not ACTIVE_TRACK_FILE.exists():
        print("❌  active_track.json not found.")
        print("    Run fetch_profile.py first (it writes this file automatically).")
        sys.exit(1)
    with ACTIVE_TRACK_FILE.open() as f:
        return json.load(f)

def read_tracker(tracker_path):
    """Read applications_tracker*.xlsx and return list of row dicts."""
    try:
        import openpyxl
    except ImportError:
        print("❌  openpyxl not installed.  Run: pip install openpyxl")
        sys.exit(1)

    if not tracker_path.exists():
        print(f"⚠️  Tracker not found: {tracker_path.name}")
        print("    No jobs to sync (this is normal on a fresh track).")
        return []

    wb = openpyxl.load_workbook(tracker_path, data_only=True)
    ws = wb.active

    headers = []
    rows = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            headers = [str(h).strip() if h else "" for h in row]
            continue
        if not any(row):
            continue
        d = dict(zip(headers, row))
        rows.append(d)
    return rows

def normalise_row(row, profile_name):
    """Map tracker columns → job_listings schema."""
    def s(key, *alts):
        """Get first non-empty value from a list of possible column names."""
        for k in (key,) + alts:
            v = row.get(k)
            if v is not None and str(v).strip():
                return str(v).strip()
        return None

    def safe_int(v):
        try:
            return int(float(str(v))) if v is not None else None
        except Exception:
            return None

    def safe_date(v):
        if v is None:
            return None
        if isinstance(v, (datetime, date)):
            return v.isoformat()[:10]
        try:
            return str(v).strip()[:10] if str(v).strip() else None
        except Exception:
            return None

    job_id   = s("Job ID", "JobID", "ID")
    company  = s("Company")
    role     = s("Role", "Title", "Job Title")
    if not company or not role:
        return None  # skip incomplete rows

    return {
        "job_id":       job_id or f"{company}_{role}".replace(" ", "_")[:50],
        "profile_name": profile_name,
        "company":      company,
        "role":         role,
        "location":     s("Location"),
        "work_mode":    s("Work Mode", "WorkMode", "Mode"),
        "job_url":      s("Job URL", "URL", "Apply URL", "Apply Link"),
        "score":        safe_int(s("Score")),
        "status":       s("Status") or "Sourced",
        "deal_breaker": s("Deal-breaker?", "Deal Breaker", "DealBreaker"),
        "eligible":     s("Eligible"),
        "notes":        s("Notes"),
        "date_sourced": safe_date(s("Date sourced", "Date Sourced", "Sourced Date")),
        "date_applied": safe_date(s("Date submitted", "Date Applied", "Submitted Date")),
        "salary_range": s("Salary", "CTC", "Salary Range"),
        "raw_data":     {k: str(v) for k, v in row.items() if v is not None},
    }

def sync_to_supabase(client, rows, profile_name, cfg, dry_run=False):
    """
    Upsert rows into job_listings, scoped to this profile_name.

    Path 1 (new):    cli_sync_jobs RPC — uses permanent api_token, no session.
    Path 2 (legacy): direct table upsert — requires authenticated session.
    """
    api_token = cfg.get("api_token", "").strip()
    user_id   = cfg.get("user_id",   "").strip()

    # If no api_token, fall back to session-based user_id lookup
    if not api_token or not user_id:
        user_res = client.auth.get_user()
        if not user_res or not user_res.user:
            print("❌  Could not get user info.")
            sys.exit(1)
        user_id = user_res.user.id

    records = []
    skipped = 0
    for row in rows:
        norm = normalise_row(row, profile_name)
        if not norm:
            skipped += 1
            continue
        norm["user_id"] = user_id
        records.append(norm)

    if not records:
        print(f"⚠️  No valid rows to sync ({skipped} skipped — missing company/role).")
        return

    print(f"{'[DRY RUN] ' if dry_run else ''}Syncing {len(records)} rows to job_listings "
          f"(track: {profile_name})…")

    if dry_run:
        for r in records[:5]:
            print(f"  • {r['job_id']:20s}  {r['company']:20s}  {r['role'][:30]:30s}  {r['status']}")
        if len(records) > 5:
            print(f"  … and {len(records)-5} more")
        return

    # Path 1: cli_sync_jobs RPC (api_token, no session needed)
    if api_token and user_id:
        try:
            # Strip user_id from records — RPC adds it server-side
            rpc_rows = [{k: v for k, v in r.items() if k != "user_id"} for r in records]
            res = client.rpc("cli_sync_jobs", {
                "p_user_id": user_id,
                "p_token":   api_token,
                "p_rows":    rpc_rows,
            }).execute()
            count = res.data if isinstance(res.data, int) else len(records)
            print(f"✅  {count} rows synced to Supabase via API token (track: {profile_name}).")
            return
        except Exception as e:
            print(f"⚠️  RPC sync failed ({e}) — falling back to direct upsert…")

    # Path 2: direct table upsert (legacy — requires authenticated session)
    try:
        client.table("job_listings") \
            .upsert(records, on_conflict="user_id,job_id,profile_name") \
            .execute()
        print(f"✅  {len(records)} rows synced to Supabase (track: {profile_name}).")
    except Exception as e:
        print(f"⚠️  Bulk upsert failed ({e}) — trying row-by-row…")
        ok = 0
        for r in records:
            try:
                client.table("job_listings").upsert(r).execute()
                ok += 1
            except Exception as e2:
                print(f"   ✗ {r.get('job_id','?')}: {e2}")
        print(f"✅  {ok}/{len(records)} rows synced.")

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Sync local tracker to Supabase job_listings for the active career track"
    )
    parser.add_argument("--profile", "-p", default=None,
                        help="Career track to sync (default: reads active_track.json)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview rows without writing to Supabase")
    args = parser.parse_args()

    print("═" * 55)
    print("  Sarthitantra — Sync tracker → Supabase")
    print("═" * 55)

    cfg    = load_config()
    client = get_client(cfg)
    track  = load_active_track(args.profile)

    profile_name = track["track"]
    tracker_file = track["tracker_file"]
    tracker_path = BASE / tracker_file

    print(f"\n📋  Track       : {profile_name}")
    print(f"📄  Tracker file: {tracker_file}")

    rows = read_tracker(tracker_path)
    if not rows:
        print("\n  Nothing to sync.")
        return

    print(f"📊  Found {len(rows)} rows in tracker\n")
    sync_to_supabase(client, rows, profile_name, cfg, dry_run=args.dry_run)
    print()

if __name__ == "__main__":
    main()
