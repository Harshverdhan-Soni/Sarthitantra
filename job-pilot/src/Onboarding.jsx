/**
 * Onboarding.jsx — Multi-step wizard for new users
 * Steps: Welcome → Personal → Work Eligibility → Job Preferences → Skills & Summary → Resume Upload → Cowork Setup
 */
import React, { useState, useRef } from "react";
import JSZip from "jszip";
import { supabase } from "./supabase.js";
import { saveProfile } from "./db.js";

// ── Inline Tags Input ─────────────────────────────────────────────────────────
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
        <span
          key={tag}
          className="flex items-center gap-1 bg-indigo-100 text-indigo-800 text-xs font-medium px-2 py-1 rounded-full"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); remove(tag); }}
            className="text-indigo-500 hover:text-indigo-800 leading-none"
          >×</button>
        </span>
      ))}
      <input
        ref={ref}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (["Enter", ",", "Tab"].includes(e.key)) {
            e.preventDefault();
            add(input);
          } else if (e.key === "Backspace" && !input && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => { if (input.trim()) add(input); }}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[120px] outline-none text-sm text-slate-700 bg-transparent placeholder:text-slate-400"
      />
    </div>
  );
}

// ── Field helpers ─────────────────────────────────────────────────────────────
const Field = ({ label, hint, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
    {hint && <p className="text-xs text-slate-500 mb-1.5">{hint}</p>}
    {children}
  </div>
);

const Input = (props) => (
  <input
    {...props}
    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition placeholder:text-slate-400"
  />
);

const Select = ({ children, ...props }) => (
  <select
    {...props}
    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition bg-white"
  >
    {children}
  </select>
);

const Textarea = (props) => (
  <textarea
    {...props}
    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition placeholder:text-slate-400 resize-y"
  />
);

// ── Constants ──────────────────────────────────────────────────────────────────
const STEPS = [
  "Welcome",
  "Personal Details",
  "Work Eligibility",
  "Job Preferences",
  "Skills & Summary",
  "Master Resume",
  "Cowork Setup",
];

const EMPTY_PROFILE = {
  onboardingComplete: false,
  fullName: "", email: "", phone: "", location: "",
  openToRelocation: true, relocationNotes: "", preferredWorkMode: "Remote",
  workAuth: "Indian citizen, authorized to work in India",
  sponsorshipNeeded: false, sponsorshipNote: "",
  noticePeriod: "", currentCtc: "", expectedCtc: "", earliestStartDate: "",
  currentlyEmployed: true, currentTitle: "", currentOrg: "",
  professionalSummary: "",
  skillsGenAI: [], skillsML: [], skillsDev: [], skillsDomains: [],
  portfolio: "", linkedin: "", github: "", youtube: "", scholar: "",
  targetTitles: [], targetLocations: [],
  mustHaves: [], niceToHaves: [], dealBreakers: [],
  scoreThreshold: 70, dailyCap: 8,
  masterResumeUrl: "", masterResumeName: "",
  education: "", currentRoleHighlights: "", research: "", standardAnswers: "",
};

// ── Main component ────────────────────────────────────────────────────────────
export default function Onboarding({ user, onComplete }) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState({
    ...EMPTY_PROFILE,
    email: user?.email ?? "",
    fullName: user?.user_metadata?.full_name ?? "",
  });
  const [resumeFile, setResumeFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key, val) => setProfile((p) => ({ ...p, [key]: val }));

  const next = () => { setError(""); setStep((s) => Math.min(s + 1, STEPS.length - 1)); };
  const back = () => { setError(""); setStep((s) => Math.max(s - 1, 0)); };

  // ── Upload resume to Supabase Storage ─────────────────────────────────────
  const uploadResume = async () => {
    if (!resumeFile) return true; // skip if no file
    setUploading(true);
    try {
      const ext = resumeFile.name.split(".").pop().toLowerCase();
      const path = `${user.id}/master_resume.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(path, resumeFile, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("resumes").getPublicUrl(path);
      // Store signed URL instead (private bucket)
      const { data: signed } = await supabase.storage
        .from("resumes")
        .createSignedUrl(path, 60 * 60 * 24 * 365); // 1-year signed URL

      set("masterResumeUrl", signed?.signedUrl ?? publicUrl);
      set("masterResumeName", resumeFile.name);
      return true;
    } catch (e) {
      setError("Resume upload failed: " + e.message);
      return false;
    } finally {
      setUploading(false);
    }
  };

  // ── Complete onboarding ────────────────────────────────────────────────────
  const complete = async () => {
    setSaving(true);
    setError("");
    try {
      const uploaded = await uploadResume();
      if (!uploaded) { setSaving(false); return; }
      const finalProfile = { ...profile, onboardingComplete: true };
      await saveProfile(user.id, finalProfile);
      onComplete(finalProfile);
    } catch (e) {
      setError("Failed to save: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const [kitDownloading, setKitDownloading] = useState(false);
  const [kitDone, setKitDone] = useState(false);
  const [copied, setCopied] = useState("");

  const configJson = JSON.stringify({
    supabase_url: SUPABASE_URL,
    supabase_key: SUPABASE_KEY,
    user_email: user?.email ?? "",
    user_id: user?.id ?? "",
  }, null, 2);

  const copyPrompt = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(""), 2000);
    });
  };

  const downloadStarterKit = async () => {
    setKitDownloading(true);
    try {
      const zip = new JSZip();

      // Fetch static files from public/starter-kit/
      const [pyRes, instrRes, quickRes] = await Promise.all([
        fetch("/starter-kit/scripts/fetch_profile.py"),
        fetch("/starter-kit/folder-instructions.md"),
        fetch("/starter-kit/QUICK_START.txt"),
      ]);
      const [pyText, instrText, quickText] = await Promise.all([
        pyRes.text(), instrRes.text(), quickRes.text(),
      ]);

      // Personalised config
      zip.file("sarthitantra_config.json", configJson);
      // Scripts
      zip.folder("scripts").file("fetch_profile.py", pyText);
      // Instructions
      zip.file("folder-instructions.md", instrText);
      // Quick start guide
      zip.file("QUICK_START.txt", quickText);
      // Empty placeholder folders
      zip.folder("master").file(".gitkeep", "");
      zip.folder("jobs").file(".gitkeep", "");

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Sarthitantra_StarterKit.zip";
      a.click();
      URL.revokeObjectURL(url);
      setKitDone(true);
    } catch (e) {
      setError("Download failed: " + e.message);
    } finally {
      setKitDownloading(false);
    }
  };

  // ── Step renderer ──────────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {
      // ── Step 0: Welcome ──────────────────────────────────────────────────
      case 0: return (
        <div className="text-center space-y-6">
          <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
            <span className="text-4xl">🚀</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Welcome to Sarthitantra</h2>
            <p className="text-slate-500 mt-2 max-w-md mx-auto">
              Your personal AI-powered job application assistant. Let's set up your
              profile in about 5 minutes — this is the information Cowork uses to
              find, score, tailor, and pre-fill job applications for you.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto text-sm">
            {[["🔍", "Smart sourcing", "Find roles that match your profile"],
              ["✍️", "Auto-tailoring", "Resumes tuned for each job"],
              ["📋", "Pre-filled forms", "Never retype your details"],
            ].map(([icon, title, desc]) => (
              <div key={title} className="bg-slate-50 rounded-xl p-3 text-center">
                <div className="text-2xl mb-1">{icon}</div>
                <div className="font-semibold text-slate-700 text-xs">{title}</div>
                <div className="text-slate-500 text-xs mt-0.5">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      );

      // ── Step 1: Personal Details ─────────────────────────────────────────
      case 1: return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full name *">
              <Input value={profile.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Harshverdhan Soni" />
            </Field>
            <Field label="Email *">
              <Input value={profile.email} onChange={(e) => set("email", e.target.value)} type="email" placeholder="you@example.com" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone" hint="Include country code, e.g. +91-9876543210">
              <Input value={profile.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91-XXXXXXXXXX" />
            </Field>
            <Field label="Current location">
              <Input value={profile.location} onChange={(e) => set("location", e.target.value)} placeholder="City, State" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Preferred work mode">
              <Select value={profile.preferredWorkMode} onChange={(e) => set("preferredWorkMode", e.target.value)}>
                <option>Remote</option>
                <option>Hybrid</option>
                <option>On-site</option>
                <option>Remote or On-site</option>
              </Select>
            </Field>
            <Field label="Open to relocation?">
              <Select value={profile.openToRelocation ? "yes" : "no"} onChange={(e) => set("openToRelocation", e.target.value === "yes")}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            </Field>
          </div>
          {profile.openToRelocation && (
            <Field label="Relocation notes" hint="Where are you open to? Any preferences?">
              <Input value={profile.relocationNotes} onChange={(e) => set("relocationNotes", e.target.value)} placeholder="e.g. Europe / Sweden preferred; also open to remote globally" />
            </Field>
          )}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Online Presence</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Portfolio / website">
                <Input value={profile.portfolio} onChange={(e) => set("portfolio", e.target.value)} placeholder="https://yoursite.com" />
              </Field>
              <Field label="LinkedIn">
                <Input value={profile.linkedin} onChange={(e) => set("linkedin", e.target.value)} placeholder="https://linkedin.com/in/..." />
              </Field>
              <Field label="GitHub">
                <Input value={profile.github} onChange={(e) => set("github", e.target.value)} placeholder="https://github.com/..." />
              </Field>
              <Field label="YouTube / other">
                <Input value={profile.youtube} onChange={(e) => set("youtube", e.target.value)} placeholder="https://youtube.com/@..." />
              </Field>
            </div>
          </div>
        </div>
      );

      // ── Step 2: Work Eligibility ─────────────────────────────────────────
      case 2: return (
        <div className="space-y-4">
          <Field label="Work authorization">
            <Input value={profile.workAuth} onChange={(e) => set("workAuth", e.target.value)} placeholder="e.g. Indian citizen, authorized to work in India" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Sponsorship needed for overseas roles?">
              <Select value={profile.sponsorshipNeeded ? "yes" : "no"} onChange={(e) => set("sponsorshipNeeded", e.target.value === "yes")}>
                <option value="no">No</option>
                <option value="yes">Yes — would need visa/work-permit sponsorship</option>
              </Select>
            </Field>
            <Field label="Currently employed?">
              <Select value={profile.currentlyEmployed ? "yes" : "no"} onChange={(e) => set("currentlyEmployed", e.target.value === "yes")}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            </Field>
          </div>
          {profile.currentlyEmployed && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Current title">
                <Input value={profile.currentTitle} onChange={(e) => set("currentTitle", e.target.value)} placeholder="e.g. Technical Assistant" />
              </Field>
              <Field label="Current organization">
                <Input value={profile.currentOrg} onChange={(e) => set("currentOrg", e.target.value)} placeholder="e.g. C-DAC" />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Notice period">
              <Input value={profile.noticePeriod} onChange={(e) => set("noticePeriod", e.target.value)} placeholder="e.g. 45 days" />
            </Field>
            <Field label="Earliest start date">
              <Input value={profile.earliestStartDate} onChange={(e) => set("earliestStartDate", e.target.value)} placeholder="e.g. August 2026" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Current CTC" hint="Annual, e.g. 7 LPA">
              <Input value={profile.currentCtc} onChange={(e) => set("currentCtc", e.target.value)} placeholder="7 LPA" />
            </Field>
            <Field label="Expected CTC" hint="Annual, e.g. 15 LPA">
              <Input value={profile.expectedCtc} onChange={(e) => set("expectedCtc", e.target.value)} placeholder="15 LPA" />
            </Field>
          </div>
        </div>
      );

      // ── Step 3: Job Preferences ──────────────────────────────────────────
      case 3: return (
        <div className="space-y-4">
          <Field label="Target job titles" hint="Press Enter or comma to add each title">
            <TagInput value={profile.targetTitles} onChange={(v) => set("targetTitles", v)} placeholder="e.g. AI Research Scientist, Generative AI Engineer…" />
          </Field>
          <Field label="Target locations" hint="Press Enter or comma after each location">
            <TagInput value={profile.targetLocations} onChange={(v) => set("targetLocations", v)} placeholder="e.g. Remote, India, Sweden…" />
          </Field>
          <Field label="Must-haves" hint="A job missing any of these will be skipped">
            <TagInput value={profile.mustHaves} onChange={(v) => set("mustHaves", v)} placeholder="e.g. Generative AI focus, Remote or visa support…" />
          </Field>
          <Field label="Nice-to-haves" hint="These boost the match score but aren't required">
            <TagInput value={profile.niceToHaves} onChange={(v) => set("niceToHaves", v)} placeholder="e.g. GraphRAG, multilingual NLP, healthcare AI…" />
          </Field>
          <Field label="Deal-breakers" hint="Any job with these will be auto-rejected">
            <TagInput value={profile.dealBreakers} onChange={(v) => set("dealBreakers", v)} placeholder="e.g. No AI/ML component, on-site only outside India…" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Score threshold (0–100)" hint="Only tailor & apply at or above this score">
              <div className="flex items-center gap-3">
                <input
                  type="range" min="0" max="100" step="5"
                  value={profile.scoreThreshold}
                  onChange={(e) => set("scoreThreshold", +e.target.value)}
                  className="flex-1 accent-indigo-600"
                />
                <span className="w-10 text-center font-semibold text-indigo-700">{profile.scoreThreshold}</span>
              </div>
            </Field>
            <Field label="Daily application cap" hint="Max applications to prepare per run">
              <Input
                type="number" min="1" max="20"
                value={profile.dailyCap}
                onChange={(e) => set("dailyCap", +e.target.value)}
              />
            </Field>
          </div>
        </div>
      );

      // ── Step 4: Skills & Summary ─────────────────────────────────────────
      case 4: return (
        <div className="space-y-4">
          <Field label="Professional summary" hint="2–3 sentences. Cowork adapts this per role.">
            <Textarea
              rows={4}
              value={profile.professionalSummary}
              onChange={(e) => set("professionalSummary", e.target.value)}
              placeholder="Applied AI researcher and full-stack engineer with X years across…"
            />
          </Field>
          <Field label="Generative AI & LLM skills" hint="Press Enter or comma after each skill">
            <TagInput value={profile.skillsGenAI} onChange={(v) => set("skillsGenAI", v)} placeholder="e.g. RAG, GraphRAG, LangChain, Agentic AI…" />
          </Field>
          <Field label="ML & AI research skills">
            <TagInput value={profile.skillsML} onChange={(v) => set("skillsML", v)} placeholder="e.g. GNN, Multimodal AI, PyTorch, NLP…" />
          </Field>
          <Field label="Development & databases">
            <TagInput value={profile.skillsDev} onChange={(v) => set("skillsDev", v)} placeholder="e.g. Java, Spring Boot, ReactJS, Python, PostgreSQL…" />
          </Field>
          <Field label="Domain expertise & other">
            <TagInput value={profile.skillsDomains} onChange={(v) => set("skillsDomains", v)} placeholder="e.g. Healthcare AI, e-governance, IoT, Docker…" />
          </Field>
        </div>
      );

      // ── Step 5: Upload Resume ────────────────────────────────────────────
      case 5: return (
        <div className="space-y-5">
          <div className="text-center space-y-2">
            <div className="text-3xl">📄</div>
            <h3 className="font-semibold text-slate-800">Upload your master resume</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              This is the base resume Cowork tailors for each application. PDF or DOCX, max 5 MB.
              You can update it later from your profile.
            </p>
          </div>

          <label className="block border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl p-8 text-center cursor-pointer transition-colors">
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
            />
            {resumeFile ? (
              <div className="space-y-1">
                <div className="text-2xl">✅</div>
                <div className="font-medium text-slate-800">{resumeFile.name}</div>
                <div className="text-xs text-slate-500">{(resumeFile.size / 1024).toFixed(0)} KB — click to change</div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-3xl text-slate-400">⬆️</div>
                <div className="text-sm font-medium text-slate-600">Click to choose file</div>
                <div className="text-xs text-slate-400">PDF or DOCX, up to 5 MB</div>
              </div>
            )}
          </label>

          {profile.masterResumeUrl && !resumeFile && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 flex items-center gap-2">
              <span>✅</span>
              <span>Resume already uploaded: <strong>{profile.masterResumeName || "master_resume"}</strong></span>
            </div>
          )}

          <p className="text-xs text-slate-400 text-center">
            You can skip this and upload later — Cowork will prompt you if it can't find a resume.
          </p>
        </div>
      );

      // ── Step 6: Cowork Setup ─────────────────────────────────────────────
      case 6: return (
        <div className="space-y-4">

          {/* Intro */}
          <div className="text-center space-y-1 pb-1">
            <div className="text-3xl">🖥️</div>
            <h3 className="font-semibold text-slate-800">Connect Claude Cowork to your profile</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Cowork runs on your computer and reads your profile from the cloud.
              Follow these four steps once — then every job run is fully automatic.
            </p>
          </div>

          {/* ── Step A: Download starter kit ───────────────────────────── */}
          <div className={`rounded-xl border-2 p-4 space-y-3 transition-colors ${kitDone ? "border-green-300 bg-green-50" : "border-indigo-200 bg-indigo-50"}`}>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
              <p className="font-semibold text-slate-800 text-sm">Download your Starter Kit</p>
            </div>
            <p className="text-xs text-slate-600 ml-9">
              One ZIP with everything you need — your personalised config, all scripts,
              the pipeline instructions, and a Quick Start guide. Nothing else to find or install manually.
            </p>
            <div className="ml-9">
              <button
                type="button"
                onClick={downloadStarterKit}
                disabled={kitDownloading}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm px-5 py-2.5 rounded-lg font-semibold transition flex items-center gap-2"
              >
                {kitDownloading ? "⏳ Preparing…" : kitDone ? "✅ Downloaded!" : "⬇️ Download Starter Kit (.zip)"}
              </button>
            </div>
            {kitDone && (
              <p className="text-xs text-green-700 ml-9">
                ✅ <strong>Sarthitantra_StarterKit.zip</strong> saved to your Downloads folder.
              </p>
            )}
          </div>

          {/* ── Step B: Create folder & extract ────────────────────────── */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
              <p className="font-semibold text-slate-800 text-sm">Create your folder and extract the ZIP</p>
            </div>
            <div className="ml-9 space-y-2 text-xs text-slate-600">
              <p>Create a folder anywhere on your computer — this is your permanent Sarthitantra workspace. For example:</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                  <p className="font-semibold text-slate-500 mb-0.5">Windows</p>
                  <code className="text-indigo-700">C:\Users\You\Documents\Sarthitantra\</code>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                  <p className="font-semibold text-slate-500 mb-0.5">Mac / Linux</p>
                  <code className="text-indigo-700">~/Documents/Sarthitantra/</code>
                </div>
              </div>
              <p>Then extract the ZIP <strong>into that folder</strong>. After extraction you should see:</p>
              <pre className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 leading-relaxed">{`Sarthitantra/
├── sarthitantra_config.json   ← your personal connection file
├── folder-instructions.md     ← pipeline rules for Cowork
├── QUICK_START.txt            ← this guide (offline reference)
├── scripts/
│   └── fetch_profile.py       ← profile sync script
├── master/                    ← your resume downloads here
└── jobs/                      ← one subfolder per job`}</pre>
            </div>
          </div>

          {/* ── Step C: Install Python dependency ─────────────────────── */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">3</span>
              <p className="font-semibold text-slate-800 text-sm">Install the Python dependency <span className="font-normal text-slate-400">(one-time, takes ~10 seconds)</span></p>
            </div>
            <div className="ml-9 space-y-2 text-xs text-slate-600">
              <p>Open a terminal (Command Prompt on Windows, Terminal on Mac) and run:</p>
              <pre className="bg-slate-800 text-green-300 px-4 py-2.5 rounded-lg">pip install supabase</pre>
              <p className="text-slate-400">That's the only external package needed. Python 3.8+ required.</p>
            </div>
          </div>

          {/* ── Step D: Connect to Cowork ──────────────────────────────── */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">4</span>
              <p className="font-semibold text-slate-800 text-sm">Connect the folder to Claude Cowork and start</p>
            </div>
            <ol className="ml-9 space-y-1.5 text-xs text-slate-600 list-none">
              {[
                ["Open the Claude desktop app.", ""],
                ['In Cowork mode, click the folder icon / "Select folder".', ""],
                ["Navigate to your Sarthitantra folder and select it.", "Cowork reads folder-instructions.md automatically from now on."],
                ["Type either prompt below to start your first run:", ""],
              ].map(([text, sub], i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i+1}</span>
                  <span>{text}{sub && <span className="block text-slate-400 mt-0.5">{sub}</span>}</span>
                </li>
              ))}
            </ol>

            {/* Copyable prompts */}
            <div className="ml-9 space-y-2">
              {[
                { label: "Quick run", prompt: "Run the full job pipeline." },
                { label: "Detailed run", prompt: "Sync my profile from Sarthitantra, then source new job roles matching my preferences, score and filter them, tailor my resume for the top matches, pre-fill the application forms in my browser, and show me a summary of everything ready for my approval." },
              ].map(({ label, prompt }) => (
                <div key={label} className="bg-white border border-slate-200 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                  <p className="text-xs text-slate-700 leading-relaxed italic">"{prompt}"</p>
                  <button
                    type="button"
                    onClick={() => copyPrompt(prompt)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition"
                  >
                    {copied === prompt ? "✅ Copied!" : "📋 Copy prompt"}
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>
      );

      default: return null;
    }
  };

  const isLastStep = step === STEPS.length - 1;
  const canProceed = step !== 1 || (profile.fullName.trim() && profile.email.trim());

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-medium text-slate-500">
              Step {step + 1} of {STEPS.length}
            </span>
            <span className="text-xs font-medium text-indigo-600">{STEPS[step]}</span>
          </div>
          <div className="h-1.5 bg-slate-200 rounded-full">
            <div
              className="h-1.5 bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${((step) / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            {STEPS.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => i < step && setStep(i)}
                className={`text-xs transition-colors ${
                  i < step ? "text-indigo-600 cursor-pointer hover:underline" :
                  i === step ? "text-slate-700 font-medium" : "text-slate-400 cursor-default"
                }`}
                disabled={i > step}
              >
                {i < step ? "✓" : i === step ? "●" : "○"}
              </button>
            ))}
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 md:p-8">
          {step > 0 && (
            <h2 className="text-xl font-bold text-slate-800 mb-5">{STEPS[step]}</h2>
          )}
          {renderStep()}

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            <button
              type="button"
              onClick={back}
              className={`px-5 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition ${step === 0 ? "invisible" : ""}`}
            >
              ← Back
            </button>

            {isLastStep ? (
              <button
                type="button"
                onClick={complete}
                disabled={saving}
                className="px-6 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition disabled:opacity-60"
              >
                {saving ? "Saving…" : "🎉 Finish Setup"}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                disabled={!canProceed || uploading}
                className="px-6 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition disabled:opacity-60"
              >
                {uploading ? "Uploading…" : "Continue →"}
              </button>
            )}
          </div>

          {step === 0 && (
            <p className="text-center text-xs text-slate-400 mt-4">
              Already set up?{" "}
              <button
                type="button"
                onClick={() => onComplete(null)}
                className="text-indigo-500 hover:underline"
              >
                Skip to app
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
