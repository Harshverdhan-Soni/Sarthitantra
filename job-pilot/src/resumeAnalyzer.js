import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth/mammoth.browser.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// ---------- Text extraction ----------
export async function extractText(file) {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md")) {
    return await file.text();
  }
  if (name.endsWith(".docx")) {
    const buf = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    return res.value || "";
  }
  if (name.endsWith(".pdf")) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + "\n";
    }
    return text;
  }
  // fallback: try plain text
  return await file.text();
}

// ---------- Heuristic analysis ----------
export const TAXONOMY = {
  // ── Tech tracks ──────────────────────────────────────────────────────────────
  "Generative AI & LLMs": ["generative ai", "llm", "large language model", "rag", "graphrag", "graph context pruning", "agentic", "langchain", "llamaindex", "prompt engineering", "mcp", "knowledge graph", "multi-agent", "retrieval-augmented", "retrieval augmented", "fine-tuning", "vector database", "embeddings", "ollama"],
  "ML & AI Research": ["machine learning", "deep learning", "neural network", "gnn", "graph neural", "nlp", "natural language", "computer vision", "pytorch", "tensorflow", "transformer", "xai", "explainable ai", "reinforcement learning", "multimodal", "multilingual"],
  "Programming": ["python", "java", "javascript", "typescript", "c++", "golang", "go lang", "php", "rust", "scala", "kotlin", "embedded c"],
  "Web & Frameworks": ["react", "reactjs", "vue", "angular", "next.js", "node", "spring boot", "django", "flask", "tailwind", "rest api", "graphql", "hibernate"],
  "Data & Databases": ["sql", "postgresql", "mysql", "mongodb", "neo4j", "redis", "firebase", "snowflake", "spark", "hadoop", "kafka", "cypher"],
  "Cloud & DevOps": ["aws", "azure", "gcp", "docker", "kubernetes", "ci/cd", "terraform", "jenkins", "netlify", "git", "linux"],

  // ── Creative / Photography tracks ─────────────────────────────────────────
  "Photography": ["photography", "portrait photography", "landscape photography", "product photography", "fashion photography", "wedding photography", "event photography", "street photography", "studio photography", "photo editing", "photo retouching", "lightroom", "adobe lightroom", "darkroom", "lighting", "studio lighting", "natural light", "composition", "color grading", "raw editing", "drone photography", "aerial photography", "videography", "cinematography", "film photography"],
  "Design & Creative Tools": ["photoshop", "adobe photoshop", "illustrator", "adobe illustrator", "indesign", "adobe indesign", "premiere pro", "after effects", "lightroom", "canva", "figma", "adobe creative suite", "adobe creative cloud", "coreldraw", "procreate", "sketch", "capcut", "davinci resolve", "final cut pro", "blender", "3d modeling", "motion graphics"],
  "Art & Craft": ["painting", "drawing", "sketching", "illustration", "watercolor", "acrylic", "oil painting", "charcoal", "pastel", "printmaking", "ceramics", "sculpture", "textile", "embroidery", "knitting", "crochet", "jewelry making", "handmade", "craft", "paper craft", "origami", "calligraphy", "lettering", "collage", "mixed media", "resin art", "block printing", "batik", "silk painting", "art direction", "visual arts", "fine arts"],
  "Content & Social Media": ["content creation", "social media", "instagram", "youtube", "reels", "shorts", "tiktok", "content strategy", "brand photography", "visual storytelling", "storytelling", "blogging", "vlogging", "influencer", "community management", "audience engagement", "hashtag strategy", "analytics", "seo", "copywriting"],
  "Teaching & Training": ["teaching", "training", "workshop", "coaching", "mentoring", "curriculum", "lesson plan", "online course", "e-learning", "tutoring", "facilitation", "instruction", "education", "pedagogy"],
  "Business & Management": ["project management", "client management", "budgeting", "scheduling", "coordination", "team management", "leadership", "operations", "vendor management", "event management", "freelance", "consulting", "business development", "marketing", "branding", "customer service", "communication", "presentation"],
};

const TITLE_RULES = [
  // Tech
  { any: ["generative ai", "llm", "rag", "graphrag", "agentic", "langchain"], titles: ["Generative AI Engineer", "Applied AI Research Scientist", "AI/ML Engineer"] },
  { any: ["machine learning", "deep learning", "pytorch", "tensorflow", "gnn", "nlp", "multimodal"], titles: ["AI/ML Engineer", "Research Scientist", "Machine Learning Engineer"] },
  { any: ["react", "spring boot", "java", "full stack", "full-stack", "node"], titles: ["Senior Software Engineer", "Full-Stack Engineer"] },
  // Photography & Videography
  { any: ["photography", "photo editing", "lightroom", "portrait photography", "videography", "cinematography"], titles: ["Photographer", "Videographer", "Visual Content Creator"] },
  { any: ["drone photography", "aerial photography"], titles: ["Drone Photographer", "Aerial Videographer"] },
  { any: ["wedding photography", "event photography"], titles: ["Event Photographer", "Wedding Photographer"] },
  { any: ["product photography", "fashion photography"], titles: ["Commercial Photographer", "Product Photographer"] },
  // Design & Creative
  { any: ["photoshop", "illustrator", "adobe creative suite", "graphic design", "canva", "figma"], titles: ["Graphic Designer", "Visual Designer", "Creative Designer"] },
  { any: ["after effects", "premiere pro", "motion graphics", "davinci resolve"], titles: ["Motion Graphics Designer", "Video Editor"] },
  { any: ["art direction", "brand photography", "visual storytelling"], titles: ["Art Director", "Brand Photographer", "Creative Director"] },
  // Art & Craft
  { any: ["painting", "watercolor", "acrylic", "oil painting", "illustration", "drawing"], titles: ["Visual Artist", "Illustrator", "Fine Artist"] },
  { any: ["textile", "embroidery", "knitting", "jewelry making", "ceramics"], titles: ["Craft Artist", "Textile Artist", "Artisan"] },
  { any: ["calligraphy", "lettering"], titles: ["Calligrapher", "Lettering Artist"] },
  // Content
  { any: ["content creation", "social media", "instagram", "reels", "youtube"], titles: ["Content Creator", "Social Media Manager", "Digital Creator"] },
  { any: ["blogging", "vlogging", "copywriting"], titles: ["Content Writer", "Blogger"] },
  // Teaching
  { any: ["teaching", "workshop", "curriculum", "training", "coaching", "tutoring"], titles: ["Trainer", "Workshop Facilitator", "Creative Arts Educator"] },
];

const KNOWN_LOCATIONS = [
  "remote", "sweden", "stockholm", "europe", "germany", "berlin", "netherlands", "amsterdam", "london",
  "uk", "united kingdom", "usa", "united states", "canada", "singapore", "dubai", "uae", "australia",
  "bengaluru", "bangalore", "hyderabad", "pune", "delhi", "new delhi", "mumbai", "chennai", "kolkata",
  "noida", "gurgaon", "gurugram", "chandigarh", "jaipur", "ahmedabad", "kochi", "cochin", "coimbatore",
  "indore", "lucknow", "nagpur", "bhopal", "surat", "patna", "thiruvananthapuram", "vizag", "visakhapatnam",
  "mysore", "mysuru", "nashik", "vadodara", "guwahati", "silchar", "assam", "india",
];

// Same list minus "remote"/generic country-region names — used to guess the
// applicant's own current location (personal details), not just a list of
// acceptable job locations.
const PERSONAL_LOCATION_HINTS = KNOWN_LOCATIONS.filter((l) => !["remote", "europe", "india", "usa", "united states", "uk", "united kingdom"].includes(l));

const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function guessLocation(text) {
  const headerBlock = text.split(/\r?\n/).slice(0, 12).join(" ").toLowerCase();
  const lower = text.toLowerCase();
  const hit = PERSONAL_LOCATION_HINTS.find((loc) => headerBlock.includes(loc)) ||
    PERSONAL_LOCATION_HINTS.find((loc) => lower.includes(loc));
  return hit ? cap(hit) : "";
}

function findContact(text) {
  const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0] || "";
  const phone = (text.match(/(\+?\d[\d \-()]{8,}\d)/) || [])[0] || "";
  const linkedin = (text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s)]+/i) || [])[0] || "";
  const github = (text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s)]+/i) || [])[0] || "";
  const scholar = (text.match(/scholar\.google\.[^\s)]+/i) || [])[0] || "";
  const site = (text.match(/(?:https?:\/\/)?[\w-]+\.(?:netlify\.app|github\.io|vercel\.app|dev|me)[^\s)]*/i) || [])[0] || "";
  return { email, phone, linkedin, github, scholar, portfolio: site };
}

function guessName(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 5)) {
    const words = line.split(/\s+/);
    if (words.length >= 1 && words.length <= 4 && /^[A-Za-z.\s'-]+$/.test(line) && !/@|\d/.test(line)) {
      return line;
    }
  }
  return "";
}

function guessSeniority(text) {
  const phd = /\bph\.?d\b|doctoral/i.test(text);
  const years = [...text.matchAll(/(\d{1,2})\+?\s*years?/gi)].map((m) => Number(m[1]));
  const maxYears = years.length ? Math.max(...years) : 0;
  if (phd) return { label: "Senior / Research-level", years: maxYears };
  if (maxYears >= 8) return { label: "Senior", years: maxYears };
  if (maxYears >= 5) return { label: "Mid–Senior", years: maxYears };
  if (maxYears >= 2) return { label: "Mid-level", years: maxYears };
  return { label: "Entry–Mid", years: maxYears };
}

/**
 * Fallback: extract skills listed under a "Skills" / "Expertise" / "Core Competencies"
 * section when taxonomy matching finds nothing. Reads bullet points and comma-separated
 * lists from the section and returns them as a flat array (max 30 items).
 */
function extractSkillsFromSection(text) {
  const SKILL_HEADERS = [
    "skills", "core skills", "key skills", "technical skills", "professional skills",
    "expertise", "areas of expertise", "competencies", "core competencies",
    "abilities", "proficiencies", "tools & technologies", "tools",
  ];
  for (const header of SKILL_HEADERS) {
    const re = new RegExp(
      `${header}\\s*[:\\-–]?\\s*\\n([\\s\\S]{10,800}?)(?:\\n\\s*\\n|\\n[A-Z][A-Za-z &]{2,35}\\n|\\n[A-Z]{2,}|$)`,
      "i"
    );
    const m = text.match(re);
    if (!m) continue;
    const block = m[1];
    // Split on newlines, bullets, pipes, commas, semicolons
    const items = block
      .split(/[\n,;|•●▪▸►◆\t]+/)
      .map((s) => s.replace(/^[\s\-–*]+/, "").replace(/[\s]+$/, "").trim())
      .filter((s) => s.length >= 2 && s.length <= 60 && /[a-zA-Z]/.test(s));
    if (items.length >= 2) return items.slice(0, 30);
  }
  return [];
}

export function analyzeResume(rawText) {
  const text = rawText || "";
  const lower = text.toLowerCase();

  // skills by category — match against extended taxonomy
  const skillsByCategory = {};
  const allSkills = [];
  for (const [cat, kws] of Object.entries(TAXONOMY)) {
    const hits = [];
    for (const kw of kws) {
      if (lower.includes(kw)) {
        const label = kw.length <= 4 ? kw.toUpperCase() : cap(kw);
        if (!hits.includes(label)) hits.push(label);
        allSkills.push(kw);
      }
    }
    if (hits.length) skillsByCategory[cat] = hits;
  }

  // Fallback: if taxonomy found nothing, extract directly from Skills section
  if (Object.keys(skillsByCategory).length === 0) {
    const extracted = extractSkillsFromSection(text);
    if (extracted.length > 0) {
      skillsByCategory["Skills"] = extracted;
    }
  }

  // titles
  const titleSet = [];
  for (const rule of TITLE_RULES) {
    if (rule.any.some((k) => lower.includes(k))) rule.titles.forEach((t) => { if (!titleSet.includes(t)) titleSet.push(t); });
  }
  if (/\bph\.?d\b|publication|paper|conference|research/i.test(text)) {
    ["Research Scientist", "Postdoctoral Researcher"].forEach((t) => { if (!titleSet.includes(t)) titleSet.push(t); });
  }
  const suggestedTitles = titleSet.slice(0, 6);

  // locations — build from what the resume mentions; always include Remote
  const locSet = ["Remote"];
  const INDIA_CITIES = ["bengaluru", "bangalore", "hyderabad", "pune", "delhi", "new delhi", "mumbai", "chennai", "kolkata", "noida", "gurgaon", "gurugram", "chandigarh", "jaipur", "ahmedabad", "kochi", "cochin", "coimbatore", "indore", "lucknow", "nagpur", "bhopal", "surat", "patna", "thiruvananthapuram", "vizag", "visakhapatnam", "mysore", "mysuru", "nashik", "vadodara", "guwahati", "silchar", "assam"];
  let foundIndia = false;
  for (const loc of KNOWN_LOCATIONS) {
    if (loc === "remote") continue;
    if (lower.includes(loc) && !locSet.map((x) => x.toLowerCase()).includes(loc)) {
      locSet.push(cap(loc));
      if (INDIA_CITIES.includes(loc) || loc === "india") foundIndia = true;
    }
  }
  // If Indian city detected, add "India" as a top-level option too
  if (foundIndia && !locSet.map((x) => x.toLowerCase()).includes("india")) {
    locSet.splice(1, 0, "India");
  }

  const seniority = guessSeniority(text);
  const contact = findContact(text);
  const name = guessName(text);
  const location = guessLocation(text);

  // summary: try multiple section header patterns, then paragraph fallback
  let summary = "";

  // Pattern 1: named section header followed by content
  const SUMMARY_HEADERS = [
    "professional summary", "career summary", "executive summary",
    "summary of qualifications", "professional profile", "career profile",
    "about me", "about", "profile", "objective", "career objective",
    "professional objective", "personal statement", "overview",
  ];
  for (const header of SUMMARY_HEADERS) {
    const re = new RegExp(
      header.replace(/\s+/g, "\\s*") + "\\s*[:\\-–]?\\s*\\n?([\\s\\S]{40,600}?)(?:\\n\\s*\\n|\\n[A-Z][A-Za-z &]{2,35}\\n|\\n[A-Z]{2,}|$)",
      "i"
    );
    const m = text.match(re);
    if (m) { summary = m[1].replace(/\s+/g, " ").trim(); break; }
  }

  // Pattern 2: first substantial paragraph (40–400 chars, starts after name/contact block)
  if (!summary) {
    const paras = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim());
    const substPara = paras.find((p) =>
      p.length >= 60 && p.length <= 600 &&
      !/@|phone|linkedin|github|http|www\.|\.com|\.in/i.test(p) &&
      /[a-zA-Z]{3,}/.test(p)
    );
    if (substPara) summary = substPara;
  }

  // Pattern 3: smart template from what we know
  if (!summary) {
    const detectedName = name ? name.split(" ")[0] : "";
    const topCats = Object.keys(skillsByCategory).slice(0, 2);
    const skillSnippet = topCats.length
      ? topCats.map((c) => (skillsByCategory[c] || []).slice(0, 3).join(", ")).filter(Boolean).join("; ")
      : "";
    const expSnippet = seniority.years >= 1 ? `${seniority.years}+ years of experience` : "";
    const locationSnippet = location ? ` based in ${location}` : "";

    if (skillSnippet || expSnippet) {
      summary = [
        detectedName ? `${detectedName} is a` : "A",
        seniority.label.toLowerCase(),
        "professional",
        locationSnippet,
        expSnippet ? `with ${expSnippet}` : "",
        skillSnippet ? `in ${skillSnippet}` : "",
      ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() + ".";
    } else {
      summary = `Experienced professional with a background in ${topCats[0] || "their field"}. Update this summary in My Profile to match your target roles.`;
    }
  }

  // must-haves / nice-to-haves / deal-breakers — derived from detected skills
  const aiFocused    = !!(skillsByCategory["Generative AI & LLMs"] || skillsByCategory["ML & AI Research"]);
  const webFocused   = !!(skillsByCategory["Web & Frameworks"]);
  const photoFocused = !!(skillsByCategory["Photography"]);
  const artFocused   = !!(skillsByCategory["Art & Craft"]);
  const designFocused = !!(skillsByCategory["Design & Creative Tools"]);
  const contentFocused = !!(skillsByCategory["Content & Social Media"]);
  const teachFocused = !!(skillsByCategory["Teaching & Training"]);

  const mustHaves = [];
  const niceToHaves = [];
  const dealBreakers = [];

  if (aiFocused) {
    mustHaves.push("AI / ML component");
    if (skillsByCategory["Generative AI & LLMs"]) niceToHaves.push("GenAI / LLM scope");
    if (/research|publication|phd/i.test(text)) niceToHaves.push("Research / publication support");
    dealBreakers.push("No AI/ML component");
  } else if (webFocused) {
    mustHaves.push("Software / web development role");
    dealBreakers.push("Non-technical role");
  } else if (photoFocused) {
    mustHaves.push("Photography / visual content role");
    if (designFocused) niceToHaves.push("Photo editing / post-production");
    if (contentFocused) niceToHaves.push("Social media or brand photography");
    dealBreakers.push("No visual / creative component");
  } else if (artFocused || designFocused) {
    mustHaves.push("Creative / design role");
    if (teachFocused) niceToHaves.push("Teaching or workshop component");
    dealBreakers.push("Pure non-creative administrative role");
  } else if (contentFocused) {
    mustHaves.push("Content creation / digital media role");
    dealBreakers.push("No content or media component");
  } else if (teachFocused) {
    mustHaves.push("Teaching / training role");
    dealBreakers.push("No teaching or facilitation component");
  }

  // Common nice-to-have: remote/hybrid
  if (location && !["remote"].includes(location.toLowerCase())) {
    niceToHaves.push("Remote or hybrid option");
  }

  return {
    name, contact, summary, seniority, location,
    skillsByCategory, suggestedTitles,
    suggestedLocations: locSet,
    mustHaves, niceToHaves, dealBreakers,
  };
}

// ---------- profile.md generation ----------
export function buildProfileMd(p) {
  const list = (a) => (a && a.length ? a.join(", ") : "[FILL]");
  const semi = (a) => (a && a.length ? a.join("; ") : "[FILL]");
  const val  = (v, fallback = "[FILL]") => (v && String(v).trim() ? String(v).trim() : fallback);

  // Accept both flat keys (profile state) and nested contact object (raw analyzeResume output)
  const email    = p.email    || p.contact?.email    || "";
  const phone    = p.phone    || p.contact?.phone    || "";
  const linkedin = p.linkedin || p.contact?.linkedin || "";
  const github   = p.github   || p.contact?.github   || "";
  const portfolio= p.portfolio|| p.contact?.portfolio|| "";
  const scholar  = p.scholar  || p.contact?.scholar  || "";

  // Accept both ProfileEditor-schema keys (fullName / professionalSummary)
  // and the Setup-schema keys (name / summary) used by the rest of the app.
  const fullName = p.fullName || p.name || "";
  const summary  = p.professionalSummary || p.summary || "";

  const skillLines = Object.entries(p.skillsByCategory || {})
    .map(([cat, items]) => `- **${cat}:** ${items.join(", ")}`)
    .join("\n") || "- [FILL — add your core skills]";

  return `# Profile — master reference for resume auto-apply

> Generated by Job Pilot from your resume. Fill any remaining \`[FILL]\`
> placeholders and verify the suggested preferences in Section 9.

---

## 1. Personal details

- **Full name:** ${val(fullName)}
- **Email:** ${val(email)}
- **Phone:** ${val(phone, "[FILL — include country code]")}
- **Location:** ${val(p.location)}
- **Open to relocation:** ${val(p.relocation, "[FILL — yes / no / specific cities]")}
- **Preferred work mode:** ${val(p.workMode || p.preferredWorkMode, "[FILL — remote / hybrid / onsite]")}

---

## 2. Work eligibility & logistics

- **Citizenship / work authorization:** ${val(p.workAuth)}
- **Sponsorship needed outside home country:** ${val(p.sponsorship, "[FILL — yes / no]")}
- **Notice period:** ${val(p.noticePeriod)}
- **Current CTC:** ${val(p.currentCtc)}
- **Expected CTC:** ${val(p.expectedCtc)}
- **Earliest start date:** ${val(p.startDate || p.earliestStartDate)}

---

## 3. Professional summary

${summary || "[FILL]"}

---

## 7. Core skills (keyword bank for matching & ATS)

${skillLines}

---

## 8. Links

- **Portfolio:** ${val(portfolio)}
- **LinkedIn:** ${val(linkedin)}
- **GitHub:** ${val(github)}
- **Google Scholar / ORCID:** ${val(scholar)}

---

## 9. Job preferences (matching rules)

- **Target titles:** ${list(p.targetTitles)}
- **Target locations:** ${list(p.locations)}
- **Preferred work modes:** ${list(p.workModes)}
- **Seniority:** ${p.seniority?.label || "[FILL]"}
- **Must-haves (skip if missing):** ${semi(p.mustHaves)}
- **Nice-to-haves (boost score):** ${semi(p.niceToHaves)}
- **Deal-breakers (auto-reject):** ${semi(p.dealBreakers)}
- **Score threshold:** ${p.scoreThreshold ?? 70}/100
- **Daily application cap:** ${p.dailyCap ?? 8}

---

## 10. Tailoring rules (instructions to Claude)

1. Mirror the job description's key terms, but never invent or overstate experience.
2. Keep the tailored resume to one page unless a research/faculty role expects a longer CV.
3. Lead with whichever side fits the role.
4. Cover letters: 3 short paragraphs — why this company, why me, a specific hook.
5. Never include any private or confidential metrics.

---

## 12. Guardrails (always enforce)

- Never submit an application without my explicit approval.
- Never enter passwords, OTPs, bank/card details, or ID numbers into any form.
- Never apply to a deal-breaker role.
- Source jobs only via email alerts and public career pages.
- Log every action to the tracker.
`;
}
