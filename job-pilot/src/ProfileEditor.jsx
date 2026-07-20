/**
 * ProfileEditor.jsx — Full profile editing form
 * Shown inside the main app (Profile tab / Setup section).
 * Uses the same profile schema as Onboarding.jsx.
 */
import React, { useState, useRef, useEffect } from "react";
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
  const [resumeFile, setResumeFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const set = (key, val) => setP((prev) => ({ ...prev, [key]: val }));

  const uploadResume = async () => {
    if (!resumeFile) return;
    setUploading(true);
    try {
      const ext = resumeFile.name.split(".").pop().toLowerCase();
      const path = `${user.id}/master_resume.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(path, resumeFile, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: signed } = await supabase.storage
        .from("resumes")
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      setP((prev) => ({
        ...prev,
        masterResumeUrl: signed?.signedUrl ?? "",
        masterResumeName: resumeFile.name,
      }));
      setResumeFile(null);
    } catch (e) {
      setError("Upload failed: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (resumeFile) await uploadResume();
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

  const downloadConfig = () => {
    const blob = new Blob([JSON.stringify({
      supabase_url: SUPABASE_URL,
      supabase_key: SUPABASE_KEY,
      user_email: user?.email ?? "",
      user_id: user?.id ?? "",
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "sarthitantra_config.json"; a.click();
    URL.revokeObjectURL(url);
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

      {/* ── Master Resume ─────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Master Resume</SectionTitle>
        <div className="space-y-3">
          {p.masterResumeUrl && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
              <span className="text-green-600 text-lg">📄</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{p.masterResumeName || "master_resume"}</p>
                <a href={p.masterResumeUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">View / Download</a>
              </div>
              <label className="text-xs text-indigo-600 hover:underline cursor-pointer">
                Replace
                <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          )}
          {!p.masterResumeUrl && (
            <label className="block border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl p-6 text-center cursor-pointer transition-colors">
              <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)} />
              {resumeFile ? (
                <p className="text-sm text-slate-700">✅ {resumeFile.name}</p>
              ) : (
                <p className="text-sm text-slate-500">⬆️ Click to upload PDF or DOCX (max 5 MB)</p>
              )}
            </label>
          )}
          {resumeFile && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-slate-600">Selected: {resumeFile.name}</p>
              <button type="button" onClick={uploadResume} disabled={uploading}
                className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700 transition disabled:opacity-60">
                {uploading ? "Uploading…" : "Upload now"}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Cowork Config ─────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Cowork Desktop Setup</SectionTitle>
        <div className="bg-slate-50 rounded-xl p-4 space-y-3">
          <p className="text-sm text-slate-600">
            Save this config file in your local JobFinder folder. The <code className="bg-white px-1 rounded border text-xs">fetch_profile.py</code> script
            uses it to download your profile before each run.
          </p>
          <button type="button" onClick={downloadConfig}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition">
            ⬇️ Download sarthitantra_config.json
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
