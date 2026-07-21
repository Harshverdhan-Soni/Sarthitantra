#!/usr/bin/env python3
"""
fetch_profile.py — Download your cloud profile from Supabase and write profile.md

Usage:
    python scripts/fetch_profile.py                    # uses default / active career track
    python scripts/fetch_profile.py --profile "Main"   # specific career track
    python scripts/fetch_profile.py --list             # list all career tracks

Authentication (automatic, no password needed):
  1. API token path (new):  if api_token + user_id are in sarthitantra_config.json,
     the script calls the cli_get_profile RPC directly — no Supabase session,
     no browser token, works for Google OAuth and email/password alike, never expires.
  2. Cached session path:   .sarthitantra_session.json from a previous run.
  3. Config refresh_token:  older starter kits embedded a refresh_token (expires).
  4. Password fallback:     prompted interactively (not needed for Google OAuth
                            users who have the new api_token config).

Dependencies:
    pip install supabase
"""

import json
import pathlib
import sys
import getpass
import argparse
import urllib.request
from datetime import datetime

BASE = pathlib.Path(__file__).parent.parent
CONFIG_FILE  = BASE / "sarthitantra_config.json"
SESSION_FILE = BASE / ".sarthitantra_session.json"

# ── Config loading ─────────────────────────────────────────────────────────────

def load_config():
    if not CONFIG_FILE.exists():
        print("❌  sarthitantra_config.json not found.")
        print(f"    Expected location: {CONFIG_FILE}")
        print("    Download it from sarthitantra.netlify.app → Profile → Cowork Setup.")
        sys.exit(1)
    with CONFIG_FILE.open() as f:
        cfg = json.load(f)
    for key in ("supabase_url", "supabase_key", "user_email"):
        if not cfg.get(key):
            print(f"❌  Missing '{key}' in sarthitantra_config.json")
            sys.exit(1)
    return cfg

# ── Auth path 1: permanent API token (cli_get_profile RPC) ────────────────────

def _try_api_token(cfg):
    """
    Call the cli_get_profile RPC with the permanent api_token from config.
    Returns (client, rpc_data) on success, or (None, None) on failure.
    rpc_data = {"career_profiles": [...], "user_settings": {...}}
    """
    user_id   = cfg.get("user_id",    "").strip()
    api_token = cfg.get("api_token",  "").strip()
    if not user_id or not api_token:
        return None, None
    try:
        from supabase import create_client
        client = create_client(cfg["supabase_url"], cfg["supabase_key"])
        res = client.rpc("cli_get_profile", {
            "p_user_id": user_id,
            "p_token":   api_token,
        }).execute()
        if res.data:
            return client, res.data
    except Exception as e:
        print(f"⚠️  API token auth failed: {e}")
        print("    Your API token may be invalid or the SQL migration hasn't been run yet.")
        print("    • If this is your first time: run supabase_cli_auth.sql in your Supabase SQL Editor.")
        print("    • Otherwise: re-download the starter kit from sarthitantra.netlify.app")
        print("      → My Profile → Cowork Desktop Setup → Download Full Starter Kit")
    return None, None

# ── Auth path 2 & 3: session file / config refresh_token ──────────────────────

def _save_session(session):
    data = {
        "refresh_token": session.refresh_token,
        "access_token":  session.access_token,
        "saved_at":      datetime.utcnow().isoformat(),
    }
    with SESSION_FILE.open("w") as f:
        json.dump(data, f, indent=2)
    try:
        SESSION_FILE.chmod(0o600)
    except Exception:
        pass

def get_client(cfg):
    """Legacy auth: cached session → config refresh_token → password."""
    try:
        from supabase import create_client
    except ImportError:
        print("❌  supabase package not installed.")
        print("    Run: pip install supabase")
        sys.exit(1)

    client = create_client(cfg["supabase_url"], cfg["supabase_key"])

    # 2a. Cached session file
    if SESSION_FILE.exists():
        try:
            with SESSION_FILE.open() as f:
                sess = json.load(f)
            rt = sess.get("refresh_token")
            if rt:
                res = client.auth.refresh_session(rt)
                if res and res.session:
                    _save_session(res.session)
                    print(f"✅  Signed in as {cfg['user_email']} (cached token)")
                    return client
        except Exception as e:
            print(f"⚠️  Cached token expired ({e})")

    # 2b. refresh_token embedded in config (older starter kits)
    config_rt = cfg.get("refresh_token", "").strip()
    if config_rt:
        try:
            res = client.auth.refresh_session(config_rt)
            if res and res.session:
                _save_session(res.session)
                print(f"✅  Signed in as {cfg['user_email']} (no password needed)")
                return client
        except Exception as e:
            print(f"⚠️  Config refresh token could not be used ({e})")
            print("    Re-download a fresh starter kit — the embedded token may have expired.")

    # 2c. Password fallback
    print(f"\n🔐  Sign in to Sarthitantra ({cfg['user_email']})")
    print("    Google-account users: re-download the starter kit instead of entering a password.")
    password = getpass.getpass("    Password: ")
    try:
        res = client.auth.sign_in_with_password({
            "email": cfg["user_email"],
            "password": password,
        })
        if not res or not res.session:
            print("❌  Sign-in failed — check your password.")
            sys.exit(1)
        _save_session(res.session)
        print(f"✅  Signed in. Token saved to {SESSION_FILE.name}")
        return client
    except Exception as e:
        print(f"❌  Sign-in error: {e}")
        sys.exit(1)

# ── Profile data helpers ────────────────────────────────────────────────────────

def get_active_track_from_db(client, user_id):
    try:
        res = client.table("user_settings") \
            .select("active_track") \
            .eq("user_id", user_id) \
            .maybe_single() \
            .execute()
        if res and res.data:
            return res.data.get("active_track")
    except Exception as e:
        print(f"⚠️  Could not read active_track from DB ({e}) — falling back to default track.")
    return None

def list_tracks(client, user_id):
    try:
        res = client.table("career_profiles") \
            .select("profile_name, is_default") \
            .eq("user_id", user_id) \
            .order("created_at") \
            .execute()
        return res.data or []
    except Exception as e:
        print(f"⚠️  Could not list career tracks: {e}")
        return []

def fetch_profile(client, user_id, profile_name="Main"):
    try:
        res = client.table("career_profiles") \
            .select("data, preferences") \
            .eq("user_id", user_id) \
            .eq("profile_name", profile_name) \
            .maybe_single() \
            .execute()
        if res and res.data:
            return {**(res.data.get("data") or {}), **(res.data.get("preferences") or {})}
        # Legacy fallback
        if profile_name == "Main":
            res2 = client.table("user_profiles") \
                .select("data") \
                .eq("id", user_id) \
                .maybe_single() \
                .execute()
            if res2 and res2.data:
                print("⚠️  Using legacy user_profiles table — run supabase_phase5.sql to migrate.")
                return res2.data.get("data")
        print(f"⚠️  No profile found for track '{profile_name}'.")
        print("    Have you completed onboarding at sarthitantra.netlify.app?")
        return None
    except Exception as e:
        print(f"❌  Failed to fetch profile: {e}")
        sys.exit(1)

# ── Resume download ────────────────────────────────────────────────────────────

def download_resume(client, user_id, profile, profile_name="Main"):
    resume_name = profile.get("masterResumeName", "")
    resume_url  = profile.get("masterResumeUrl",  "")
    if not resume_name and not resume_url:
        return

    ext = resume_name.split(".")[-1].lower() if "." in resume_name else "pdf"
    master_dir = BASE / "master" / profile_name
    master_dir.mkdir(parents=True, exist_ok=True)
    out_path = master_dir / f"master_resume.{ext}"

    # Prefer signed URL (no auth needed, works with API token path)
    if resume_url and resume_url.startswith("http"):
        try:
            urllib.request.urlretrieve(resume_url, out_path)
            print(f"✅  Master resume saved → {out_path.relative_to(BASE)}")
            return
        except Exception as e:
            print(f"⚠️  Could not download resume via signed URL: {e}")
            # Fall through to storage API if client is available

    # Fallback: Supabase storage API (requires authenticated client)
    if client is None:
        print("⚠️  No authenticated client — skipping resume download.")
        return
    try:
        storage_path = f"{user_id}/master_resume.{ext}"
        data = client.storage.from_("resumes").download(storage_path)
        with out_path.open("wb") as f:
            f.write(data)
        print(f"✅  Master resume saved → {out_path.relative_to(BASE)}")
    except Exception as e:
        print(f"⚠️  Could not download resume: {e}")

# ── profile.md builder ─────────────────────────────────────────────────────────

def tag_list(items, fallback="[FILL]"):
    if not items:
        return fallback
    return "; ".join(items)

def build_profile_md(p, user_email, profile_name="Main"):
    lines = []
    now = datetime.now().strftime("%Y-%m-%d")
    track_note = f" (Career Track: {profile_name})" if profile_name != "Main" else ""

    lines += [
        f"# Profile — master reference for resume auto-apply{track_note}",
        "",
        f"> Auto-generated by fetch_profile.py on {now} from Sarthitantra cloud profile.",
        "> Do not edit this file manually — changes will be overwritten on next sync.",
        "> Edit your profile at sarthitantra.netlify.app and re-run fetch_profile.py.",
        "",
        "---",
        "",
    ]

    # Section 1: Personal details
    lines += [
        "## 1. Personal details",
        "",
        f"- **Full name:** {p.get('fullName', '[FILL]')}",
        f"- **Email (personal):** {p.get('email') or user_email}",
        f"- **Phone:** {p.get('phone', '[FILL]')}",
        f"- **Location:** {p.get('location', '[FILL]')}",
    ]
    relocation = "Yes" if p.get("openToRelocation") else "No"
    rel_notes  = p.get("relocationNotes", "")
    lines.append(f"- **Open to relocation:** {relocation}{('; ' + rel_notes) if rel_notes else '.'}")
    lines.append(f"- **Preferred work mode:** {p.get('preferredWorkMode', 'Remote')}")
    if p.get("portfolio"):  lines.append(f"- **Portfolio:** {p['portfolio']}")
    if p.get("linkedin"):   lines.append(f"- **LinkedIn:** {p['linkedin']}")
    if p.get("github"):     lines.append(f"- **GitHub:** {p['github']}")
    if p.get("youtube"):    lines.append(f"- **YouTube:** {p['youtube']}")
    if p.get("scholar"):    lines.append(f"- **Google Scholar / ORCID:** {p['scholar']}")
    lines += ["", "---", ""]

    # Section 2: Work eligibility
    lines += [
        "## 2. Work eligibility & logistics",
        "",
        f"- **Citizenship / work authorization:** {p.get('workAuth', '[FILL]')}",
    ]
    sponsorship = "Yes — would require visa/work-permit sponsorship" if p.get("sponsorshipNeeded") else "No sponsorship required for India-based roles."
    lines.append(f"- **Sponsorship needed for roles outside India:** {sponsorship}")
    lines.append(f"- **Notice period:** {p.get('noticePeriod', '[FILL]')}")
    lines.append(f"- **Current CTC:** {p.get('currentCtc', '[FILL]')}")
    lines.append(f"- **Expected CTC:** {p.get('expectedCtc', '[FILL]')}")
    lines.append(f"- **Earliest start date:** {p.get('earliestStartDate', '[FILL]')}")
    employed = "Yes" if p.get("currentlyEmployed") else "No"
    title = p.get("currentTitle", "")
    org   = p.get("currentOrg",   "")
    if title or org:
        lines.append(f"- **Currently employed:** {employed} — {title}{' at ' + org if org else ''}.")
    else:
        lines.append(f"- **Currently employed:** {employed}")
    lines += ["", "---", ""]

    # Section 3: Professional summary
    lines += [
        "## 3. Professional summary",
        "",
        "> A 2–3 sentence summary Claude can adapt per role.",
        "",
    ]
    summary = p.get("professionalSummary", "").strip()
    lines.append(summary if summary else "[FILL — add your professional summary in the web app]")
    lines += ["", "---", ""]

    # Section 4: Current role highlights
    current_role = p.get("currentRoleHighlights", "").strip()
    lines += ["## 4. Current role", ""]
    if p.get("currentTitle"):
        lines.append(f"- **Title:** {p['currentTitle']}")
    if p.get("currentOrg"):
        lines.append(f"- **Organization:** {p['currentOrg']}")
    if current_role:
        lines.append("")
        lines.append("**What to highlight (public-safe):**")
        for bullet in current_role.strip().split("\n"):
            lines.append(bullet if bullet.startswith("-") else "  " + bullet)
    lines += [
        "",
        "> ⚠️ DO-NOT-SHARE from this role: APAR scores, internal performance ratings,",
        "> and any government-internal metrics or confidential project details.",
        "",
        "---",
        "",
    ]

    # Section 5: Education
    lines += ["## 5. Education", ""]
    edu = p.get("education", "").strip()
    lines.append(edu if edu else "[FILL — add your education in the web app]")
    lines += ["", "---", ""]

    # Section 6: Research & projects
    lines += ["## 6. Research & projects (public-facing)", ""]
    research = p.get("research", "").strip()
    lines.append(research if research else "[FILL — add your research & projects in the web app]")
    lines += ["", "---", ""]

    # Section 7: Core skills
    lines += ["## 7. Core skills (keyword bank for matching & ATS)", ""]
    skills_genai = p.get("skillsGenAI", [])
    skills_ml    = p.get("skillsML",    [])
    skills_dev   = p.get("skillsDev",   [])
    skills_other = p.get("skillsDomains", [])
    if skills_genai:  lines.append(f"- **Generative AI & LLMs:** {', '.join(skills_genai)}")
    if skills_ml:     lines.append(f"- **ML & AI research:** {', '.join(skills_ml)}")
    if skills_dev:    lines.append(f"- **Development & databases:** {', '.join(skills_dev)}")
    if skills_other:  lines.append(f"- **Domains & other:** {', '.join(skills_other)}")
    if not any([skills_genai, skills_ml, skills_dev, skills_other]):
        lines.append("[FILL — add your skills in the web app]")
    lines += ["", "---", ""]

    # Section 8: Links
    lines += [
        "## 8. Links",
        "",
        f"- **Portfolio:** {p.get('portfolio', '[FILL]')}",
        f"- **LinkedIn:** {p.get('linkedin', '[FILL]')}",
        f"- **GitHub:** {p.get('github', '[FILL]')}",
    ]
    if p.get("youtube"):  lines.append(f"- **YouTube:** {p['youtube']}")
    if p.get("scholar"):  lines.append(f"- **Google Scholar / ORCID:** {p['scholar']}")
    lines += ["", "---", ""]

    # Section 9: Job preferences
    lines += [
        "## 9. Job preferences (matching rules)",
        "",
        "> Claude scores every sourced job against these.",
        "",
    ]
    if p.get("targetTitles"):    lines.append(f"- **Target titles:** {tag_list(p['targetTitles'])}")
    if p.get("targetLocations"): lines.append(f"- **Target locations:** {tag_list(p['targetLocations'])}")
    if p.get("mustHaves"):       lines.append(f"- **Must-haves (a job missing these is skipped):** {tag_list(p['mustHaves'])}")
    if p.get("niceToHaves"):     lines.append(f"- **Nice-to-haves (boost the score):** {tag_list(p['niceToHaves'])}")
    if p.get("dealBreakers"):    lines.append(f"- **Deal-breakers (auto-reject):** {tag_list(p['dealBreakers'])}")
    lines.append(f"- **Score threshold to prepare an application:** {p.get('scoreThreshold', 70)}/100")
    lines.append(f"- **Daily application cap:** No more than {p.get('dailyCap', 8)} prepared per day.")
    lines += ["", "---", ""]

    # Section 10: Tailoring rules
    lines += [
        "## 10. Tailoring rules (instructions to Claude)",
        "",
        "1. Mirror the job description's key terms and required skills, but **never invent or overstate** experience — only reframe what's already true.",
        "2. Keep the tailored resume to **one page** unless a research/faculty role explicitly expects a longer academic CV.",
        "3. Lead with whichever side fits: **research/AI** for ML/research postings; **full-stack delivery** for engineering postings.",
        "4. Cover letters: 3 short paragraphs max — why this company, why me, a specific hook from the JD. Professional, not effusive.",
        "5. **Never include any DO-NOT-SHARE item** (Section 4): no APAR scores, internal ratings, or government-internal metrics.",
        "6. Output naming: save each as `<Company>_<Role>_resume.docx` and `<Company>_<Role>_cover.docx` in that job's subfolder.",
        "7. If a JD requires something I genuinely lack, flag it in the tracker rather than fabricating it.",
        "",
        "---",
        "",
    ]

    # Section 11: Standard application answers
    lines += ["## 11. Standard application answers", ""]
    std = p.get("standardAnswers", "").strip()
    if std:
        lines.append(std)
    else:
        lines += [
            '- **"Why do you want this role?"** [FILL — add in web app]',
            '- **"Greatest strength"** [FILL — add in web app]',
            '- **"Salary expectation":** As per market / negotiable.',
            f'- **"When can you start":** {p.get("earliestStartDate", "[see Section 2]")}',
            '- **"Are you willing to relocate?":** ' + ("Yes" if p.get("openToRelocation") else "No"),
        ]
    lines += ["", "---", ""]

    # Section 12: Guardrails
    lines += [
        "## 12. Guardrails (always enforce)",
        "",
        "- Never submit an application without my explicit approval — pre-fill only, then pause for review.",
        "- Never enter passwords, OTPs, bank/card details, or government ID numbers into any form.",
        "- Never apply to a role flagged as a deal-breaker (Section 9), even if it scores well otherwise.",
        "- Source jobs only via my email alerts and public company career pages.",
        "- Log every action (sourced, scored, tailored, queued, submitted, skipped) to the tracker.",
        "",
        "---",
        "",
        f"*Synced from Sarthitantra cloud at {now} · Track: {profile_name}. Re-run `python scripts/fetch_profile.py` to update.*",
    ]

    return "\n".join(lines)

# ── Output writer (shared by both auth paths) ──────────────────────────────────

def write_outputs(cfg, user_id, user_email, profile, profile_name, client):
    """Write profile.md, download resume, write active_track.json."""

    # profile.md path
    if profile_name == "Main":
        profile_md_path = BASE / "profile.md"
    else:
        safe_name = profile_name.lower().replace(" ", "_")
        profile_md_path = BASE / f"profile_{safe_name}.md"

    md = build_profile_md(profile, user_email, profile_name)
    with profile_md_path.open("w", encoding="utf-8") as f:
        f.write(md)
    print(f"✅  {profile_md_path.name} written → {profile_md_path.relative_to(BASE)}")

    # Master resume
    print("📥  Checking for master resume…")
    download_resume(client, user_id, profile, profile_name)

    # active_track.json
    safe_name    = profile_name.lower().replace(" ", "-")
    tracker_file = "applications_tracker.xlsx" if profile_name == "Main" \
                   else f"applications_tracker_{safe_name}.xlsx"
    active_track = {
        "track":        profile_name,
        "profile_file": profile_md_path.name,
        "tracker_file": tracker_file,
        "resume_dir":   f"master/{profile_name}/",
        "synced_at":    datetime.now().isoformat(),
    }
    at_path = BASE / "active_track.json"
    with at_path.open("w", encoding="utf-8") as f:
        json.dump(active_track, f, indent=2)
    print(f"✅  active_track.json written  (track: {profile_name}, tracker: {tracker_file})")

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync Sarthitantra cloud profile to local profile.md")
    parser.add_argument("--profile", "-p", default=None,
                        help="Career track name to sync (default: your active/default track)")
    parser.add_argument("--list", "-l", action="store_true",
                        help="List all available career tracks and exit")
    args = parser.parse_args()

    print("═" * 55)
    print("  Sarthitantra — Sync cloud profile to local")
    print("═" * 55)

    cfg = load_config()

    # ── Path 1: permanent API token (new, preferred) ───────────────────────────
    client, rpc_data = _try_api_token(cfg)
    if client and rpc_data:
        user_id    = cfg["user_id"]
        user_email = cfg.get("user_email", "")
        print(f"✅  Connected as {user_email} (permanent API token — no password needed)")

        all_profiles = rpc_data.get("career_profiles") or []
        settings     = rpc_data.get("user_settings")   or {}

        if args.list:
            if not all_profiles:
                print("\n⚠️  No career tracks found. Complete onboarding at sarthitantra.netlify.app first.")
            else:
                print(f"\n  Career tracks for {user_email}:")
                for cp in all_profiles:
                    star = " ★ (default)" if cp.get("is_default") else ""
                    print(f"    • {cp['profile_name']}{star}")
            print()
            return

        # Determine active track
        profile_name = args.profile
        if not profile_name:
            profile_name = settings.get("active_track")
            if profile_name:
                print(f"\n🔗  Active track from web app: {profile_name}")
            else:
                default_cp   = next((cp for cp in all_profiles if cp.get("is_default")), None)
                if not default_cp and all_profiles:
                    default_cp = all_profiles[0]
                profile_name = default_cp["profile_name"] if default_cp else "Main"
                print(f"\n💡  No active_track in DB — using default track: {profile_name}")

        if len(all_profiles) > 1 and not args.profile:
            print(f"     Tip: use --profile <name> to override. Run --list to see all tracks.\n")

        print(f"📥  Fetching career track '{profile_name}' for {user_email}…")

        # Extract profile dict from RPC data
        cp_row = next((cp for cp in all_profiles if cp["profile_name"] == profile_name), None)
        if not cp_row:
            print(f"⚠️  No profile found for track '{profile_name}'.")
            print("    Have you completed onboarding at sarthitantra.netlify.app?")
            sys.exit(1)
        profile = {**(cp_row.get("data") or {}), **(cp_row.get("preferences") or {})}

        write_outputs(cfg, user_id, user_email, profile, profile_name, client)
        print(f"\n✅  Profile sync complete (track: {profile_name}). Cowork is ready.\n")
        return

    # ── Path 2: legacy session / password auth ─────────────────────────────────
    print("ℹ️  api_token not found in config — falling back to session auth.")
    print("    Re-download the starter kit to get the permanent token-based setup.")

    client = get_client(cfg)

    user_res = client.auth.get_user()
    if not user_res or not user_res.user:
        print("❌  Could not get user info.")
        sys.exit(1)
    user    = user_res.user
    user_id = user.id
    email   = user.email or cfg.get("user_email", "")

    tracks = list_tracks(client, user_id)

    if args.list:
        if not tracks:
            print("\n⚠️  No career tracks found. Complete onboarding at sarthitantra.netlify.app first.")
        else:
            print(f"\n  Career tracks for {email}:")
            for t in tracks:
                star = " ★ (default)" if t.get("is_default") else ""
                print(f"    • {t['profile_name']}{star}")
        print()
        return

    profile_name = args.profile
    if not profile_name:
        profile_name = get_active_track_from_db(client, user_id)
        if profile_name:
            print(f"\n🔗  Active track from web app: {profile_name}")
        else:
            default = next((t for t in tracks if t.get("is_default")), None)
            profile_name = default["profile_name"] if default else "Main"
            print(f"\n💡  No active_track in DB — using default track: {profile_name}")

    if len(tracks) > 1 and not args.profile:
        print(f"     Tip: use --profile <name> to override. Run --list to see all tracks.\n")

    print(f"📥  Fetching career track '{profile_name}' for {email}…")

    profile = fetch_profile(client, user_id, profile_name)
    if not profile:
        sys.exit(1)

    write_outputs(cfg, user_id, email, profile, profile_name, client)
    print(f"\n✅  Profile sync complete (track: {profile_name}). Cowork is ready.\n")

if __name__ == "__main__":
    main()
