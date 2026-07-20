#!/usr/bin/env python3
"""
fetch_profile.py — Download your cloud profile from Supabase and write profile.md

Usage:
    python scripts/fetch_profile.py                    # uses default career track
    python scripts/fetch_profile.py --profile "Main"   # specific career track
    python scripts/fetch_profile.py --list             # list all career tracks

Run this before every Cowork session to pull the latest profile.
On first run it asks for your password once, then saves a refresh token.
Subsequent runs are fully automatic.

Dependencies:
    pip install supabase
"""

import json
import pathlib
import sys
import getpass
import argparse
from datetime import datetime

BASE = pathlib.Path(__file__).parent.parent
CONFIG_FILE  = BASE / "sarthitantra_config.json"
SESSION_FILE = BASE / ".sarthitantra_session.json"

# ── Load config ───────────────────────────────────────────────────────────────

def load_config():
    if not CONFIG_FILE.exists():
        print("❌  sarthitantra_config.json not found.")
        print(f"    Expected location: {CONFIG_FILE}")
        print("    Download it from sarthitantra.netlify.app → Profile → Cowork Setup → Download Config.")
        sys.exit(1)
    with CONFIG_FILE.open() as f:
        cfg = json.load(f)
    required = ["supabase_url", "supabase_key", "user_email"]
    for key in required:
        if not cfg.get(key):
            print(f"❌  Missing '{key}' in sarthitantra_config.json")
            sys.exit(1)
    return cfg

# ── Supabase auth (refresh token flow) ───────────────────────────────────────

def get_client(cfg):
    try:
        from supabase import create_client
    except ImportError:
        print("❌  supabase package not installed.")
        print("    Run: pip install supabase")
        sys.exit(1)

    client = create_client(cfg["supabase_url"], cfg["supabase_key"])

    # Try stored refresh token first
    if SESSION_FILE.exists():
        try:
            with SESSION_FILE.open() as f:
                sess = json.load(f)
            refresh_token = sess.get("refresh_token")
            if refresh_token:
                res = client.auth.refresh_session(refresh_token)
                if res and res.session:
                    _save_session(res.session)
                    print(f"✅  Signed in as {cfg['user_email']} (cached token)")
                    return client
        except Exception as e:
            print(f"⚠️  Cached token expired ({e}) — re-authenticating…")

    # First time or token expired: prompt for password
    print(f"\n🔐  Sign in to Sarthitantra ({cfg['user_email']})")
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

# ── List all career tracks ─────────────────────────────────────────────────────

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

# ── Fetch profile from Supabase ───────────────────────────────────────────────

def fetch_profile(client, user_id, profile_name="Main"):
    """Fetch career profile data + preferences for the given track."""
    try:
        # Try new career_profiles table first
        res = client.table("career_profiles") \
            .select("data, preferences") \
            .eq("user_id", user_id) \
            .eq("profile_name", profile_name) \
            .maybe_single() \
            .execute()
        if res and res.data:
            data = res.data.get("data") or {}
            prefs = res.data.get("preferences") or {}
            # Merge preferences into data so build_profile_md gets everything
            merged = {**data, **prefs}
            return merged

        # Fallback: try legacy user_profiles table (for users not yet migrated)
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

# ── Download master resume ─────────────────────────────────────────────────────

def download_resume(client, user_id, profile, profile_name="Main"):
    resume_name = profile.get("masterResumeName", "")
    if not resume_name:
        return

    ext = resume_name.split(".")[-1].lower() if "." in resume_name else "pdf"
    storage_path = f"{user_id}/master_resume.{ext}"

    # Save to master/<profile_name>/ so each track has its own folder
    master_dir = BASE / "master" / profile_name
    master_dir.mkdir(parents=True, exist_ok=True)
    out_path = master_dir / f"master_resume.{ext}"

    try:
        data = client.storage.from_("resumes").download(storage_path)
        with out_path.open("wb") as f:
            f.write(data)
        print(f"✅  Master resume saved → {out_path.relative_to(BASE)}")
    except Exception as e:
        print(f"⚠️  Could not download resume: {e}")

# ── Generate profile.md ────────────────────────────────────────────────────────

def tag_list(items, fallback="[FILL]"):
    if not items:
        return fallback
    return "; ".join(items)

def build_profile_md(p, user_email, profile_name="Main"):
    lines = []
    now = datetime.now().strftime("%Y-%m-%d")
    track_note = f" (Career Track: {profile_name})" if profile_name != "Main" else ""

    # ── Header ─────────────────────────────────────────────────────────────
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

    # ── Section 1: Personal details ────────────────────────────────────────
    lines += [
        "## 1. Personal details",
        "",
        f"- **Full name:** {p.get('fullName', '[FILL]')}",
        f"- **Email (personal):** {p.get('email') or user_email}",
        f"- **Phone:** {p.get('phone', '[FILL]')}",
        f"- **Location:** {p.get('location', '[FILL]')}",
    ]
    relocation = "Yes" if p.get("openToRelocation") else "No"
    rel_notes = p.get("relocationNotes", "")
    lines.append(f"- **Open to relocation:** {relocation}{('; ' + rel_notes) if rel_notes else '.'}")
    lines.append(f"- **Preferred work mode:** {p.get('preferredWorkMode', 'Remote')}")
    if p.get("portfolio"):
        lines.append(f"- **Portfolio:** {p['portfolio']}")
    if p.get("linkedin"):
        lines.append(f"- **LinkedIn:** {p['linkedin']}")
    if p.get("github"):
        lines.append(f"- **GitHub:** {p['github']}")
    if p.get("youtube"):
        lines.append(f"- **YouTube:** {p['youtube']}")
    if p.get("scholar"):
        lines.append(f"- **Google Scholar / ORCID:** {p['scholar']}")
    lines += ["", "---", ""]

    # ── Section 2: Work eligibility ────────────────────────────────────────
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
    org = p.get("currentOrg", "")
    if title or org:
        lines.append(f"- **Currently employed:** {employed} — {title}{' at ' + org if org else ''}.")
    else:
        lines.append(f"- **Currently employed:** {employed}")
    lines += ["", "---", ""]

    # ── Section 3: Professional summary ────────────────────────────────────
    lines += [
        "## 3. Professional summary",
        "",
        "> A 2–3 sentence summary Claude can adapt per role.",
        "",
    ]
    summary = p.get("professionalSummary", "").strip()
    lines.append(summary if summary else "[FILL — add your professional summary in the web app]")
    lines += ["", "---", ""]

    # ── Section 4: Current role highlights ─────────────────────────────────
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

    # ── Section 5: Education ───────────────────────────────────────────────
    lines += ["## 5. Education", ""]
    edu = p.get("education", "").strip()
    lines.append(edu if edu else "[FILL — add your education in the web app]")
    lines += ["", "---", ""]

    # ── Section 6: Research & projects ─────────────────────────────────────
    lines += ["## 6. Research & projects (public-facing)", ""]
    research = p.get("research", "").strip()
    lines.append(research if research else "[FILL — add your research & projects in the web app]")
    lines += ["", "---", ""]

    # ── Section 7: Core skills ─────────────────────────────────────────────
    lines += ["## 7. Core skills (keyword bank for matching & ATS)", ""]
    skills_genai = p.get("skillsGenAI", [])
    skills_ml    = p.get("skillsML", [])
    skills_dev   = p.get("skillsDev", [])
    skills_other = p.get("skillsDomains", [])
    if skills_genai:
        lines.append(f"- **Generative AI & LLMs:** {', '.join(skills_genai)}")
    if skills_ml:
        lines.append(f"- **ML & AI research:** {', '.join(skills_ml)}")
    if skills_dev:
        lines.append(f"- **Development & databases:** {', '.join(skills_dev)}")
    if skills_other:
        lines.append(f"- **Domains & other:** {', '.join(skills_other)}")
    if not any([skills_genai, skills_ml, skills_dev, skills_other]):
        lines.append("[FILL — add your skills in the web app]")
    lines += ["", "---", ""]

    # ── Section 8: Links ──────────────────────────────────────────────────
    lines += [
        "## 8. Links",
        "",
        f"- **Portfolio:** {p.get('portfolio', '[FILL]')}",
        f"- **LinkedIn:** {p.get('linkedin', '[FILL]')}",
        f"- **GitHub:** {p.get('github', '[FILL]')}",
    ]
    if p.get("youtube"):
        lines.append(f"- **YouTube:** {p['youtube']}")
    if p.get("scholar"):
        lines.append(f"- **Google Scholar / ORCID:** {p['scholar']}")
    lines += ["", "---", ""]

    # ── Section 9: Job preferences ─────────────────────────────────────────
    lines += [
        "## 9. Job preferences (matching rules)",
        "",
        "> Claude scores every sourced job against these.",
        "",
    ]
    if p.get("targetTitles"):
        lines.append(f"- **Target titles:** {tag_list(p['targetTitles'])}")
    if p.get("targetLocations"):
        lines.append(f"- **Target locations:** {tag_list(p['targetLocations'])}")
    if p.get("mustHaves"):
        lines.append(f"- **Must-haves (a job missing these is skipped):** {tag_list(p['mustHaves'])}")
    if p.get("niceToHaves"):
        lines.append(f"- **Nice-to-haves (boost the score):** {tag_list(p['niceToHaves'])}")
    if p.get("dealBreakers"):
        lines.append(f"- **Deal-breakers (auto-reject):** {tag_list(p['dealBreakers'])}")
    lines.append(f"- **Score threshold to prepare an application:** {p.get('scoreThreshold', 70)}/100")
    lines.append(f"- **Daily application cap:** No more than {p.get('dailyCap', 8)} prepared per day.")
    lines += ["", "---", ""]

    # ── Section 10: Tailoring rules ────────────────────────────────────────
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

    # ── Section 11: Standard application answers ───────────────────────────
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

    # ── Section 12: Guardrails ──────────────────────────────────────────────
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

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync Sarthitantra cloud profile to local profile.md")
    parser.add_argument("--profile", "-p", default=None,
                        help="Career track name to sync (default: your default track)")
    parser.add_argument("--list", "-l", action="store_true",
                        help="List all available career tracks and exit")
    args = parser.parse_args()

    print("═" * 55)
    print("  Sarthitantra — Sync cloud profile to local")
    print("═" * 55)

    cfg    = load_config()
    client = get_client(cfg)

    # Get current user
    user_res = client.auth.get_user()
    if not user_res or not user_res.user:
        print("❌  Could not get user info.")
        sys.exit(1)
    user    = user_res.user
    user_id = user.id
    email   = user.email or cfg.get("user_email", "")

    # List tracks if requested
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

    # Determine which track to sync
    profile_name = args.profile
    if not profile_name:
        # Use the default track
        default = next((t for t in tracks if t.get("is_default")), None)
        profile_name = default["profile_name"] if default else "Main"

    print(f"\n📥  Fetching career track '{profile_name}' for {email}…")

    # If multiple tracks exist and none was specified, show a hint
    if len(tracks) > 1 and not args.profile:
        print(f"     Tip: use --profile <name> to sync a different track.")
        print(f"     Run --list to see all tracks.\n")

    # Fetch profile
    profile = fetch_profile(client, user_id, profile_name)
    if not profile:
        sys.exit(1)

    # Determine output paths for this track
    if profile_name == "Main":
        profile_md_path = BASE / "profile.md"
    else:
        # Write to profile_<track_name>.md for non-Main tracks
        safe_name = profile_name.lower().replace(" ", "_")
        profile_md_path = BASE / f"profile_{safe_name}.md"

    # Write profile.md
    md = build_profile_md(profile, email, profile_name)
    with profile_md_path.open("w", encoding="utf-8") as f:
        f.write(md)
    print(f"✅  {profile_md_path.name} written → {profile_md_path.relative_to(BASE)}")

    # Download master resume into master/<profile_name>/
    print("📥  Checking for master resume…")
    download_resume(client, user_id, profile, profile_name)

    print(f"\n✅  Profile sync complete (track: {profile_name}). Cowork is ready.\n")

if __name__ == "__main__":
    main()
