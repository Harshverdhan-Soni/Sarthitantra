/**
 * ProfileEditor.jsx — Full profile editing form
 * Shown inside the main app (Profile tab / Setup section).
 * Uses the same profile schema as Onboarding.jsx.
 */
import React, { useState, useRef, useEffect } from "react";
import JSZip from "jszip";
import { supabase } from "./supabase.js";
import { saveCareerProfile, listProfiles, createCareerProfile, deleteCareerProfile, setDefaultProfile } from "./db.js";

// ── Shared sub-components ────────────────────────────────────────────────────

function TagInput({ value = [], onChange, placeholder }) {
  const [input, setInput] = useState("");
  const ref = useRef();
  const add = (raw) => {
    const tag = raw.trim();
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
    setInput("");
  };
  const remove = (tag) => onChange(value.filter((t) => t !== tag));
  return (
    <div
      className="min-h-[42px] flex flex-wrap gap-1.5 items-start p-2 border border-slate-300 rounded-lg bg-white cursor-text focus-within:ring-2 focus-within:ring-indigo-400 focus-within:border-indigo-400 transition"
      onClick={() => ref.current?.focus()}
    >
      {value.map((tag) => (
        <span key={tag} className="flex items-center gap-1 bg-indigo-100 text-indigo-800 text-xs font-medium px-2 py-1 rounded-full">
          {tag}
          <button type="button" onClick={(e) => { e.stopPropagation(); remove(tag); }} className="text-indigo-500 hover:text-indigo-800">×</button>
        </span>
      ))}
      <input
        ref={ref}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (["Enter", ",", "Tab"].includes(e.key)) { e.preventDefault(); add(input); }
          else if (e.key === "Backspace" && !input && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => { if (input.trim()) add(input); }}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[120px] outline-none text-sm text-slate-700 bg-transparent placeholder:text-slate-400"
      />
    </div>
  );
}

const SectionTitle = ({ children }) => (
  <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-2 mb-4">{children}</h3>
);

const Field = ({ label, hint, children, half }) => (
  <div className={half ? "" : ""}>
    <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
    {hint && <p className="text-xs text-slate-500 mb-1.5">{hint}</p>}
    {children}
  </div>
);

const Input = (props) => (
  <input {...props} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition placeholder:text-slate-400" />
);

const Select = ({ children, ...props }) => (
  <select {...props} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition bg-white">
    {children}
  </select>
);

const Textarea = (props) => (
  <textarea {...props} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition placeholder:text-slate-400 resize-y" />
);

// ── Career Track Bar ─────────────────────────────────────────────────────────
function CareerTrackBar({ userId, activeProfile, onSwitch }) {
  const [tracks, setTracks] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");

  const refresh = () => listProfiles(userId).then(setTracks);
  useEffect(() => { if (userId) refresh(); }, [userId]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || tracks.some((t) => t.profile_name.toLowerCase() === name.toLowerCase())) return;
    setBusy("create");
    await createCareerProfile(userId, name);
    await refresh();
    setNewName(""); setAdding(false); setBusy("");
    onSwitch(name);
  };

  const handleDelete = async (name) => {
    if (tracks.length <= 1) return; // can't delete last track
    setBusy(name);
    await deleteCareerProfile(userId, name);
    await refresh();
    setBusy("");
    setConfirmDelete("");
    if (activeProfile === name) onSwitch("Main");
  };

  const handleSetDefault = async (name) => {
    setBusy(name + "_default");
    await setDefaultProfile(userId, name);
    await refresh();
    setBusy("");
  };

  return (
    <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">Career Tracks</span>
          <span className="text-xs text-slate-500">— separate job boards, resumes &amp; preferences per track</span>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100 transition"
          >
            + New track
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {tracks.map((t) => {
          const isActive = t.profile_name === activeProfile;
          const isMain = t.profile_name === "Main";
          return (
            <div key={t.profile_name} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              isActive
                ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                : "bg-white border-slate-300 text-slate-700 hover:border-indigo-400 cursor-pointer"
            }`}
              onClick={() => !isActive && onSwitch(t.profile_name)}
            >
              {isActive && <span className="text-indigo-200 text-xs">✓</span>}
              {t.is_default && !isActive && <span className="text-amber-500 text-xs" title="Default track">★</span>}
              {t.profile_name}
              {!isActive && (
                <span className="flex items-center gap-1 ml-0.5">
                  {!t.is_default && (
                    <button
                      title="Set as default"
                      onClick={(e) => { e.stopPropagation(); handleSetDefault(t.profile_name); }}
                      disabled={!!busy}
                      className="text-slate-400 hover:text-amber-500 text-xs leading-none px-0.5"
                    >★</button>
                  )}
                  {!isMain && (
                    confirmDelete === t.profile_name ? (
                      <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => handleDelete(t.profile_name)} disabled={!!busy} className="text-rose-600 text-xs font-semibold hover:underline">Delete?</button>
                        <button onClick={() => setConfirmDelete("")} className="text-slate-400 text-xs hover:underline">Cancel</button>
                      </span>
                    ) : (
                      <button
                        title="Delete track"
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(t.profile_name); }}
                        disabled={!!busy}
                        className="text-slate-300 hover:text-rose-500 text-xs leading-none ml-0.5"
                      >×</button>
                    )
                  )}
                </span>
              )}
            </div>
          );
        })}

        {adding && (
          <div className="flex items-center gap-2 rounded-full border border-indigo-400 bg-white px-3 py-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setAdding(false); setNewName(""); }}}
              placeholder="Track name, e.g. Data Science"
              className="text-sm outline-none w-48 text-slate-800 placeholder:text-slate-400"
            />
            <button onClick={handleCreate} disabled={!newName.trim() || !!busy} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-40">Create</button>
            <button onClick={() => { setAdding(false); setNewName(""); }} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProfileEditor({ user, profile, onSave, activeProfile = "Main", onProfileSwitch }) {
  const [p, setP] = useState({ ...profile });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Re-initialize form state whenever the active career track changes
  useEffect(() => {
    setP({ ...profile });
    setError("");
    setSaved(false);
  }, [activeProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key, val) => setP((prev) => ({ ...prev, [key]: val }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const updated = { ...p, onboardingComplete: true };
      // Extract preferences to store separately in career_profiles
      const { targetTitles, targetLocations, mustHaves, niceToHaves, dealBreakers, scoreThreshold, dailyCap, ...profileData } = updated;
      const prefs = { targetTitles, targetLocations, mustHaves, niceToHaves, dealBreakers, scoreThreshold, dailyCap };
      await saveCareerProfile(user.id, activeProfile, profileData, prefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      onSave?.(updated);
    } catch (e) {
      setError("Save failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const [kitBuilding, setKitBuilding] = useState(false);
  const [copied, setCopied] = useState("");

  const copyPrompt = (key, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(""), 2000);
    });
  };

  const downloadStarterKit = async () => {
    setKitBuilding(true);
    try {
      const zip = new JSZip();

      // 1. Dynamic config — generate/retrieve a permanent API token stored in
      //    Supabase (user_api_tokens table). This token never rotates or expires
      //    on its own, works for Google OAuth and email/password alike, and is
      //    the only credential fetch_profile.py and sync_jobs.py need.
      let apiToken = "";
      try {
        const { data: existing } = await supabase
          .from("user_api_tokens")
          .select("api_token")
          .eq("user_id", user?.id)
          .maybeSingle();

        if (existing?.api_token) {
          apiToken = existing.api_token;
        } else {
          // No token yet — insert a new row; the DEFAULT generates the token server-side.
          const { data: inserted } = await supabase
            .from("user_api_tokens")
            .insert({ user_id: user?.id })
            .select("api_token")
            .single();
          apiToken = inserted?.api_token ?? "";
        }
      } catch { /* non-fatal — CLI will show a clear error */ }

      const config = {
        supabase_url: SUPABASE_URL,
        supabase_key: SUPABASE_KEY,
        user_email:   user?.email ?? "",
        user_id:      user?.id ?? "",
        api_token:    apiToken,  // permanent, non-rotating; works for all auth providers
      };
      zip.file("sarthitantra_config.json", JSON.stringify(config, null, 2));

      // 2. Static starter-kit files (served from /starter-kit/ in public/)
      const STATIC = [
        "folder-instructions.md",
        "QUICK_START.txt",
        "applications_tracker.xlsx",
        "scripts/fetch_profile.py",
        "scripts/sync_jobs.py",
        "scripts/apply_approved.py",
        "scripts/mark_applied.py",
        "scripts/cancel_application.py",
        "scripts/delete_job.py",
        "scripts/pending_confirmations.py",
        "master/.gitkeep",
        "jobs/.gitkeep",
      ];
      const missing = [];
      await Promise.all(STATIC.map(async (path) => {
        try {
          const res = await fetch(`/starter-kit/${path}`);
          if (!res.ok) { missing.push(path); return; }
          if (path.endsWith(".xlsx")) {
            const buf = await res.arrayBuffer();
            zip.file(path, buf);
          } else {
            const text = await res.text();
            zip.file(path, text);
          }
        } catch { missing.push(path); }
      }));

      if (!apiToken) {
        alert(
          "⚠️  Your config was saved WITHOUT an API token.\n\n" +
          "This means fetch_profile.py will ask for a password (which won't work for Google login).\n\n" +
          "Fix: open your Supabase project → SQL Editor → run supabase_cli_auth.sql, " +
          "then click Download again."
        );
      } else if (missing.length > 0) {
        alert(
          "⚠️  These files couldn't be fetched and are missing from the zip:\n\n" +
          missing.join("\n") +
          "\n\nThis usually means the site hasn't been redeployed yet. Run:\n" +
          "npm run build && netlify deploy --prod --dir=dist\n" +
          "then click Download again."
        );
      }

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "Sarthitantra_StarterKit.zip"; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Could not build starter kit: " + e.message);
    } finally {
      setKitBuilding(false);
    }
  };

  return (
    <div className="space-y-8 pb-8">

      {/* ── Career Track Bar ──────────────────────────────────────────── */}
      <CareerTrackBar
        userId={user?.id}
        activeProfile={activeProfile}
        onSwitch={(name) => {
          // Propagate to parent (JobPilot → main.jsx) which reloads data
          onProfileSwitch?.(name);
        }}
      />

      {/* ── Personal Details ─────────────────────────────────────────── */}
      <section>
        <SectionTitle>Personal Details</SectionTitle>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full name"><Input value={p.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Your full name" /></Field>
            <Field label="Email"><Input value={p.email} onChange={(e) => set("email", e.target.value)} type="email" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone"><Input value={p.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91-XXXXXXXXXX" /></Field>
            <Field label="Location"><Input value={p.location} onChange={(e) => set("location", e.target.value)} placeholder="City, State" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Preferred work mode">
              <Select value={p.preferredWorkMode} onChange={(e) => set("preferredWorkMode", e.target.value)}>
                <option>Remote</option><option>Hybrid</option><option>On-site</option><option>Remote or On-site</option>
              </Select>
            </Field>
            <Field label="Open to relocation?">
              <Select value={p.openToRelocation ? "yes" : "no"} onChange={(e) => set("openToRelocation", e.target.value === "yes")}>
                <option value="yes">Yes</option><option value="no">No</option>
              </Select>
            </Field>
          </div>
          {p.openToRelocation && (
            <Field label="Relocation notes">
              <Input value={p.relocationNotes} onChange={(e) => set("relocationNotes", e.target.value)} placeholder="e.g. Europe / Sweden preferred; also open to remote" />
            </Field>
          )}
        </div>
      </section>

      {/* ── Online Presence ──────────────────────────────────────────── */}
      <section>
        <SectionTitle>Online Presence</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Portfolio"><Input value={p.portfolio} onChange={(e) => set("portfolio", e.target.value)} placeholder="https://yoursite.com" /></Field>
          <Field label="LinkedIn"><Input value={p.linkedin} onChange={(e) => set("linkedin", e.target.value)} placeholder="https://linkedin.com/in/..." /></Field>
          <Field label="GitHub"><Input value={p.github} onChange={(e) => set("github", e.target.value)} placeholder="https://github.com/..." /></Field>
          <Field label="YouTube / other"><Input value={p.youtube} onChange={(e) => set("youtube", e.target.value)} placeholder="https://youtube.com/@..." /></Field>
          <Field label="Google Scholar / ORCID"><Input value={p.scholar} onChange={(e) => set("scholar", e.target.value)} placeholder="https://scholar.google.com/..." /></Field>
        </div>
      </section>

      {/* ── Work Eligibility ─────────────────────────────────────────── */}
      <section>
        <SectionTitle>Work Eligibility & Logistics</SectionTitle>
        <div className="space-y-4">
          <Field label="Work authorization"><Input value={p.workAuth} onChange={(e) => set("workAuth", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Sponsorship needed?">
              <Select value={p.sponsorshipNeeded ? "yes" : "no"} onChange={(e) => set("sponsorshipNeeded", e.target.value === "yes")}>
                <option value="no">No</option>
                <option value="yes">Yes — would need visa/work-permit sponsorship</option>
              </Select>
            </Field>
            <Field label="Currently employed?">
              <Select value={p.currentlyEmployed ? "yes" : "no"} onChange={(e) => set("currentlyEmployed", e.target.value === "yes")}>
                <option value="yes">Yes</option><option value="no">No</option>
              </Select>
            </Field>
          </div>
          {p.currentlyEmployed && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Current title"><Input value={p.currentTitle} onChange={(e) => set("currentTitle", e.target.value)} /></Field>
              <Field label="Current org"><Input value={p.currentOrg} onChange={(e) => set("currentOrg", e.target.value)} /></Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Notice period"><Input value={p.noticePeriod} onChange={(e) => set("noticePeriod", e.target.value)} placeholder="e.g. 45 days" /></Field>
            <Field label="Earliest start date"><Input value={p.earliestStartDate} onChange={(e) => set("earliestStartDate", e.target.value)} placeholder="e.g. August 2026" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Current CTC"><Input value={p.currentCtc} onChange={(e) => set("currentCtc", e.target.value)} placeholder="e.g. 7 LPA" /></Field>
            <Field label="Expected CTC"><Input value={p.expectedCtc} onChange={(e) => set("expectedCtc", e.target.value)} placeholder="e.g. 15 LPA" /></Field>
          </div>
        </div>
      </section>

      {/* ── Professional Summary ─────────────────────────────────────── */}
      <section>
        <SectionTitle>Professional Summary</SectionTitle>
        <Field label="Summary" hint="2–3 sentences. Cowork adapts this per role — lead with your strongest angle.">
          <Textarea rows={4} value={p.professionalSummary} onChange={(e) => set("professionalSummary", e.target.value)} placeholder="Applied AI researcher and full-stack engineer with X years across…" />
        </Field>
      </section>

      {/* ── Skills ───────────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Core Skills</SectionTitle>
        <div className="space-y-4">
          <Field label="Generative AI & LLMs" hint="Press Enter or comma to add">
            <TagInput value={p.skillsGenAI} onChange={(v) => set("skillsGenAI", v)} placeholder="RAG, GraphRAG, LangChain, Agentic AI, LlamaIndex…" />
          </Field>
          <Field label="ML & AI Research">
            <TagInput value={p.skillsML} onChange={(v) => set("skillsML", v)} placeholder="GNN, Multimodal AI, PyTorch, NLP, XAI…" />
          </Field>
          <Field label="Development & Databases">
            <TagInput value={p.skillsDev} onChange={(v) => set("skillsDev", v)} placeholder="Java, Spring Boot, ReactJS, Python, PostgreSQL, Docker…" />
          </Field>
          <Field label="Domains & Other">
            <TagInput value={p.skillsDomains} onChange={(v) => set("skillsDomains", v)} placeholder="Healthcare AI, e-governance, IoT, Arduino…" />
          </Field>
        </div>
      </section>

      {/* ── Job Preferences ──────────────────────────────────────────── */}
      <section>
        <SectionTitle>Job Preferences</SectionTitle>
        <div className="space-y-4">
          <Field label="Target titles">
            <TagInput value={p.targetTitles} onChange={(v) => set("targetTitles", v)} placeholder="AI Research Scientist, Generative AI Engineer…" />
          </Field>
          <Field label="Target locations">
            <TagInput value={p.targetLocations} onChange={(v) => set("targetLocations", v)} placeholder="Remote, India, Sweden, EU…" />
          </Field>
          <Field label="Must-haves">
            <TagInput value={p.mustHaves} onChange={(v) => set("mustHaves", v)} placeholder="Generative AI focus, Remote or visa support…" />
          </Field>
          <Field label="Nice-to-haves">
            <TagInput value={p.niceToHaves} onChange={(v) => set("niceToHaves", v)} placeholder="GraphRAG, multilingual NLP, research publication support…" />
          </Field>
          <Field label="Deal-breakers">
            <TagInput value={p.dealBreakers} onChange={(v) => set("dealBreakers", v)} placeholder="No AI/ML component, on-site only outside India…" />
          </Field>
          <div className="grid grid-cols-2 gap-6">
            <Field label="Score threshold" hint="Only prepare applications ≥ this score">
              <div className="flex items-center gap-3 mt-1">
                <input type="range" min="0" max="100" step="5" value={p.scoreThreshold} onChange={(e) => set("scoreThreshold", +e.target.value)} className="flex-1 accent-indigo-600" />
                <span className="w-10 text-center font-bold text-indigo-700">{p.scoreThreshold}</span>
              </div>
            </Field>
            <Field label="Daily application cap">
              <Input type="number" min="1" max="20" value={p.dailyCap} onChange={(e) => set("dailyCap", +e.target.value)} />
            </Field>
          </div>
        </div>
      </section>

      {/* ── Long-form sections ───────────────────────────────────────── */}
      <section>
        <SectionTitle>Education (Markdown — pasted directly into profile)</SectionTitle>
        <Textarea rows={5} value={p.education} onChange={(e) => set("education", e.target.value)}
          placeholder={"- PhD — AI/ML (Generative AI), pursuing: NIT Silchar…\n- M.Tech — CS&E: NIT Calicut, 2017, GPA 7.0…"} />
      </section>

      <section>
        <SectionTitle>Current Role Highlights (public-safe bullet points)</SectionTitle>
        <Textarea rows={5} value={p.currentRoleHighlights} onChange={(e) => set("currentRoleHighlights", e.target.value)}
          placeholder={"- AI research & solution development — GCP-GraphRAG, multimodal RAG…\n- Project coordinator, HMIS…"} />
      </section>

      <section>
        <SectionTitle>Research & Projects</SectionTitle>
        <Textarea rows={6} value={p.research} onChange={(e) => set("research", e.target.value)}
          placeholder={"- GCP-GraphRAG — …\n- SAHAYAK-AI — …"} />
      </section>

      <section>
        <SectionTitle>Standard Application Answers</SectionTitle>
        <Field label="" hint={'Draft answers for "Why this role?", "Greatest strength", etc.'}>
          <Textarea rows={6} value={p.standardAnswers} onChange={(e) => set("standardAnswers", e.target.value)}
            placeholder={"- \"Why do you want this role?\" …\n- \"Greatest strength\" …"} />
        </Field>
      </section>

      {/* ── Cowork Prompts ────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Cowork Prompt</SectionTitle>
        <p className="text-sm text-slate-500 mb-4">
          Open a Cowork session with your JobFinder folder connected, paste this prompt, and Claude will run the complete job search workflow automatically.
        </p>
        {(() => {
          const PROMPT = `Read folder-instructions.md in this folder first, then execute the following steps in order. Do not skip any step.

━━━ PART A — APPLY APPROVED JOBS (do this before anything else) ━━━

Run: python scripts/apply_approved.py
This outputs a list of jobs the user has already approved for application.

For EACH job in that output, you MUST take these browser actions right now:
  a. Use your Claude in Chrome browser tools to open a NEW browser tab.
  b. Navigate to the job's application URL (use the official company ATS page — if the stored URL is an aggregator like LinkedIn or Internshala, first search the web for the company's official careers page and navigate there instead).
  c. Read the form fields on the page.
  d. Fill in EVERY visible field using the data from profile.md (name, email, phone, location, LinkedIn, work authorization, notice period, expected CTC, relocation preference, work mode preference, etc.). Use the tailored resume from jobs/<Company>_<Role>/ if it exists; otherwise upload the master resume.
  e. If the form has any field not covered by profile.md, leave it blank and note it.
  f. STOP — do not click Submit, Apply, or Send under any circumstances.
  g. Take a screenshot of the filled form.
  h. Keep this tab open for the user to review and submit manually.

Repeat steps a–h for every approved job before moving to Part B.

━━━ PART B — SOURCE AND PROCESS NEW ROLES ━━━

1. Sync profile: run scripts/fetch_profile.py to pull the latest cloud profile. Read active_track.json to know which tracker and profile file to use for all steps below.
2. Source new job listings matching my target titles, locations, and work preferences (web search + job-alert emails).
3. Deduplicate — skip any URL or Company+Role already in the tracker.
4. Score each new role 0–100 against my profile. Mark deal-breakers as Skipped. Leave below-threshold roles as Scored.
5. Eligibility check — mark Eligible = Yes only when all must-haves from profile.md Section 9 are met.
6. Tailor resume and cover letter for the top 2 highest-scoring eligible roles. Save to jobs/<Company>_<Role>/.
7. For each newly tailored role, repeat the browser actions from Part A (open new tab → navigate to official ATS → fill form → stop before Submit → screenshot).
8. Update the tracker: every row gets status, score, rationale, file names, and today's date.
9. Run scripts/sync_jobs.py to push tracker to the cloud.
10. Run scripts/pending_confirmations.py and show its output.
11. One-time setup: create a scheduled task with ID "sarthitantra-daily-pipeline", cron "0 11 * * *" (11:00 AM daily). Skip this step silently if that task ID already exists.

━━━ FINAL SUMMARY ━━━

Show one consolidated report:
• Jobs applied for from Part A (with screenshots of each filled form)
• New roles sourced, scored, and their scores
• Roles tailored and applied for in Part B (with screenshots)
• Roles skipped (deal-breaker or below threshold)
• All jobs currently waiting for the user to click Submit

End with: "All forms are filled and waiting in open browser tabs. Please review each tab and click Submit yourself. Once you've submitted, tell me the Job ID (e.g. 'I submitted JOB-042') and I'll mark it as Submitted in the tracker."

GUARDRAILS: Never click Submit or Apply. Never enter passwords, OTPs, or government IDs. Never apply to deal-breakers. Never invent experience. Respect the daily cap in profile.md Section 9.`;
          return (
            <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-indigo-900">Full workflow run</p>
                <button
                  type="button"
                  onClick={() => copyPrompt("main", PROMPT)}
                  className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                    copied === "main"
                      ? "bg-green-100 text-green-700 border border-green-200"
                      : "bg-white text-indigo-700 border border-indigo-300 hover:bg-indigo-100"
                  }`}
                >
                  {copied === "main" ? "✓ Copied" : "Copy prompt"}
                </button>
              </div>
              <pre className="text-xs text-indigo-900 bg-white border border-indigo-100 rounded-lg p-3 whitespace-pre-wrap leading-relaxed font-sans">{PROMPT}</pre>
            </div>
          );
        })()}
      </section>

      {/* ── Cowork Config ─────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Cowork Desktop Setup</SectionTitle>
        <div className="bg-slate-50 rounded-xl p-4 space-y-3">
          <p className="text-sm text-slate-600">
            Download the complete starter kit — your personal config, <code className="bg-white px-1 rounded border text-xs">folder-instructions.md</code>,
            scripts, and folder structure — in one zip. Extract it to create or restore your local JobFinder folder at any time.
          </p>
          <button type="button" onClick={downloadStarterKit} disabled={kitBuilding}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition disabled:opacity-60">
            {kitBuilding ? "⏳ Building zip…" : "⬇️ Download Full Starter Kit"}
          </button>
        </div>
      </section>

      {/* ── Save button ───────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <p className="text-xs text-slate-400">Changes saved to your cloud profile — Cowork picks them up on next run.</p>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition disabled:opacity-60 flex items-center gap-2"
        >
          {saving ? "Saving…" : saved ? "✅ Saved!" : "Save Profile"}
        </button>
      </div>
    </div>
  );
}
