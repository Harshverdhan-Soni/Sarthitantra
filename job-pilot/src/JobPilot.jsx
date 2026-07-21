import { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Briefcase, SlidersHorizontal, Star, Search, Upload, Download,
  MapPin, Building2, Trash2, Plus, X, CheckCircle2, AlertTriangle,
  ExternalLink, RotateCcw, FileText, Wand2, FileUp, Loader2,
  FolderOpen, RefreshCw, Eye, Plug, FileSignature, Clock,
  ChevronDown, ChevronUp, GraduationCap,
  Send, AlertCircle, RotateCw, UserCircle, Layers
} from "lucide-react";
import ProfileEditor from "./ProfileEditor.jsx";
import { extractText, analyzeResume, buildProfileMd } from "./resumeAnalyzer.js";
import {
  FS_OK, pickFolder, ensurePermission, saveHandle, loadHandle,
  scanJobs, readTrackerBuffer, previewFile,
  scanApplicantFiles, writeApplicantResume, removeApplicantFile, writeProfileMd,
} from "./folderAccess.js";
import { matchSkills, SKILLS, matchExistingSkillsForJob } from "./skillsCatalog.js";
import {
  fetchAll, saveCareerProfile, saveSkillState,
  saveListing, syncListings, deleteListing, debounced,
} from "./db.js";

const ACCENT = "#4f46e5";

const DEFAULT_PREFS = {
  targetTitles: [],
  locations: [],
  workModes: [],
  mustHaves: [],
  niceToHaves: [],
  dealBreakers: [],
  scoreThreshold: 70,
  dailyCap: 8,
};

// Values that were hardcoded in older versions — strip them on load so they
// never show up for new users or existing users with stale Supabase data.
const LEGACY_PREF_VALUES = new Set([
  "Relevant to my core skills",
  "Onsite abroad without sponsorship",
  "Frontend-only role",
]);
const cleanPrefs = (p) => {
  if (!p) return p;
  const strip = (arr) => (arr || []).filter((v) => !LEGACY_PREF_VALUES.has(v));
  return {
    ...p,
    targetTitles: strip(p.targetTitles),
    mustHaves:    strip(p.mustHaves),
    niceToHaves:  strip(p.niceToHaves),
    dealBreakers: strip(p.dealBreakers),
  };
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

function ApplyPanel({ listing, profile, onConfirm, onCancel }) {
  // Resolve each field from saved applyData first, then from profile — handling
  // both the cloud schema (fullName, openToRelocation, preferredWorkMode,
  // earliestStartDate, sponsorshipNeeded) and the local analysis schema (name,
  // relocation, workMode, startDate, sponsorship).
  const resolveField = (key) => {
    const saved = listing.applyData?.[key];
    if (saved !== undefined && saved !== null && String(saved).trim() !== "") return saved;
    const p = profile;
    switch (key) {
      case "name":
        return p.fullName || p.name || "";
      case "relocation":
        return p.openToRelocation != null
          ? (p.openToRelocation ? "Yes" : "No")
          : (p.relocation || "");
      case "workMode":
        return p.preferredWorkMode || p.workMode || "";
      case "startDate":
        return p.earliestStartDate || p.startDate || "";
      case "sponsorship":
        return p.sponsorshipNeeded != null
          ? (p.sponsorshipNeeded ? "Yes — sponsorship required" : "No sponsorship required")
          : (p.sponsorship || "");
      default:
        return (p[key] !== undefined && p[key] !== null) ? String(p[key]) : "";
    }
  };
  const initial = {};
  APPLY_FIELDS.forEach(({ key }) => { initial[key] = resolveField(key); });
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

export default function JobPilot({ user, onLogout, isAdmin, onAdmin, activeProfile = "Main", onProfileSwitch }) {
  const [tab, setTab] = useState("setup");
  // Namespace = userId + profileName so each career track is isolated
  const ns0 = `${user?.id ?? "local"}_${activeProfile}`;
  const [namespace, setNamespace] = useState(ns0);
  const [prefs, setPrefs] = useState(() => ({ ...DEFAULT_PREFS, ...load(`jp_prefs_${ns0}`, {}) }));
  const [listings, setListings] = useState(() => load(`jp_listings_${ns0}`, []));
  const [profile, setProfile] = useState(() => ({ ...DEFAULT_PROFILE, ...load(`jp_profile_${ns0}`, {}) }));
  const [skillState, setSkillState] = useState(() => load(`jp_skills_${ns0}`, {}));
  const [cloudSynced, setCloudSynced] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  // Generation counter — incremented on every track switch AND after analyzeAndApply.
  // The fetchAll callback checks this before writing state; if it changed mid-flight
  // (because the user ran analyzeAndApply), the stale fetch result is discarded.
  const fetchGen = useRef(0);
  const [analyzed, setAnalyzed] = useState(() => !!load("jp_profile_local", null));
  const [dirHandle, setDirHandle] = useState(null);
  const [folderName, setFolderName] = useState("");
  const [jobFiles, setJobFiles] = useState([]);
  const [savedHandle, setSavedHandle] = useState(null);
  const [preview, setPreview] = useState(null);
  const [folderFiles, setFolderFiles] = useState([]); // resumes in connected folder
  const [justAnalyzedFile, setJustAnalyzedFile] = useState(null); // tracks which file was just re-analyzed (shows green "Analyzed")
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
    if (user && cloudSynced) debounced("prefs", () =>
      saveCareerProfile(user.id, activeProfile, profile, prefs));
  }, [prefs, namespace]);

  useEffect(() => {
    save(`jp_listings_${namespace}`, listings);
    if (user && cloudSynced) debounced("listings", () =>
      syncListings(user.id, listings, activeProfile));
  }, [listings, namespace]);

  useEffect(() => {
    save(`jp_profile_${namespace}`, profile);
    if (user && cloudSynced) debounced("profile", () =>
      saveCareerProfile(user.id, activeProfile, profile, prefs));
  }, [profile, namespace]);

  useEffect(() => {
    save(`jp_skills_${namespace}`, skillState);
    if (user && cloudSynced) debounced("skills", () => saveSkillState(user.id, skillState));
  }, [skillState, namespace]);

  // ── On login or profile switch: fetch cloud data and merge ──────────────────
  useEffect(() => {
    if (!user) return;
    const newNs = `${user.id}_${activeProfile}`;
    setNamespace(newNs);
    // Load local cache for this profile immediately (strip any legacy hardcoded values)
    setPrefs({ ...DEFAULT_PREFS, ...cleanPrefs(load(`jp_prefs_${newNs}`, {})) });
    setListings(load(`jp_listings_${newNs}`, []));
    setProfile({ ...DEFAULT_PROFILE, ...load(`jp_profile_${newNs}`, {}) });
    setSkillState(load(`jp_skills_${newNs}`, {}));
    setAnalyzed(!!load(`jp_profile_${newNs}`, null));
    setCloudSynced(false);
    // Stamp the current generation — if analyzeAndApply runs while this fetch is
    // in-flight, it will increment fetchGen.current and the callback below will
    // discard its (now stale) results instead of overwriting the fresh analysis.
    const gen = ++fetchGen.current;
    // Then fetch from Supabase (cloud wins, unless a manual analysis ran mid-flight)
    fetchAll(user.id, activeProfile).then(async ({ profile: cp, prefs: cpr, listings: cl, skillState: cs }) => {
      // Discard if analyzeAndApply ran after this fetch started
      if (gen !== fetchGen.current) return;

      // Always overwrite local state with cloud — empty cloud data means a blank new track, not a fetch failure.
      // This ensures switching tracks never shows the previous track's data.
      const mergedProfile = { ...DEFAULT_PROFILE, ...(cp || {}) };
      setProfile(mergedProfile);
      save(`jp_profile_${newNs}`, mergedProfile);
      // Mark analyzed only when real skill/personal data exists for this track
      const hasRealData = cp && (cp.skillsByCategory || cp.fullName || cp.name);
      setAnalyzed(!!hasRealData);

      const cleaned = cleanPrefs(cpr || {});
      setPrefs({ ...DEFAULT_PREFS, ...cleaned });
      save(`jp_prefs_${newNs}`, cleaned);

      if (cl && cl.length > 0) { setListings(cl); save(`jp_listings_${newNs}`, cl); }
      if (cs)  { setSkillState(cs); save(`jp_skills_${newNs}`, cs); }
      setCloudSynced(true);

      // Auto-analyze cloud resume if profile has one but fields aren't populated yet
      const hasResume = mergedProfile?.masterResumeUrl;
      const missingSkills = !mergedProfile?.skillsByCategory || Object.keys(mergedProfile.skillsByCategory || {}).length === 0;
      const alreadyAnalyzed = !!load(`jp_profile_${newNs}`, null);
      if (hasResume && missingSkills && !alreadyAnalyzed) {
        try {
          const resp = await fetch(mergedProfile.masterResumeUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            const ext = (mergedProfile.masterResumeName || "resume.pdf").split(".").pop();
            const file = new File([blob], `resume.${ext}`, { type: blob.type });
            await analyzeAndApply(file);
          }
        } catch { /* silent — resume auto-analysis is best-effort */ }
      }
    });
  }, [user?.id, activeProfile]);

  useEffect(() => { if (FS_OK) loadHandle().then((h) => { if (h) setSavedHandle(h); }); }, []);

  // Re-scan folder resumes whenever the active career track changes
  useEffect(() => {
    if (!dirHandle) return;
    setFolderFiles([]);
    setPendingResumeChoice(null);
    scanApplicantFiles(dirHandle, activeProfile)
      .then(setFolderFiles)
      .catch(() => setFolderFiles([]));
  }, [activeProfile, dirHandle]); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };
  const updatePref = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));
  const updateProfile = (k, v) => setProfile((p) => ({ ...p, [k]: v }));
  const toggleSkill = (id) => setSkillState((s) => ({ ...s, [id]: !s[id] }));


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
    // Scan for resumes in master/<activeProfile>/ (or master/ root for legacy)
    try {
      const files = await scanApplicantFiles(h, activeProfile);
      setFolderFiles(files);
    } catch { setFolderFiles([]); }
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
    setFolderFiles([]); setPendingResumeChoice(null);
  };

  const analyzeAndApply = async (file) => {
    setAnalyzing(true);
    try {
      const text = await extractText(file);
      const isPdf = file.name?.toLowerCase().endsWith(".pdf");
      if (!text || text.trim().length < 50) {
        if (isPdf) flash("This PDF appears to be a scanned image — no text could be extracted. Please upload a DOCX or TXT version for automatic field population.");
        else flash("Couldn't read much text — try a DOCX or TXT version.");
        return false;
      }
      const a = analyzeResume(text);
      setProfile((p) => ({
        ...p,
        name: p.name || a.name, email: p.email || a.contact.email,
        phone: p.phone || a.contact.phone, location: p.location || a.location,
        linkedin: p.linkedin || a.contact.linkedin, github: p.github || a.contact.github,
        portfolio: p.portfolio || a.contact.portfolio, scholar: p.scholar || a.contact.scholar,
        summary: p.summary || a.summary, skillsByCategory: a.skillsByCategory, seniority: a.seniority,
      }));
      // Always replace all analyzer-driven pref arrays — never merge with stale saved values
      setPrefs((pr) => ({
        ...pr,
        targetTitles: a.suggestedTitles,
        locations: a.suggestedLocations,
        mustHaves: a.mustHaves,
        niceToHaves: a.niceToHaves,
        dealBreakers: a.dealBreakers,
      }));
      setAnalyzed(true);
      // Cancel any in-flight fetchAll so it doesn't overwrite this fresh analysis
      fetchGen.current++;
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
    if (!file || !dirHandle) return;
    try {
      await writeApplicantResume(dirHandle, activeProfile, file);
      const files = await scanApplicantFiles(dirHandle, activeProfile);
      setFolderFiles(files);
      flash(`Saved ${file.name} to ${activeProfile} folder.`);
      if (files.length <= 1) { await analyzeAndApply(file); } else { setPendingResumeChoice(file.name); }
    } catch { flash("Could not write to the folder."); }
  };

  const useResumeFromFolder = async (fileEntry) => {
    const file = await fileEntry.handle.getFile();
    const ok = await analyzeAndApply(file);
    setPendingResumeChoice(null);
    if (ok) {
      // Flash the "Analyzed" state on this file's Re-analyze button for 3 s
      setJustAnalyzedFile(fileEntry.name);
      setTimeout(() => setJustAnalyzedFile(null), 3000);
    }
  };

  const removeResumeFromFolder = async (fileEntry) => {
    if (!window.confirm(`Remove "${fileEntry.name}" from your folder? This deletes the file.`)) return;
    await removeApplicantFile(dirHandle, activeProfile, fileEntry.name);
    const updated = await scanApplicantFiles(dirHandle, activeProfile);
    setFolderFiles(updated);
    if (pendingResumeChoice === fileEntry.name) setPendingResumeChoice(null);
    flash(`Removed ${fileEntry.name}.`);
  };

  const generateProfileMd = async () => {
    // Build a normalised object that covers BOTH the Setup-schema keys (name, summary,
    // workMode, startDate …) AND the ProfileEditor-schema keys (fullName, professionalSummary,
    // preferredWorkMode, earliestStartDate …).  buildProfileMd accepts either set.
    const md = buildProfileMd({
      ...profile,
      // Prefer the explicitly-saved ProfileEditor values; fall back to Setup-schema equivalents
      fullName:    profile.fullName    || profile.name || "",
      email:       profile.email       || user?.email  || "",
      phone:       profile.phone       || "",
      linkedin:    profile.linkedin    || "",
      github:      profile.github      || "",
      portfolio:   profile.portfolio   || "",
      scholar:     profile.scholar     || "",
      summary:     profile.professionalSummary || profile.summary || "",
      workMode:    profile.preferredWorkMode   || profile.workMode  || "",
      startDate:   profile.earliestStartDate   || profile.startDate || "",
      // Prefs
      targetTitles: prefs.targetTitles, locations: prefs.locations,
      workModes: prefs.workModes, mustHaves: prefs.mustHaves, niceToHaves: prefs.niceToHaves,
      dealBreakers: prefs.dealBreakers, scoreThreshold: prefs.scoreThreshold, dailyCap: prefs.dailyCap,
    });
    if (dirHandle) {
      // Write directly to the connected folder (e.g. profile.md or profile_photography.md)
      try {
        const fname = await writeProfileMd(dirHandle, activeProfile, md);
        flash(`✓ ${fname} updated in your project folder.`);
      } catch (e) {
        flash("Could not write to folder — downloading instead.");
        const safeName = activeProfile.toLowerCase().replace(/\s+/g, "_");
        const fname = activeProfile === "Main" ? "profile.md" : `profile_${safeName}.md`;
        download(fname, md, "text/markdown");
      }
    } else {
      // No folder connected — fall back to browser download
      const safeName = activeProfile.toLowerCase().replace(/\s+/g, "_");
      const fname = activeProfile === "Main" ? "profile.md" : `profile_${safeName}.md`;
      download(fname, md, "text/markdown");
      flash(`${fname} downloaded.`);
    }
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

  const mapRow = (r) => {
    // Support both the new tracker format ("Score", "Work Mode", "Notes") and
    // the legacy format ("Fit score", "Work mode", "Missing requirements / notes")
    // so the web app works with whichever version is in the connected folder.
    const col = (...keys) => { for (const k of keys) { if (r[k] !== undefined && r[k] !== "") return r[k]; } return ""; };
    const rawUrl = col("Job URL", "URL", "Apply URL", "Apply Link");
    return {
      id:          col("Job ID", "JobID", "ID") || `J-${Math.random().toString(36).slice(2, 8)}`,
      dateSourced: col("Date sourced", "Date Sourced", "Sourced Date"),
      source:      col("Source"),
      company:     col("Company"),
      role:        col("Role", "Title", "Job Title"),
      location:    col("Location"),
      workMode:    col("Work Mode", "Work mode", "WorkMode", "Mode"),
      url:         rawUrl.startsWith("http") ? rawUrl : rawUrl ? `https://${rawUrl}` : "",
      score:       Number(col("Score", "Fit score", "Fit Score", "fit_score")) || 0,
      rationale:   col("Score rationale", "Rationale", "Score Rationale"),
      status:      col("Status") || "Scored",
      dealBreaker: col("Deal-breaker?", "Deal Breaker", "DealBreaker") || "No",
      notes:       col("Notes", "Missing requirements / notes", "Missing Requirements"),
      resumeFile:  col("Resume file", "Resume File"),
      coverFile:   col("Cover letter file", "Cover Letter File"),
      starred:     false,
    };
  };

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
    if (!dirHandle) return;
    setJobFiles(await scanJobs(dirHandle));
    // Try tracker named after the active profile
    const trackerFile = `applications_tracker_${activeProfile.toLowerCase().replace(/\s+/g, "-")}.xlsx`;
    const buf = await readTrackerBuffer(dirHandle, trackerFile)
      ?? await readTrackerBuffer(dirHandle, "applications_tracker_NEW.xlsx")
      ?? await readTrackerBuffer(dirHandle, "applications_tracker.xlsx");
    if (buf) parseTrackerBuffer(buf); else flash("No tracker found in folder for this track yet.");
    // Refresh resume list
    try { setFolderFiles(await scanApplicantFiles(dirHandle, activeProfile)); } catch {}
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
            <img src="/logo-icon.svg" alt="" aria-hidden="true" className="h-11 w-11 flex-shrink-0 rounded-xl" />
            <div>
              <div className="flex items-baseline gap-1 leading-none">
                <span className="text-xl font-bold tracking-tight text-indigo-900">Sarthi</span>
                <span className="text-base font-light tracking-[0.18em] text-violet-600">tantra</span>
              </div>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400 tracking-wide uppercase">
                AI career navigator
                {activeProfile !== "Main" && <> · <span className="normal-case font-semibold text-indigo-600">{activeProfile}</span></>}
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
          {[["setup", "Setup", FileText], ["board", "Job Board", Briefcase], ["profile", "My Profile", UserCircle]].map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === k ? "bg-white shadow-sm" : "text-slate-500"}`}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {tab === "setup" && (
          <div className="space-y-4">

            {/* ── Track context banner ─────────────────────────────────────── */}
            {(() => {
              const isMain = activeProfile === "Main";
              const trackColor = isMain ? "indigo" : "violet";
              const bgClass   = isMain ? "bg-indigo-600" : "bg-violet-600";
              const badgeBg   = isMain ? "bg-indigo-500" : "bg-violet-500";
              return (
                <div className={`rounded-2xl ${bgClass} px-5 py-4 flex items-center justify-between`}>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full ${badgeBg} px-3 py-1 text-xs font-bold text-white tracking-wide uppercase`}>
                      {activeProfile}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {analyzed ? "Profile ready" : "Track not set up yet"}
                      </p>
                      <p className="text-xs text-white/70">
                        {analyzed
                          ? "Preferences and skills are populated for this track."
                          : "Upload a resume below to auto-fill your profile and preferences."}
                      </p>
                    </div>
                  </div>
                  {analyzed ? (
                    <CheckCircle2 size={22} className="shrink-0 text-white/80" />
                  ) : (
                    <AlertCircle size={22} className="shrink-0 text-white/60" />
                  )}
                </div>
              );
            })()}

            {/* ── Not-set-up full CTA (shown only when track has no profile) ── */}
            {!analyzed && !analyzing && (
              <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 text-center">
                <FileUp size={32} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700 mb-1">
                  No profile for <span className="text-indigo-600">{activeProfile}</span> track yet
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  Upload a resume and Job Pilot will automatically populate your skills, titles, locations, and preferences for this track.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  {/* Cloud resume if available */}
                  {profile.masterResumeName && profile.masterResumeUrl && (
                    <button
                      onClick={async () => {
                        try {
                          const resp = await fetch(profile.masterResumeUrl);
                          if (!resp.ok) throw new Error("fetch failed");
                          const blob = await resp.blob();
                          const ext = profile.masterResumeName.split(".").pop();
                          const file = new File([blob], profile.masterResumeName, { type: blob.type });
                          await analyzeAndApply(file);
                        } catch (e) { flash("Could not load cloud resume: " + e.message); }
                      }}
                      disabled={analyzing}
                      className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: ACCENT }}
                    >
                      <Wand2 size={15} /> Use "{profile.masterResumeName}"
                    </button>
                  )}
                  {/* Folder resume if connected and files exist */}
                  {dirHandle && folderFiles.length > 0 && folderFiles.map((f) => (
                    <button
                      key={f.name}
                      onClick={() => useResumeFromFolder(f)}
                      disabled={analyzing}
                      className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: ACCENT }}
                    >
                      <Wand2 size={15} /> Use "{f.name}"
                    </button>
                  ))}
                  {/* Upload new */}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-50">
                    <FileUp size={15} /> Upload resume
                    <input type="file" accept=".pdf,.docx,.txt,.md" onChange={handleResume} className="hidden" />
                  </label>
                </div>
                <p className="mt-3 text-xs text-slate-400">DOCX or TXT recommended · PDF supported</p>
              </div>
            )}
            {!analyzed && analyzing && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 flex items-center justify-center gap-3">
                <Loader2 size={20} className="animate-spin text-indigo-500" />
                <p className="text-sm text-slate-600">Analyzing resume…</p>
              </div>
            )}

            {!dirHandle && analyzed && profile.masterResumeName && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-bold text-slate-700">Resume on file</h3>
                <div className="mt-2 flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={16} className="shrink-0 text-indigo-500" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{profile.masterResumeName}</p>
                      <p className="text-xs text-slate-500">Master resume · saved to cloud</p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!profile.masterResumeUrl) { flash("Resume URL not available — try uploading again in My Profile."); return; }
                      try {
                        const resp = await fetch(profile.masterResumeUrl);
                        if (!resp.ok) throw new Error("Could not fetch resume");
                        const blob = await resp.blob();
                        const ext = profile.masterResumeName.split(".").pop();
                        const file = new File([blob], profile.masterResumeName, { type: blob.type });
                        await analyzeAndApply(file);
                      } catch (e) { flash("Could not load cloud resume: " + e.message); }
                    }}
                    disabled={analyzing}
                    className="ml-3 shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    style={{ background: ACCENT }}
                  >
                    {analyzing ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
                    {analyzing ? "Analyzing…" : "Re-analyze"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Using a different resume for this track?{" "}
                  <label className="cursor-pointer font-medium text-indigo-600 hover:underline">
                    Upload another
                    <input type="file" accept=".pdf,.docx,.txt,.md" onChange={handleResume} className="hidden" />
                  </label>
                  {" "}· DOCX gives the best extraction.
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-bold text-slate-700">Resumes in your project folder</h3>
              {!FS_OK ? (
                <p className="mt-1 text-xs text-amber-700">Connecting to your project folder needs Chrome or Edge.</p>
              ) : !dirHandle ? (
                <>
                  <p className="mb-3 mt-1 text-xs text-slate-500">Connect your Cowork project folder to manage local resumes.</p>
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
              ) : (
                <>
                  <div className="mb-3 mt-1 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">
                      Connected to <span className="font-semibold text-slate-700">{folderName}</span> · track: <span className="font-semibold text-indigo-600">{activeProfile}</span>
                    </p>
                  </div>
                  {folderFiles.length === 0 ? (
                    <p className="mb-3 text-sm text-slate-400 italic">No resumes in this track's folder yet — upload one below.</p>
                  ) : (
                    <div className="mb-3 space-y-2">
                      {folderFiles.map((f) => {
                        const isPdf = f.name.toLowerCase().endsWith(".pdf");
                        return (
                          <div key={f.name} className="rounded-lg border border-slate-200 px-3 py-2">
                            <div className="flex items-center justify-between">
                              <div className="flex min-w-0 flex-col">
                                <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
                                  <FileText size={14} className="shrink-0" />
                                  <span className="truncate">{f.name}</span>
                                </span>
                                {isPdf && <span className="mt-0.5 text-[10px] text-amber-600">PDF: text-based PDFs work best — upload DOCX for guaranteed extraction</span>}
                              </div>
                              <div className="flex shrink-0 items-center gap-3 ml-3">
                                <button onClick={() => openPreview(f)} className="text-xs font-medium text-indigo-600 hover:underline">View</button>
                                {analyzed && (
                                  justAnalyzedFile === f.name ? (
                                    <span className="text-xs font-medium text-emerald-600">✓ Analyzed</span>
                                  ) : (
                                    <button
                                      onClick={() => useResumeFromFolder(f)}
                                      disabled={analyzing}
                                      className="text-xs font-medium text-amber-600 hover:underline disabled:opacity-40"
                                    >
                                      {analyzing ? "Analyzing…" : "Re-analyze"}
                                    </button>
                                  )
                                )}
                                <button onClick={() => removeResumeFromFolder(f)} className="text-xs font-medium text-rose-500 hover:underline">Remove</button>
                              </div>
                            </div>
                            {/* Primary CTA when not yet analyzed */}
                            {!analyzed && (
                              <button
                                onClick={() => useResumeFromFolder(f)}
                                disabled={analyzing}
                                className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50"
                                style={{ background: ACCENT }}
                              >
                                {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                {analyzing ? "Analyzing…" : "Use to populate profile"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {pendingResumeChoice && (
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <span>New resume uploaded: <span className="font-semibold">{pendingResumeChoice}</span>. Use it to populate the profile fields?</span>
                      <div className="flex gap-3">
                        <button onClick={async () => { const f = folderFiles.find((x) => x.name === pendingResumeChoice); if (f) await useResumeFromFolder(f); }} className="font-semibold text-emerald-700 hover:underline">Yes, use it</button>
                        <button onClick={() => setPendingResumeChoice(null)} className="text-slate-500 hover:underline">Dismiss</button>
                      </div>
                    </div>
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">
                    <FileSignature size={16} /> Upload resume
                    <input type="file" accept=".pdf,.docx,.doc,.txt" onChange={handleResumeUploadInput} className="hidden" />
                  </label>
                  <p className="mt-2 text-xs text-slate-400">Saved into <code className="rounded bg-slate-100 px-1">master/{activeProfile}/</code>.</p>
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
              <p className="mt-5 border-t border-slate-200 pt-5 text-xs text-slate-500">These preferences are included in Section 9 when you click <span className="font-semibold">Update profile.md</span> below.</p>
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
                  <h3 className="mb-1 text-sm font-bold text-slate-700">
                    {activeProfile === "Main" ? "Update profile.md" : `Update profile_${activeProfile.toLowerCase().replace(/\s+/g, "_")}.md`}
                  </h3>
                  <p className="mb-3 text-xs text-slate-500">
                    Writes your current Setup changes — skills, preferences, personal details — directly to the{" "}
                    <code className="rounded bg-slate-100 px-1">
                      {activeProfile === "Main" ? "profile.md" : `profile_${activeProfile.toLowerCase().replace(/\s+/g, "_")}.md`}
                    </code>{" "}
                    file in your connected folder so Cowork picks them up immediately.
                    {!dirHandle && " Connect your project folder above to write directly; otherwise the file will be downloaded."}
                  </p>
                  <button onClick={generateProfileMd} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: ACCENT }}>
                    {dirHandle ? <RefreshCw size={16} /> : <Download size={16} />}
                    {dirHandle
                      ? `Update ${activeProfile === "Main" ? "profile.md" : `profile_${activeProfile.toLowerCase().replace(/\s+/g, "_")}.md`}`
                      : "Download profile.md"}
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
                  {dirHandle && (
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
                            {l.url && <a href={l.url.startsWith("http") ? l.url : `https://${l.url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"><ExternalLink size={12} /> View posting</a>}
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

        {tab === "profile" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <ProfileEditor
              user={user}
              activeProfile={activeProfile}
              onProfileSwitch={onProfileSwitch}
              profile={(() => {
                // Map JobPilot's internal profile + prefs shapes to the ProfileEditor schema.
                // Cloud data (career_profiles.data) is merged into `profile` state by fetchAll,
                // so ProfileEditor-schema fields (fullName, education, masterResumeUrl, etc.)
                // live alongside Setup-schema fields (name, summary, skillsByCategory).
                // We prefer the ProfileEditor-schema value when set, falling back to the
                // Setup-schema equivalent so freshly-analyzed resumes still populate the form.
                return {
                  onboardingComplete: true,
                  fullName:       profile.fullName || profile.name || "",
                  email:          profile.email || user?.email || "",
                  phone:          profile.phone || "",
                  location:       profile.location || "",
                  openToRelocation: profile.openToRelocation ?? (profile.relocation?.toLowerCase().startsWith("y") ?? true),
                  relocationNotes:  profile.relocationNotes || profile.relocation || "",
                  preferredWorkMode: profile.preferredWorkMode || profile.workMode || "Remote",
                  workAuth:         profile.workAuth || "",
                  sponsorshipNeeded: profile.sponsorshipNeeded ?? !!profile.sponsorship,
                  noticePeriod:     profile.noticePeriod || "",
                  currentCtc:       profile.currentCtc || "",
                  expectedCtc:      profile.expectedCtc || "",
                  earliestStartDate: profile.earliestStartDate || profile.startDate || "",
                  currentlyEmployed: profile.currentlyEmployed ?? true,
                  currentTitle:     profile.currentTitle || "",
                  currentOrg:       profile.currentOrg || "",
                  professionalSummary: profile.professionalSummary || profile.summary || "",
                  skillsGenAI:  (profile.skillsGenAI ?? profile.skillsByCategory?.["Generative AI & LLMs"] ?? []),
                  skillsML:     (profile.skillsML ?? profile.skillsByCategory?.["ML & AI Research"] ?? []),
                  skillsDev:    (profile.skillsDev ?? profile.skillsByCategory?.["Development & Databases"] ?? []),
                  skillsDomains:(profile.skillsDomains ?? profile.skillsByCategory?.["Domains & Other"] ?? []),
                  portfolio:    profile.portfolio || "",
                  linkedin:     profile.linkedin || "",
                  github:       profile.github || "",
                  youtube:      profile.youtube || "",
                  scholar:      profile.scholar || "",
                  targetTitles:     prefs.targetTitles || [],
                  targetLocations:  prefs.locations || [],
                  mustHaves:        prefs.mustHaves || [],
                  niceToHaves:      prefs.niceToHaves || [],
                  dealBreakers:     prefs.dealBreakers || [],
                  scoreThreshold:   prefs.scoreThreshold ?? 70,
                  dailyCap:         prefs.dailyCap ?? 8,
                  masterResumeUrl:  profile.masterResumeUrl || "",
                  masterResumeName: profile.masterResumeName || "",
                  education:        profile.education || "",
                  currentRoleHighlights: profile.currentRoleHighlights || "",
                  research:         profile.research || "",
                  standardAnswers:  profile.standardAnswers || "",
                };
              })()}
              onSave={(updated) => {
                // Write back into internal profile state — keep BOTH schema variants
                // in sync so the mapping above always has the right values regardless
                // of whether the user last came through setup/analysis (Setup-schema)
                // or edited directly in My Profile (ProfileEditor-schema).
                setProfile((p) => ({
                  ...p,
                  // Setup-schema mirrors (for profile.md generation & apply form)
                  name:         updated.fullName,
                  email:        updated.email,
                  phone:        updated.phone,
                  location:     updated.location,
                  relocation:   updated.openToRelocation ? `Yes — ${updated.relocationNotes || "open to relocation"}` : "No",
                  workMode:     updated.preferredWorkMode,
                  workAuth:     updated.workAuth,
                  sponsorship:  updated.sponsorshipNeeded ? "Yes — requires visa/work-permit sponsorship" : "No",
                  noticePeriod: updated.noticePeriod,
                  currentCtc:   updated.currentCtc,
                  expectedCtc:  updated.expectedCtc,
                  startDate:    updated.earliestStartDate,
                  summary:      updated.professionalSummary,
                  linkedin:     updated.linkedin,
                  github:       updated.github,
                  portfolio:    updated.portfolio,
                  scholar:      updated.scholar,
                  skillsByCategory: {
                    "Generative AI & LLMs": updated.skillsGenAI,
                    "ML & AI Research":     updated.skillsML,
                    "Development & Databases": updated.skillsDev,
                    "Domains & Other":      updated.skillsDomains,
                  },
                  // ProfileEditor-schema (pass-through so they survive re-render)
                  fullName:          updated.fullName,
                  openToRelocation:  updated.openToRelocation,
                  relocationNotes:   updated.relocationNotes,
                  preferredWorkMode: updated.preferredWorkMode,
                  sponsorshipNeeded: updated.sponsorshipNeeded,
                  earliestStartDate: updated.earliestStartDate,
                  currentlyEmployed: updated.currentlyEmployed,
                  currentTitle:      updated.currentTitle,
                  currentOrg:        updated.currentOrg,
                  professionalSummary: updated.professionalSummary,
                  skillsGenAI:  updated.skillsGenAI,
                  skillsML:     updated.skillsML,
                  skillsDev:    updated.skillsDev,
                  skillsDomains: updated.skillsDomains,
                  youtube:           updated.youtube,
                  masterResumeUrl:   updated.masterResumeUrl,
                  masterResumeName:  updated.masterResumeName,
                  education:         updated.education,
                  currentRoleHighlights: updated.currentRoleHighlights,
                  research:          updated.research,
                  standardAnswers:   updated.standardAnswers,
                }));
                setPrefs((prev) => ({
                  ...prev,
                  targetTitles:   updated.targetTitles,
                  locations:      updated.targetLocations,
                  mustHaves:      updated.mustHaves,
                  niceToHaves:    updated.niceToHaves,
                  dealBreakers:   updated.dealBreakers,
                  scoreThreshold: updated.scoreThreshold,
                  dailyCap:       updated.dailyCap,
                }));
              }}
            />
          </div>
        )}
      </div>

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
