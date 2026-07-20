import mammoth from "mammoth/mammoth.browser.js";

export const FS_OK = typeof window !== "undefined" && "showDirectoryPicker" in window;

// ---- persist the chosen directory handle in IndexedDB ----
const DB = "jobpilot_fs";
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("handles");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function saveHandle(handle) {
  try {
    const db = await openDB();
    const tx = db.transaction("handles", "readwrite");
    tx.objectStore("handles").put(handle, "dir");
    return new Promise((r) => { tx.oncomplete = () => r(); });
  } catch { /* ignore */ }
}
export async function loadHandle() {
  try {
    const db = await openDB();
    const tx = db.transaction("handles", "readonly");
    return await new Promise((res) => {
      const rq = tx.objectStore("handles").get("dir");
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => res(null);
    });
  } catch { return null; }
}

export async function ensurePermission(handle, mode = "readwrite") {
  if (!handle) return false;
  const opts = { mode };
  try {
    if ((await handle.queryPermission(opts)) === "granted") return true;
    if ((await handle.requestPermission(opts)) === "granted") return true;
  } catch { /* ignore */ }
  return false;
}

export async function pickFolder() {
  return await window.showDirectoryPicker({ mode: "readwrite" });
}

async function getSub(handle, name, create = false) {
  try { return await handle.getDirectoryHandle(name, { create }); } catch { return null; }
}

// ---------------------------------------------------------------------
// Legacy flat master/ helpers (kept for any code path that still wants
// the un-scoped folder; applicant-scoped helpers below are what the app
// actually uses once a folder is connected).
// ---------------------------------------------------------------------
export async function scanMaster(handle) {
  const dir = await getSub(handle, "master");
  if (!dir) return [];
  const out = [];
  for await (const [name, h] of dir.entries()) {
    if (h.kind === "file") out.push({ name, handle: h });
  }
  return out;
}

export async function writeMaster(handle, file, asName) {
  const dir = await getSub(handle, "master", true);
  const name = asName || file.name;
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(file);
  await w.close();
  return name;
}

export async function scanJobs(handle) {
  const dir = await getSub(handle, "jobs");
  const files = [];
  if (!dir) return files;
  for await (const [sub, subH] of dir.entries()) {
    if (subH.kind === "directory") {
      for await (const [fname, fh] of subH.entries()) {
        if (fh.kind === "file") files.push({ folder: sub, name: fname, lname: fname.toLowerCase(), handle: fh });
      }
    } else if (subH.kind === "file") {
      files.push({ folder: "", name: sub, lname: sub.toLowerCase(), handle: subH });
    }
  }
  return files;
}

export async function readTrackerBuffer(handle, filename = "applications_tracker_NEW.xlsx") {
  try {
    const fh = await handle.getFileHandle(filename);
    const file = await fh.getFile();
    return await file.arrayBuffer();
  } catch { return null; }
}

export async function previewFile(fileHandle) {
  const file = await fileHandle.getFile();
  const lname = file.name.toLowerCase();
  if (lname.endsWith(".docx")) {
    const buf = await file.arrayBuffer();
    const { value } = await mammoth.convertToHtml({ arrayBuffer: buf });
    return { type: "html", name: file.name, html: value };
  }
  const url = URL.createObjectURL(file);
  if (lname.endsWith(".pdf")) { window.open(url, "_blank"); return { type: "opened" }; }
  const a = document.createElement("a");
  a.href = url; a.download = file.name; a.click();
  return { type: "downloaded" };
}

// ---------------------------------------------------------------------
// Multi-applicant support.
//
// master/applicants.json holds a manifest: [{ id, name, folder,
// trackerFile, createdAt, legacy? }, ...]. Each applicant's resumes live
// in master/<folder>/, and their job listings live in their own
// <trackerFile> at the project root (so Cowork sourcing runs can keep
// each person's applications separate).
//
// First connect ever: any resume files sitting directly in master/ (the
// old flat layout) are migrated into master/Harshverdhan/ and registered
// as the "Harshverdhan" applicant, pointed at the existing
// applications_tracker_NEW.xlsx so none of your existing 45 tracked jobs
// are lost or renamed.
// ---------------------------------------------------------------------
const MANIFEST_NAME = "applicants.json";
const LEGACY_APPLICANT = {
  id: "harshverdhan",
  name: "Harshverdhan",
  folder: "Harshverdhan",
  trackerFile: "applications_tracker_NEW.xlsx",
};

export const slugify = (s) =>
  String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "applicant";

export async function readManifest(handle) {
  const master = await getSub(handle, "master", true);
  if (!master) return null;
  try {
    const fh = await master.getFileHandle(MANIFEST_NAME);
    const file = await fh.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

export async function writeManifest(handle, manifest) {
  const master = await getSub(handle, "master", true);
  if (!master) return;
  const fh = await master.getFileHandle(MANIFEST_NAME, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(manifest, null, 2));
  await w.close();
}

/**
 * Loads (or bootstraps) the applicant manifest for a connected folder.
 * Safe to call every time a folder is (re)connected.
 */
export async function ensureManifest(handle) {
  const existing = await readManifest(handle);
  if (existing) return existing;

  const master = await getSub(handle, "master", true);
  const legacyFiles = [];
  if (master) {
    for await (const [name, h] of master.entries()) {
      if (h.kind === "file" && name !== MANIFEST_NAME) legacyFiles.push({ name, handle: h });
    }
  }

  let manifest = [];
  if (legacyFiles.length) {
    const sub = await getSub(master, LEGACY_APPLICANT.folder, true);
    for (const f of legacyFiles) {
      try {
        const file = await f.handle.getFile();
        const buf = await file.arrayBuffer();
        const fh = await sub.getFileHandle(f.name, { create: true });
        const w = await fh.createWritable();
        await w.write(buf);
        await w.close();
        await master.removeEntry(f.name);
      } catch { /* best-effort migration; leave file in place if it fails */ }
    }
    manifest = [{ ...LEGACY_APPLICANT, createdAt: new Date().toISOString(), legacy: true }];
  }

  await writeManifest(handle, manifest);
  return manifest;
}

/** Registers a new applicant and creates their master/<folder>/ directory. */
export async function addApplicant(handle, manifest, name) {
  const cleanName = String(name || "").trim() || "Applicant";
  const base = slugify(cleanName);
  const existingIds = new Set(manifest.map((a) => a.id));
  let id = base, n = 2;
  while (existingIds.has(id)) { id = `${base}-${n}`; n += 1; }

  const entry = {
    id,
    name: cleanName,
    folder: cleanName.replace(/[\\/:*?"<>|]/g, "_"),
    trackerFile: `applications_tracker_${base}.xlsx`,
    createdAt: new Date().toISOString(),
  };

  const master = await getSub(handle, "master", true);
  if (master) await getSub(master, entry.folder, true);

  const updated = [...manifest, entry];
  await writeManifest(handle, updated);
  return { manifest: updated, entry };
}

export async function scanApplicantFiles(handle, applicantFolder) {
  const master = await getSub(handle, "master", true);
  if (!master) return [];
  const dir = await getSub(master, applicantFolder, true);
  if (!dir) return [];
  const out = [];
  for await (const [name, h] of dir.entries()) {
    if (h.kind === "file") out.push({ name, handle: h });
  }
  // newest-ish first isn't available without lastModified sorting; sort by name desc as a stable tiebreaker
  const withMeta = await Promise.all(out.map(async (f) => {
    try { const file = await f.handle.getFile(); return { ...f, lastModified: file.lastModified }; }
    catch { return { ...f, lastModified: 0 }; }
  }));
  withMeta.sort((a, b) => b.lastModified - a.lastModified);
  return withMeta;
}

export async function writeApplicantResume(handle, applicantFolder, file, asName) {
  const master = await getSub(handle, "master", true);
  const dir = await getSub(master, applicantFolder, true);
  const name = asName || file.name;
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(file);
  await w.close();
  return name;
}

export async function removeApplicantFile(handle, applicantFolder, name) {
  const master = await getSub(handle, "master", true);
  const dir = await getSub(master, applicantFolder, false);
  if (!dir) return;
  try { await dir.removeEntry(name); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------
// profile.md - the authoritative source of truth for personal details,
// links, and logistics (work auth, sponsorship, notice, CTC, start date,
// relocation, work mode). The resume analyzer only ever recovers name /
// contact / links / skills, so we read profile.md too and use it to
// auto-fill the apply form. Looks for the applicant's own
// master/<folder>/profile.md first, then falls back to the project-root
// profile.md.
// ---------------------------------------------------------------------
export async function readProfileMd(handle, applicantFolder) {
  const tryRead = async (dirHandle, fname) => {
    if (!dirHandle) return "";
    try {
      const fh = await dirHandle.getFileHandle(fname);
      const file = await fh.getFile();
      return await file.text();
    } catch { return ""; }
  };
  if (applicantFolder) {
    const master = await getSub(handle, "master", false);
    const sub = master ? await getSub(master, applicantFolder, false) : null;
    const scoped = await tryRead(sub, "profile.md");
    if (scoped) return scoped;
  }
  return await tryRead(handle, "profile.md");
}

/**
 * Parse a profile.md into a flat object of apply-form fields. Only keys that
 * are actually found are returned, so callers can fill blanks without
 * clobbering anything. Recognises the "- **Label:** value" markdown style.
 */
export function parseProfileMd(text) {
  if (!text) return {};
  const t = text;
  const out = {};
  const firstUrl = (s) => {
    const m = s && s.match(/https?:\/\/[^\s)\]]+/);
    return m ? m[0].replace(/[.,;]+$/, "") : "";
  };
  const lineVal = (re) => {
    const m = t.match(re);
    return m ? m[1].replace(/\*\*/g, "").trim() : "";
  };
  const shortVal = (re) =>
    lineVal(re)
      .replace(/\s+[—–-]\s+.*$/, "")            // drop trailing " — note"
      .replace(/\[(confirm|fill)[^\]]*\]/gi, "") // drop [confirm]/[FILL]
      .replace(/\s*\(confirm\)/gi, "")
      .trim();

  const name = shortVal(/Full name[^\n:]*:\s*([^\n]+)/i); if (name) out.name = name;
  const em = t.match(/Email[^\n:]*:\s*\*{0,2}\s*([^\s*]+@[^\s*]+)/i); if (em) out.email = em[1].replace(/[.,;]+$/, "");
  const ph = t.match(/Phone[^\n:]*:\s*\*{0,2}\s*([+\d][\d \t()-]{6,})/i); if (ph) out.phone = ph[1].trim();
  const loc = shortVal(/Location[^\n:]*:\s*([^\n]+)/i); if (loc) out.location = loc;
  const rel = shortVal(/Open to relocation[^\n:]*:\s*([^\n]+)/i); if (rel) out.relocation = rel;
  const wm = shortVal(/Preferred work mode[^\n:]*:\s*([^\n]+)/i); if (wm) out.workMode = wm;
  const wa = shortVal(/work authorization[^\n:]*:\s*([^\n]+)/i); if (wa) out.workAuth = wa;
  // Sponsorship: these targets are India-based, and the profile states no
  // sponsorship is required for India roles, so answer "No" in that case;
  // otherwise fall back to whatever the Sponsorship line says.
  if (/no sponsorship required/i.test(t)) out.sponsorship = "No";
  else { const sp = shortVal(/Sponsorship[^\n:]*:\s*([^\n]+)/i); if (sp) out.sponsorship = sp; }
  const np = shortVal(/Notice period[^\n:]*:\s*([^\n]+)/i); if (np) out.noticePeriod = np;
  const cc = shortVal(/Current CTC[^\n:]*:\s*([^\n]+)/i); if (cc) out.currentCtc = cc;
  const ec = shortVal(/Expected CTC[^\n:]*:\s*([^\n]+)/i); if (ec) out.expectedCtc = ec;
  const sd = shortVal(/Earliest start date[^\n:]*:\s*([^\n]+)/i); if (sd) out.startDate = sd;
  const li = firstUrl(lineVal(/LinkedIn[^\n:]*:\s*([^\n]+)/i)); if (li) out.linkedin = li;
  const gh = firstUrl(lineVal(/GitHub[^\n:]*:\s*([^\n]+)/i)); if (gh) out.github = gh;
  const pf = firstUrl(lineVal(/Portfolio[^\n:]*:\s*([^\n]+)/i)); if (pf) out.portfolio = pf;
  const sc = firstUrl(lineVal(/(?:Google Scholar|Scholar|ORCID)[^\n:]*:\s*([^\n]+)/i)); if (sc) out.scholar = sc;
  return out;
}
