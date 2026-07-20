import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Briefcase, SlidersHorizontal, Star, Search, Upload, Download,
  MapPin, Building2, Trash2, Plus, X, CheckCircle2, AlertTriangle,
  ExternalLink, RotateCcw, FileText, Wand2, FileUp, Loader2,
  FolderOpen, RefreshCw, Eye, Plug, FileSignature, Clock,
  Users, UserPlus, ChevronDown, ChevronUp, GraduationCap,
  Send, AlertCircle, RotateCw
} from "lucide-react";
import { extractText, analyzeResume, buildProfileMd } from "./resumeAnalyzer.js";
import {
  FS_OK, pickFolder, ensurePermission, saveHandle, loadHandle,
  scanJobs, readTrackerBuffer, previewFile,
  ensureManifest, addApplicant, scanApplicantFiles, writeApplicantResume,
  readProfileMd, parseProfileMd,
} from "./folderAccess.js";
import { matchSkills, SKILLS, matchExistingSkillsForJob } from "./skillsCatalog.js";
import {
  fetchAll, saveProfile, savePrefs, saveSkillState,
  saveListing, syncListings, deleteListing, debounced,
} from "./db.js";

const ACCENT = "#4f46e5";

const DEFAULT_PREFS = {
  targetTitles: ["Applied AI Research Scientist", "AI Researcher", "Generative AI Engineer", "Senior AI/ML Engineer", "Research Scientist", "Postdoctoral Researcher"],
  locations: ["Remote", "Sweden", "Europe", "India"],
  workModes: ["Remote", "Hybrid"],
  mustHaves: ["GenAI / applied-AI focus", "Remote or EU sponsorship"],
  niceToHaves: ["Multilingual NLP", "RAG / GraphRAG", "Agentic AI", "Conference / publication support"],
  dealBreakers: ["No AI/ML component", "Onsite abroad without sponsorship", "Frontend-only role"],
  scoreThreshold: 70,
  dailyCap: 8,
};

const STATUS_OPTIONS = ["Sourced", "Scored", "Tailored", "Queued", "Awaiting approval", "Submitted", "Skipped", "Interview", "Offer", "Rejected", "No response"];

const APPLY_FIELDS = [
  { key: "name",         label: "Full name",               required: true  },
  { key: "email",        label: "Email",                   required: true  },
  { key: "phone",        label: "Phone (with country code)", required: true  },
  { key: "location",     label: "Current location",        required: false },
  { key: "linkedin",     label: "LinkedIn URL",            required: false },
  { key: "github",       label: "GitHub URL",              required: false },
  { key: "portfolio",    label: "Portfolio / website",     required: false },
  { key: "workAuth",     label: "Work authorization",      required: false },
  { key: "sponsorship",  label: "Sponsorship needed?",     required: false },
  { key: "noticePeriod", label: "Notice period",           required: false },
  { key: "expectedCtc",  label: "Expected CTC / Salary",   required: false },
  { key: "startDate",    label: "Earliest start date",     required: false },
  { key: "relocation",   label: "Open to relocation?",     required: false },
  { key: "workMode",     label: "Preferred work mode",     required: false },
];

const TERMINAL_STATUSES = new Set(["Submitted", "Interview", "Offer", "Rejected", "No response"]);

const DEFAULT_PROFILE = {
  name: "", email: "", phone: "", location: "", relocation: "", workMode: "",
  workAuth: "", sponsorship: "", noticePeriod: "", currentCtc: "", expectedCtc: "", startDate: "",
  summary: "", linkedin: "", github: "", portfolio: "", scholar: "",
  skillsByCategory: {}, seniority: null,
};

const load = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const scoreColor = (s) => {
  const n = Number(s) || 0;
  if (n >= 80) return "#16a34a";
  if (n >= 70) return "#65a30d";
  if (n >= 50) return "#d97706";
  return "#dc2626";
};

const statusClass = (s) => {
  const map = {
    "Queued": "bg-indigo-100 text-indigo-700",
    "Awaiting approval": "bg-amber-100 text-amber-700",
    "Submitted": "bg-green-100 text-green-700",
    "Tailored": "bg-sky-100 text-sky-700",
    "Skipped": "bg-slate-200 text-slate-600",
    "Interview": "bg-violet-100 text-violet-700",
    "Offer": "bg-emerald-100 text-emerald-800",
    "Rejected": "bg-rose-100 text-rose-700",
  };
  return map[s] || "bg-slate-100 text-slate-600";
};

const isDealBreaker = (l) => String(l.dealBreaker || "").trim().toLowerCase() === "yes";

function ChipEditor({ label, items, onChange, placeholder }) {
  const [val, setVal] = useState("");
  const add = () => {
    const v = val.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setVal("");
  };
  return (
    <div className="mb-5">
      <label className="block text-sm font-semibold text-slate-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {items.map((it) => (
          <span key={it} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            {it}
            <button onClick={() => onChange(items.filter((x) => x !== it))} className="text-slate-400 hover:text-rose-500">
              <X size={14} />
            </button>
          </span>
        ))}
        {items.length === 0 && <span className="text-sm text-slate-400 italic">None set</span>}
      </div>
      <div className="flex gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button onClick={add} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white" style={{ background: ACCENT }}>
          <Plus size={16} /> Add
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-2xl font-bold" style={{ color: color || "#0f172a" }}>{value}</div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, full }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
    </div>
  );
}

function SkillChecklist({ skillIds, existingSkills, skillState, onToggle }) {
  const [open, setOpen] = useState(false);
  const validIds = skillIds.filter((id) => SKILLS[id]);
  const gapsDone = validIds.filter((id) => skillState[id]).length;
  const existingDone = existingSkills.filter((s) => skillState[s.id]).length;
  const total = validIds.length + existingSkills.length;
  const done = gapsDone + existingDone;
  const ready = total > 0 && done === total;

  return (
    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <GraduationCap size={14} />
          {ready ? "Skills ready to apply" : `Skills to develop: ${done}/${total}`}
        </span>
        {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {validIds.map((id) => {
            const s = SKILLS[id];
            const checked = !!skillState[id];
            return (
              <label key={id} className="flex items-start gap-2 border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
                <input type="checkbox" checked={checked} onChange={() => onToggle(id)} className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <div className={`text-xs font-semibold ${checked ? "text-slate-400 line-through" : "text-slate-700"}`}>{s.title}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{s.why}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">Est. time: {s.time}</div>
                  {s.resources.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {s.resources.map((r) => (
                        <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-indigo-600 hover:underline">
                          {r.label} ↗
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </label>
            );
          })}

          {existingSkills.length > 0 && (
            <div className={validIds.length > 0 ? "border-t border-slate-200 pt-3" : ""}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Already on your resume — confirm or refresh
              </div>
              <div className="space-y-3">
                {existingSkills.map((s) => {
                  const checked = !!skillState[s.id];
                  return (
                    <label key={s.id} className="flex items-start gap-2">
                      <input type="checkbox" checked={checked} onChange={() => onToggle(s.id)} className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <div className={`text-xs font-semibold ${checked ? "text-slate-400 line-through" : "text-slate-700"}`}>{s.label}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          If you're confident, check it off. If you'd like to refresh first:
                        </div>
                        <div className="mt-1">
                          <a href={s.resource.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-indigo-600 hover:underline">
                            {s.resource.label} ↗
                          </a>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ApplicantModal({ manifest, onSelect, onCreate, onClose }) {
  const [name, setName] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-800"><Users size={18} /> Whose resume is this?</h3>
        <p className="mb-4 text-xs text-slate-500">Pick a profile to load their resume, preferences, and job tracker — or add a new applicant.</p>

        {manifest.length > 0 && (
          <div className="mb-4 space-y-2">
            {manifest.map((a) => (
              <button key={a.id} onClick={() => onSelect(a)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-indigo-400 hover:bg-indigo-50">
                <span className="font-medium text-slate-800">{a.name}</span>
                <span className="text-xs text-slate-400">{a.trackerFile}</span>
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-slate-200 pt-4">
          <label className="mb-2 block text-xs font-semibold text-slate-600">Add new applicant</label>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onCreate(name); }}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <button onClick={() => name.trim() && onCreate(name)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white" style={{ background: ACCENT }}>
              <UserPlus size={16} /> Create
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">Creates <code className="rounded bg-slate-100 px-1">master/&lt;name&gt;/</code> and its own tracker Excel — their jobs stay separate from everyone else's.</p>
        </div>

        <button onClick={onClose} className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600">Cancel</button>
      </div>
    </div>
  );
}

function ApplyPanel({ listing, profile, onConfirm, onCancel }) {
  const initial = {};
  APPLY_FIELDS.forEach(({ key }) => {
    initial[key] = listing.applyData?.[key] ?? profile[key] ?? "";
  });
  const [fields, setFields] = useState(initial);
  const [attempted, setAttempted] = useState(false);

  const setField = (key, val) => setFields((f) => ({ ...f, [key]: val }));
  const isEmpty = (key) => !String(fields[key] || "").trim();
  const missingRequired = APPLY_FIELDS.filter((f) => f.required && isEmpty(f.key));
  const missingOptional = APPLY_FIELDS.filter((f) => !f.required && isEmpty(f.key));
  const allMissing = [...missingRequired, ...missingOptional];
  const isRetry = listing.status === "Awaiting approval";

  const handleConfirm = () => {
    setAttempted(true);
    if (missingRequired.length > 0) return;
    onConfirm(fields);
  };

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          {isRetry ? <RotateCw size={15} className="text-amber-600" /> : <Send size={15} className="text-emerald-600" />}
          {isRetry ? "Update details & retry agent application" : "Review details — agent will apply on your behalf"}
        </h4>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
      </div>

      {allMissing.length > 0 && (
        <div className={`mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${missingRequired.length > 0 ? "bg-rose-50 text-rose-700" : "bg-amber-100 text-amber-800"}`}>
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>
            {missingRequired.length > 0
              ? <><strong>{missingRequired.length} required field{missingRequired.length > 1 ? "s" : ""}</strong> must be filled before the agent can apply. </>
              : null}
            {missingOptional.length > 0
              ? <span className={missingRequired.length > 0 ? "text-amber-700" : ""}>{missingOptional.length} optional field{missingOptional.length > 1 ? "s are" : " is"} empty — the agent will skip those form fields.</span>
              : null}
          </span>
        </div>
      )}

      {allMissing.length === 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <CheckCircle2 size={14} className="shrink-0" />
          All fields filled — the agent has everything it needs.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {APPLY_FIELDS.map(({ key, label, required }) => {
          const empty = isEmpty(key);
          const showError = attempted && required && empty;
          return (
            <div key={key}>
              <label className={`mb-1 block text-xs font-semibold ${showError ? "text-rose-600" : empty ? "text-amber-700" : "text-slate-600"}`}>
                {label}{required ? " *" : ""}
                {!empty && <span className="ml-1 text-emerald-500 font-normal">✓</span>}
              </label>
              <input
                value={fields[key] || ""}
                onChange={(e) => setField(key, e.target.value)}
                placeholder={`Enter ${label.toLowerCase()}`}
                className={`w-full rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 ${
                  showError
                    ? "border-rose-400 bg-rose-50 focus:border-rose-500 focus:ring-rose-200"
                    : empty
                    ? "border-amber-300 bg-white focus:border-amber-500 focus:ring-amber-200"
                    : "border-slate-200 bg-slate-50 focus:border-indigo-500 focus:ring-indigo-200"
                }`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleConfirm}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ background: isRetry ? "#d97706" : "#16a34a" }}
        >
          {isRetry ? <RotateCw size={14} /> : <Send size={14} />}
          {isRetry ? "Retry with updated info" : "Confirm & approve for agent"}
        </button>
        <button onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
        {missingOptional.length > 0 && missingRequired.length === 0 && (
          <span className="text-xs text-slate-400">{missingOptional.length} optional field{missingOptional.length > 1 ? "s" : ""} empty — agent will skip those.</span>
        )}
      </div>
    </div>
  );
}

export default function JobPilot({ user, onLogout, isAdmin, onAdmin }) {
  const [tab, setTab] = useState("setup");
  // Use user.id as namespace so localStorage is isolated per user
  const [namespace, setNamespace] = useState(() => user?.id ?? "local");
  const ns0 = user?.id ?? "local";
  const [prefs, setPrefs] = useState(() => ({ ...DEFAULT_PREFS, ...load(`jp_prefs_${ns0}`, {}) }));
  const [listings, setListings] = useState(() => load(`jp_listings_${ns0}`, []));
  const [profile, setProfile] = useState(() => ({ ...DEFAULT_PROFILE, ...load(`jp_profile_${ns0}`, {}) }));
  const [skillState, setSkillState] = useState(() => load(`jp_skills_${ns0}`, {}));
  const [cloudSynced, setCloudSynced] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(() => !!load("jp_profile_local", null));
  const [dirHandle, setDirHandle] = useState(null);
  const [folderName, setFolderName] = useState("");
  const [jobFiles, setJobFiles] = useState([]);
  const [savedHandle, setSavedHandle] = useState(null);
  const [preview, setPreview] = useState(null);
  const [manifest, setManifest] = useState([]);
  const [activeApplicant, setActiveApplicant] = useState(null);
  const [showApplicantPicker, setShowApplicantPicker] = useState(false);
  const [applicantFiles, setApplicantFiles] = useState([]);
  const [pendingResumeChoice, setPendingResumeChoice] = useState(null);
  const [applyPanelId, setApplyPanelId] = useState(null);
  const [search, setSearch] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [statusFilter, setStatusFilter] = useState("All");
  const [hideDB, setHideDB] = useState(true);
  const [onlyStar, setOnlyStar] = useState(false);
  const [sortBy, setSortBy] = useState("score");
  const [toast, setToast] = useState("");

  // ── Save to localStorage immediately, sync to Supabase after a short delay ──
  useEffect(() => {
    save(`jp_prefs_${namespace}`, prefs);
    if (user && cloudSynced) debounced("prefs", () => savePrefs(user.id, prefs));
  }, [prefs, namespace]);

  useEffect(() => {
    save(`jp_listings_${namespace}`, listings);
    if (user && cloudSynced) debounced("listings", () => syncListings(user.id, listings));
  }, [listings, namespace]);

  useEffect(() => {
    save(`jp_profile_${namespace}`, profile);
    if (user && cloudSynced) debounced("profile", () => saveProfile(user.id, profile));
  }, [profile, namespace]);

  useEffect(() => {
    save(`jp_skills_${namespace}`, skillState);
    if (user && cloudSynced) debounced("skills", () => saveSkillState(user.id, skillState));
  }, [skillState, namespace]);

  // ── On login: fetch cloud data and merge (cloud wins over local cache) ──────
  useEffect(() => {
    if (!user) return;
    fetchAll(user.id).then(({ profile: cp, prefs: cpr, listings: cl, skillState: cs }) => {
      if (cp)  { setProfile((p) => ({ ...p, ...cp })); save(`jp_profile_${user.id}`, { ...profile, ...cp }); setAnalyzed(true); }
      if (cpr) { setPrefs((p) => ({ ...DEFAULT_PREFS, ...cpr })); save(`jp_prefs_${user.id}`, cpr); }
      if (cl && cl.length > 0) { setListings(cl); save(`jp_listings_${user.id}`, cl); }
      if (cs)  { setSkillState(cs); save(`jp_skills_${user.id}`, cs); }
      setCloudSynced(true);
    });
  }, [user?.id]);

  useEffect(() => { if (FS_OK) loadHandle().then((h) => { if (h) setSavedHandle(h); }); }, []);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };
  const updatePref = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));
  const updateProfile = (k, v) => setProfile((p) => ({ ...p, [k]: v }));
  const toggleSkill = (id) => setSkillState((s) => ({ ...s, [id]: !s[id] }));

  const switchApplicant = (entry) => {
    const ns = entry ? entry.id : "local";
    setActiveApplicant(entry || null);
    setNamespace(ns);
    setPrefs({ ...DEFAULT_PREFS, ...load(`jp_prefs_${ns}`, {}) });
    setListings(load(`jp_listings_${ns}`, []));
    setProfile({ ...DEFAULT_PROFILE, ...load(`jp_profile_${ns}`, {}) });
    setSkillState(load(`jp_skills_${ns}`, {}));
    setAnalyzed(!!load(`jp_profile_${ns}`, null));
  };

  const parseTrackerBuffer = (buf) => {
    try {
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets["Applications"] || wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const mapped = rows.map(mapRow).filter((r) => r.company && r.role);
      mergeListings(mapped);
    } catch { flash("Couldn't read the tracker."); }
  };

  const activateFolder = async (h) => {
    setDirHandle(h); setFolderName(h.name);
    setJobFiles(await scanJobs(h));
    const m = await ensureManifest(h);
    setManifest(m); setShowApplicantPicker(true);
    flash("Folder connected.");
  };

  const connectFolder = async () => {
    try {
      const h = await pickFolder();
      if (!(await ensurePermission(h))) { flash("Permission denied."); return; }
      await saveHandle(h); setSavedHandle(h);
      await activateFolder(h);
    } catch { }
  };

  const reconnectFolder = async () => {
    if (!savedHandle) return;
    if (!(await ensurePermission(savedHandle))) { flash("Permission needed — try Connect."); return; }
    await activateFolder(savedHandle);
  };

  const disconnectFolder = () => {
    setDirHandle(null); setFolderName(""); setJobFiles([]);
    setManifest([]); setApplicantFiles([]); setPendingResumeChoice(null);
    switchApplicant(null);
  };

  const analyzeAndApply = async (file) => {
    setAnalyzing(true);
    try {
      const text = await extractText(file);
      if (!text || text.trim().length < 30) { flash("Couldn't read much text — try a DOCX or TXT export."); return false; }
      const a = analyzeResume(text);
      setProfile((p) => ({
        ...p,
        name: p.name || a.name, email: p.email || a.contact.email,
        phone: p.phone || a.contact.phone, location: p.location || a.location,
        linkedin: p.linkedin || a.contact.linkedin, github: p.github || a.contact.github,
        portfolio: p.portfolio || a.contact.portfolio, scholar: p.scholar || a.contact.scholar,
        summary: p.summary || a.summary, skillsByCategory: a.skillsByCategory, seniority: a.seniority,
      }));
      setPrefs((pr) => ({
        ...pr,
        targetTitles: a.suggestedTitles.length ? a.suggestedTitles : pr.targetTitles,
        locations: a.suggestedLocations.length ? a.suggestedLocations : pr.locations,
        mustHaves: a.mustHaves.length ? a.mustHaves : pr.mustHaves,
        niceToHaves: a.niceToHaves.length ? a.niceToHaves : pr.niceToHaves,
        dealBreakers: a.dealBreakers.length ? a.dealBreakers : pr.dealBreakers,
      }));
      setAnalyzed(true);
      flash(`Profile populated from ${file.name}.`);
      return true;
    } catch { flash("Analysis failed — try a DOCX or TXT file."); return false; }
    finally { setAnalyzing(false); }
  };

  const selectApplicant = async (entry) => {
    switchApplicant(entry); setShowApplicantPicker(false); setPendingResumeChoice(null);
    if (!dirHandle) return;
    const files = await scanApplicantFiles(dirHandle, entry.folder);
    setApplicantFiles(files);
    const buf = await readTrackerBuffer(dirHandle, entry.trackerFile);
    if (buf) parseTrackerBuffer(buf);
    else flash(`No tracker yet for ${entry.name} — Cowork will create ${entry.trackerFile} on the first sourcing run for this profile.`);
    // Auto-fill profile from profile.md (links + logistics the resume can't give),
    // filling only fields that are currently empty so nothing gets clobbered.
    try {
      const pmdText = await readProfileMd(dirHandle, entry.folder);
      const pm = parseProfileMd(pmdText);
      if (Object.keys(pm).length) {
        setProfile((p) => {
          const merged = { ...p };
          for (const k of Object.keys(pm)) {
            if (!String(merged[k] || "").trim()) merged[k] = pm[k];
          }
          return merged;
        });
      }
    } catch { /* profile.md is optional */ }
    const alreadyAnalyzed = !!load(`jp_profile_${entry.id}`, null);
    if (!alreadyAnalyzed && files.length > 0) {
      const file = await files[0].handle.getFile();
      await analyzeAndApply(file);
    }
  };

  const createApplicant = async (name) => {
    if (!dirHandle) return;
    const { manifest: updated, entry } = await addApplicant(dirHandle, manifest, name);
    setManifest(updated); await selectApplicant(entry);
    flash(`Created profile for ${entry.name}. Upload a resume to get started.`);
  };

  const handleResume = async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return; await analyzeAndApply(file);
  };

  const handleResumeUploadInput = async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file || !dirHandle || !activeApplicant) return;
    try {
      await writeApplicantResume(dirHandle, activeApplicant.folder, file);
      const files = await scanApplicantFiles(dirHandle, activeApplicant.folder);
      setApplicantFiles(files);
      flash(`Saved ${file.name} to ${activeApplicant.name}'s folder.`);
      if (files.length <= 1) { await analyzeAndApply(file); } else { setPendingResumeChoice(file.name); }
    } catch { flash("Could not write to the folder."); }
  };

  const useResumeFromFolder = async (fileEntry) => {
    const file = await fileEntry.handle.getFile();
    await analyzeAndApply(file); setPendingResumeChoice(null);
  };

  const generateProfileMd = () => {
    const md = buildProfileMd({
      ...profile, targetTitles: prefs.targetTitles, locations: prefs.locations,
      workModes: prefs.workModes, mustHaves: prefs.mustHaves, niceToHaves: prefs.niceToHaves,
      dealBreakers: prefs.dealBreakers, scoreThreshold: prefs.scoreThreshold, dailyCap: prefs.dailyCap,
    });
    download("profile.md", md, "text/markdown");
    flash("profile.md generated.");
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.name.endsWith(".json")) {
        const text = await file.text();
        const arr = JSON.parse(text);
        if (Array.isArray(arr)) mergeListings(arr.map(normalizeJson));
      } else { const buf = await file.arrayBuffer(); parseTrackerBuffer(buf); }
    } catch { flash("Import failed — check the file format."); }
    e.target.value = "";
  };

  const mapRow = (r) => ({
    id: r["Job ID"] || `J-${Math.random().toString(36).slice(2, 8)}`,
    dateSourced: r["Date sourced"] || "", source: r["Source"] || "",
    company: r["Company"] || "", role: r["Role"] || "",
    location: r["Location"] || "", workMode: r["Work mode"] || "",
    url: r["Job URL"] || "", score: Number(r["Fit score"]) || 0,
    rationale: r["Score rationale"] || "", status: r["Status"] || "Scored",
    dealBreaker: r["Deal-breaker?"] || "No", notes: r["Missing requirements / notes"] || "",
    resumeFile: r["Resume file"] || "", coverFile: r["Cover letter file"] || "", starred: false,
  });

  const normalizeJson = (r) => ({
    id: r.id || r.jobId || `J-${Math.random().toString(36).slice(2, 8)}`,
    dateSourced: r.dateSourced || "", source: r.source || "",
    company: r.company || "", role: r.role || "", location: r.location || "",
    workMode: r.workMode || "", url: r.url || "", score: Number(r.score) || 0,
    rationale: r.rationale || "", status: r.status || "Scored",
    dealBreaker: r.dealBreaker || "No", notes: r.notes || "",
    resumeFile: r.resumeFile || "", coverFile: r.coverFile || "", starred: !!r.starred,
  });

  const mergeListings = (incoming) => {
    setListings((cur) => {
      const byId = new Map(cur.map((l) => [l.id, l]));
      incoming.forEach((n) => {
        const old = byId.get(n.id);
        byId.set(n.id, old ? { ...n, starred: old.starred, status: old.status !== "Scored" ? old.status : n.status } : n);
      });
      return Array.from(byId.values());
    });
    flash(`Imported ${incoming.length} listing${incoming.length === 1 ? "" : "s"}.`);
  };

  const editListing = (id, patch) => setListings((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeListing = (id) => setListings((cur) => cur.filter((l) => l.id !== id));

  const download = (name, content, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPrefsJson = () => download("preferences.json", JSON.stringify(prefs, null, 2), "application/json");

  const exportShortlist = () => {
    const picks = listings.filter((l) => l.starred || (l.score >= prefs.scoreThreshold && !isDealBreaker(l)));
    if (picks.length === 0) { flash("Nothing to export yet."); return; }
    download("shortlist.json", JSON.stringify(picks, null, 2), "application/json");
  };

  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const findJobFile = (l, kind) => {
    const want = kind === "resume" ? l.resumeFile : l.coverFile;
    if (want) { const exact = jobFiles.find((f) => f.lname === String(want).toLowerCase()); if (exact) return exact; }
    const comp = norm(l.company), role = norm(l.role);
    return jobFiles.find((f) => f.lname.includes(kind) &&
      (norm(f.folder).includes(comp) || norm(f.name).includes(comp) || (role && norm(f.folder).includes(role))));
  };

  const openPreview = async (entry) => {
    try {
      const res = await previewFile(entry.handle);
      if (res.type === "html") setPreview(res);
      else if (res.type === "downloaded") flash("Downloaded.");
    } catch { flash("Couldn't open that file."); }
  };

  const refreshFromFolder = async () => {
    if (!dirHandle || !activeApplicant) return;
    setJobFiles(await scanJobs(dirHandle));
    const buf = await readTrackerBuffer(dirHandle, activeApplicant.trackerFile);
    if (buf) parseTrackerBuffer(buf); else flash("No tracker found in folder for this profile yet.");
  };

  const filtered = useMemo(() => {
    let out = listings
      .filter((l) => !(hideDB && isDealBreaker(l)))
      .filter((l) => Number(l.score) >= minScore)
      .filter((l) => statusFilter === "All" || l.status === statusFilter)
      .filter((l) => (onlyStar ? l.starred : true))
      .filter((l) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (l.company + l.role + l.rationale + l.location).toLowerCase().includes(q);
      });
    out.sort((a, b) => (sortBy === "score" ? b.score - a.score : String(b.dateSourced).localeCompare(String(a.dateSourced))));
    return out;
  }, [listings, search, minScore, statusFilter, hideDB, onlyStar, sortBy]);

  const stats = useMemo(() => {
    const recommended = listings.filter((l) => l.score >= prefs.scoreThreshold && !isDealBreaker(l)).length;
    const avg = listings.length ? Math.round(listings.reduce((s, l) => s + (Number(l.score) || 0), 0) / listings.length) : 0;
    const db = listings.filter(isDealBreaker).length;
    return { total: listings.length, recommended, avg, db };
  }, [listings, prefs.scoreThreshold]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl text-white" style={{ background: ACCENT }}>
              <Briefcase size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight">Job Pilot</h1>
              <p className="text-xs text-slate-500">
                Control panel for your Cowork application pipeline
                {activeApplicant && <> · <span className="font-semibold text-slate-700">{activeApplicant.name}</span></>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user && onLogout && (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                <span className="max-w-[160px] truncate text-xs text-slate-500" title={user.email}>
                  {user.email}
                </span>
                {isAdmin && onAdmin && (
                  <button
                    onClick={onAdmin}
                    className="text-xs font-medium text-indigo-500 hover:text-indigo-700 transition-colors border-l border-slate-300 pl-2"
                    title="Admin panel"
                  >
                    Admin
                  </button>
                )}
                <button
                  onClick={onLogout}
                  className="text-xs font-medium text-slate-400 hover:text-rose-600 transition-colors border-l border-slate-300 pl-2"
                  title="Sign out"
                >
                  Sign out
                </button>
              </div>
            )}
            {dirHandle && activeApplicant && (
              <button onClick={() => setShowApplicantPicker(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
                <Users size={16} /> {activeApplicant.name}
              </button>
            )}
            {FS_OK && (
              dirHandle ? (
                <span className="inline-flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
                  <FolderOpen size={16} /> {folderName}
                  <button onClick={disconnectFolder} className="text-green-600 hover:text-green-900"><X size={14} /></button>
                </span>
              ) : savedHandle ? (
                <button onClick={reconnectFolder} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
                  <Plug size={16} /> Reconnect folder
                </button>
              ) : (
                <button onClick={connectFolder} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white" style={{ background: ACCENT }}>
                  <FolderOpen size={16} /> Connect folder
                </button>
              )
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
              <Upload size={16} /> Import tracker
              <input type="file" accept=".xlsx,.json" onChange={handleFile} className="hidden" />
            </label>
          </div>
        </div>

        <div className="mb-5 flex gap-1 rounded-xl bg-slate-200 p-1">
          {[["setup", "Setup", FileText], ["board", "Job Board", Briefcase]].map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === k ? "bg-white shadow-sm" : "text-slate-500"}`}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {tab === "setup" && (
          <div className="space-y-4">
            {!dirHandle && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-bold text-slate-700">Start from your resume</h3>
                <p className="mb-4 mt-1 text-xs text-slate-500">Upload your resume (PDF, DOCX, or TXT). Job Pilot reads it locally in your browser, then suggests skills, target titles, and filters you can refine.</p>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-8 hover:border-indigo-400 hover:bg-indigo-50">
                  {analyzing ? (
                    <><Loader2 size={26} className="animate-spin text-indigo-500" /><span className="text-sm text-slate-500">Analyzing…</span></>
                  ) : (
                    <><FileUp size={26} className="text-slate-400" /><span className="text-sm font-medium text-slate-600">Click to upload resume</span><span className="text-xs text-slate-400">PDF · DOCX · TXT</span></>
                  )}
                  <input type="file" accept=".pdf,.docx,.txt,.md" onChange={handleResume} className="hidden" />
                </label>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-bold text-slate-700">Resumes in your project folder</h3>
              {!FS_OK ? (
                <p className="mt-1 text-xs text-amber-700">Connecting to your project folder needs Chrome or Edge.</p>
              ) : !dirHandle ? (
                <>
                  <p className="mb-3 mt-1 text-xs text-slate-500">Connect your Cowork project folder to manage resumes per applicant.</p>
                  <div className="flex gap-2">
                    <button onClick={connectFolder} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white" style={{ background: ACCENT }}>
                      <FolderOpen size={16} /> Connect project folder
                    </button>
                    {savedHandle && (
                      <button onClick={reconnectFolder} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">
                        <Plug size={16} /> Reconnect
                      </button>
                    )}
                  </div>
                </>
              ) : !activeApplicant ? (
                <>
                  <p className="mb-3 mt-1 text-xs text-slate-500">Connected to <span className="font-semibold text-slate-700">{folderName}</span>. Pick a profile.</p>
                  <button onClick={() => setShowApplicantPicker(true)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white" style={{ background: ACCENT }}>
                    <Users size={16} /> Choose profile
                  </button>
                </>
              ) : (
                <>
                  <div className="mb-3 mt-1 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">
                      Connected to <span className="font-semibold text-slate-700">{folderName}</span> · profile: <span className="font-semibold text-slate-700">{activeApplicant.name}</span>
                    </p>
                    <button onClick={() => setShowApplicantPicker(true)} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
                      <Users size={13} /> Switch profile
                    </button>
                  </div>
                  {applicantFiles.length === 0 ? (
                    <p className="mb-3 text-sm text-slate-400 italic">No resumes yet for {activeApplicant.name} — upload one below.</p>
                  ) : (
                    <div className="mb-3 space-y-2">
                      {applicantFiles.map((f) => (
                        <div key={f.name} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                          <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700"><FileText size={14} className="shrink-0" /> <span className="truncate">{f.name}</span></span>
                          <div className="flex shrink-0 items-center gap-3">
                            <button onClick={() => openPreview(f)} className="text-xs font-medium text-indigo-600 hover:underline">View</button>
                            <button onClick={() => useResumeFromFolder(f)} className="text-xs font-medium text-emerald-600 hover:underline">Use to populate profile</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {pendingResumeChoice && (
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <span>New resume uploaded: <span className="font-semibold">{pendingResumeChoice}</span>. Use it to populate the profile fields?</span>
                      <div className="flex gap-3">
                        <button onClick={async () => { const f = applicantFiles.find((x) => x.name === pendingResumeChoice); if (f) await useResumeFromFolder(f); }} className="font-semibold text-emerald-700 hover:underline">Yes, use it</button>
                        <button onClick={() => setPendingResumeChoice(null)} className="text-slate-500 hover:underline">Dismiss</button>
                      </div>
                    </div>
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">
                    <FileSignature size={16} /> Upload resume
                    <input type="file" accept=".pdf,.docx,.doc,.txt" onChange={handleResumeUploadInput} className="hidden" />
                  </label>
                  <p className="mt-2 text-xs text-slate-400">Saved into <code className="rounded bg-slate-100 px-1">master/{activeApplicant.folder}/</code>.</p>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700"><Clock size={16} /> Automate sourcing</h3>
              <p className="mt-1 text-xs text-slate-500">In Claude Desktop, type <code className="rounded bg-slate-100 px-1">/schedule</code> to run the source → score → tailor steps on a routine. Then hit <span className="font-semibold">Refresh from folder</span> on the Job Board to pull the latest.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-700"><SlidersHorizontal size={16} /> Job-matching preferences</h3>
              <ChipEditor label="Target titles" items={prefs.targetTitles} onChange={(v) => updatePref("targetTitles", v)} placeholder="e.g. Generative AI Engineer" />
              <ChipEditor label="Target locations" items={prefs.locations} onChange={(v) => updatePref("locations", v)} placeholder="e.g. Remote, Sweden" />
              <ChipEditor label="Work modes" items={prefs.workModes} onChange={(v) => updatePref("workModes", v)} placeholder="Remote / Hybrid / Onsite" />
              <ChipEditor label="Must-haves (skip if missing)" items={prefs.mustHaves} onChange={(v) => updatePref("mustHaves", v)} placeholder="e.g. GenAI focus" />
              <ChipEditor label="Nice-to-haves (boost score)" items={prefs.niceToHaves} onChange={(v) => updatePref("niceToHaves", v)} placeholder="e.g. RAG / GraphRAG" />
              <ChipEditor label="Deal-breakers (auto-reject)" items={prefs.dealBreakers} onChange={(v) => updatePref("dealBreakers", v)} placeholder="e.g. Frontend-only" />
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Score threshold: <span style={{ color: ACCENT }}>{prefs.scoreThreshold}</span></label>
                  <input type="range" min="0" max="100" value={prefs.scoreThreshold} onChange={(e) => updatePref("scoreThreshold", Number(e.target.value))} className="w-full" />
                  <p className="mt-1 text-xs text-slate-500">Only tailor + queue jobs at or above this.</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Daily application cap</label>
                  <input type="number" min="1" max="50" value={prefs.dailyCap} onChange={(e) => updatePref("dailyCap", Number(e.target.value))} className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
                  <p className="mt-1 text-xs text-slate-500">Max prepared per run.</p>
                </div>
              </div>
              <p className="mt-5 border-t border-slate-200 pt-5 text-xs text-slate-500">These preferences are automatically included as Section 9 when you <span className="font-semibold">Generate &amp; download profile.md</span> below.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={exportPrefsJson} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"><Download size={16} /> Export JSON</button>
                <button onClick={() => setPrefs(DEFAULT_PREFS)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"><RotateCcw size={16} /> Reset defaults</button>
              </div>
            </div>

            {analyzed && (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-1 text-sm font-bold text-slate-700">Personal details</h3>
                  <p className="mb-3 text-xs text-slate-500">Auto-filled from your resume where possible.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Full name" value={profile.name} onChange={(v) => updateProfile("name", v)} placeholder="Your name" />
                    <Field label="Email" value={profile.email} onChange={(v) => updateProfile("email", v)} placeholder="you@example.com" />
                    <Field label="Phone" value={profile.phone} onChange={(v) => updateProfile("phone", v)} placeholder="+__ …" />
                    <Field label="Location" value={profile.location} onChange={(v) => updateProfile("location", v)} placeholder="City, Country" />
                    <Field label="LinkedIn" value={profile.linkedin} onChange={(v) => updateProfile("linkedin", v)} placeholder="linkedin.com/in/…" />
                    <Field label="GitHub" value={profile.github} onChange={(v) => updateProfile("github", v)} placeholder="github.com/…" />
                    <Field label="Portfolio" value={profile.portfolio} onChange={(v) => updateProfile("portfolio", v)} placeholder="your-site.com" />
                    <Field label="Google Scholar / ORCID" value={profile.scholar} onChange={(v) => updateProfile("scholar", v)} placeholder="optional" />
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-1 text-sm font-bold text-slate-700">Logistics</h3>
                  <p className="mb-3 text-xs text-slate-500">These aren't on a resume — fill what applies.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Work authorization" value={profile.workAuth} onChange={(v) => updateProfile("workAuth", v)} placeholder="e.g. Indian citizen" />
                    <Field label="Sponsorship needed abroad?" value={profile.sponsorship} onChange={(v) => updateProfile("sponsorship", v)} placeholder="yes / no" />
                    <Field label="Notice period" value={profile.noticePeriod} onChange={(v) => updateProfile("noticePeriod", v)} placeholder="e.g. 2 months" />
                    <Field label="Earliest start date" value={profile.startDate} onChange={(v) => updateProfile("startDate", v)} placeholder="e.g. immediate" />
                    <Field label="Current CTC" value={profile.currentCtc} onChange={(v) => updateProfile("currentCtc", v)} placeholder="optional" />
                    <Field label="Expected CTC" value={profile.expectedCtc} onChange={(v) => updateProfile("expectedCtc", v)} placeholder="optional" />
                    <Field label="Open to relocation" value={profile.relocation} onChange={(v) => updateProfile("relocation", v)} placeholder="yes / no / cities" />
                    <Field label="Preferred work mode" value={profile.workMode} onChange={(v) => updateProfile("workMode", v)} placeholder="remote / hybrid / onsite" />
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-2 text-sm font-bold text-slate-700">Professional summary</h3>
                  <textarea value={profile.summary} onChange={(e) => updateProfile("summary", e.target.value)} rows={4} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-1 text-sm font-bold text-slate-700">Detected skills</h3>
                  <p className="mb-3 text-xs text-slate-500">Pulled from your resume{profile.seniority?.label ? ` · seniority read as ${profile.seniority.label}` : ""}.</p>
                  {Object.keys(profile.skillsByCategory || {}).length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No skills detected — try uploading a DOCX or TXT version.</p>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(profile.skillsByCategory).map(([cat, items]) => (
                        <div key={cat}>
                          <div className="mb-1 text-xs font-semibold text-slate-500">{cat}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {items.map((s) => <span key={s} className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs text-indigo-700">{s}</span>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Suggested target titles, locations, and deal-breakers were applied to the preferences panel above.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-1 text-sm font-bold text-slate-700">Generate profile.md</h3>
                  <p className="mb-3 text-xs text-slate-500">Combines your details, summary, skills, and preferences into the file Cowork reads.</p>
                  <button onClick={generateProfileMd} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: ACCENT }}>
                    <Wand2 size={16} /> Generate &amp; download profile.md
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "board" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Listings" value={stats.total} />
              <StatCard label="Recommended" value={stats.recommended} color={ACCENT} />
              <StatCard label="Avg fit score" value={stats.avg} color={scoreColor(stats.avg)} />
              <StatCard label="Deal-breakers" value={stats.db} color="#dc2626" />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[180px] flex-1">
                  <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, role…" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none" />
                </div>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none">
                  <option>All</option>
                  {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
                </select>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none">
                  <option value="score">Sort: Score</option>
                  <option value="date">Sort: Date</option>
                </select>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <span>Min score</span>
                  <input type="range" min="0" max="100" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
                  <span className="w-7 font-semibold" style={{ color: ACCENT }}>{minScore}</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={hideDB} onChange={(e) => setHideDB(e.target.checked)} /> Hide deal-breakers</label>
                <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={onlyStar} onChange={(e) => setOnlyStar(e.target.checked)} /> Starred only</label>
                <div className="ml-auto flex gap-2">
                  {dirHandle && activeApplicant && (
                    <button onClick={refreshFromFolder} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">
                      <RefreshCw size={16} /> Refresh from folder
                    </button>
                  )}
                  <button onClick={exportShortlist} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">
                    <Download size={16} /> Export shortlist
                  </button>
                </div>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <Briefcase size={32} className="mx-auto mb-3 text-slate-300" />
                <p className="font-medium text-slate-600">{listings.length === 0 ? "No listings yet" : "Nothing matches these filters"}</p>
                <p className="mt-1 text-sm text-slate-400">{listings.length === 0 ? "Import a tracker .xlsx to get started." : "Loosen the filters above."}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((l) => {
                  const db = isDealBreaker(l);
                  const rec = l.score >= prefs.scoreThreshold && !db;
                  const submitted = l.status === "Submitted";
                  const rFile = dirHandle ? findJobFile(l, "resume") : null;
                  const cFile = dirHandle ? findJobFile(l, "cover") : null;
                  const jobText = `${l.rationale} ${l.notes}`;
                  const skillIds = matchSkills(jobText);
                  const existingSkills = matchExistingSkillsForJob(jobText, profile.skillsByCategory);
                  const gapsDone = skillIds.filter((id) => skillState[id]).length;
                  const existingDone = existingSkills.filter((s) => skillState[s.id]).length;
                  const skillsTotal = skillIds.length + existingSkills.length;
                  const skillsReady = skillsTotal > 0 && (gapsDone + existingDone) === skillsTotal;
                  return (
                    <div key={l.id} className={`rounded-2xl border p-4 ${submitted ? "bg-green-50 ring-2 ring-green-400" : "bg-white"}`} style={{ borderColor: submitted ? "#22c55e" : rec ? ACCENT : "#e2e8f0", borderLeftWidth: submitted || rec ? 4 : 1 }}>
                      <div className="flex items-start gap-3">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: scoreColor(l.score) }}>{l.score}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="truncate font-semibold text-slate-900">{l.role}</h3>
                              <p className="flex items-center gap-1 text-sm text-slate-500">
                                <Building2 size={14} /> {l.company}
                                {l.location && <><span className="text-slate-300">·</span><MapPin size={14} /> {l.location}</>}
                              </p>
                            </div>
                            <button onClick={() => editListing(l.id, { starred: !l.starred })}>
                              <Star size={20} className={l.starred ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
                            </button>
                          </div>
                          {l.rationale && <p className="mt-2 text-sm text-slate-600">{l.rationale}</p>}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {submitted && <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"><CheckCircle2 size={12} /> Submitted</span>}
                            {rec && !submitted && <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700"><CheckCircle2 size={12} /> Recommended</span>}
                            {skillsReady && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"><GraduationCap size={12} /> Skills ready</span>}
                            {db && <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700"><AlertTriangle size={12} /> Deal-breaker</span>}
                            {l.workMode && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{l.workMode}</span>}
                            <select value={l.status} onChange={(e) => editListing(l.id, { status: e.target.value })} className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(l.status)} border-0 focus:outline-none`}>
                              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {l.url && <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"><ExternalLink size={12} /> View posting</a>}
                            {rFile && <button onClick={() => openPreview(rFile)} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 hover:bg-sky-100"><Eye size={12} /> Resume</button>}
                            {cFile && <button onClick={() => openPreview(cFile)} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 hover:bg-violet-100"><Eye size={12} /> Cover</button>}
                            {!dirHandle && (l.resumeFile || l.coverFile) && <span className="inline-flex items-center gap-1 text-xs text-slate-400"><FileText size={12} /> {[l.resumeFile, l.coverFile].filter(Boolean).join(", ")}</span>}
                            <button onClick={() => removeListing(l.id)} className="ml-auto text-slate-300 hover:text-rose-500"><Trash2 size={16} /></button>
                          </div>

                          <SkillChecklist skillIds={skillIds} existingSkills={existingSkills} skillState={skillState} onToggle={toggleSkill} />

                          {!db && !TERMINAL_STATUSES.has(l.status) && (
                            applyPanelId === l.id ? (
                              <ApplyPanel
                                listing={l} profile={profile}
                                onConfirm={(fields) => {
                                  editListing(l.id, { status: "Awaiting approval", applyData: fields });
                                  setApplyPanelId(null);
                                  flash(`${l.company} approved — queued for agent application.`);
                                }}
                                onCancel={() => setApplyPanelId(null)}
                              />
                            ) : (
                              <div className="mt-3">
                                <button
                                  onClick={() => setApplyPanelId(l.id)}
                                  className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
                                  style={{ background: l.status === "Awaiting approval" ? "#d97706" : "#16a34a" }}
                                >
                                  {l.status === "Awaiting approval"
                                    ? <><RotateCw size={14} /> Update &amp; Retry</>
                                    : <><Send size={14} /> Approve to Apply</>}
                                </button>
                                {l.status === "Awaiting approval" && (
                                  <span className="ml-3 text-xs text-amber-700">Queued — agent will apply on next run</span>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {showApplicantPicker && (
        <ApplicantModal manifest={manifest} onSelect={selectApplicant} onCreate={createApplicant} onClose={() => setShowApplicantPicker(false)} />
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPreview(null)}>
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700"><FileText size={16} /> {preview.name}</h3>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="prose prose-sm max-w-none overflow-y-auto px-6 py-5 text-sm leading-relaxed text-slate-800" dangerouslySetInnerHTML={{ __html: preview.html }} />
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}
