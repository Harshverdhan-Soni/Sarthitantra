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
  "Generative AI & LLMs": ["generative ai", "llm", "large language model", "rag", "graphrag", "graph context pruning", "agentic", "langchain", "llamaindex", "prompt engineering", "mcp", "knowledge graph", "multi-agent", "retrieval-augmented", "retrieval augmented", "fine-tuning", "vector database", "embeddings", "ollama"],
  "ML & AI Research": ["machine learning", "deep learning", "neural network", "gnn", "graph neural", "nlp", "natural language", "computer vision", "pytorch", "tensorflow", "transformer", "xai", "explainable ai", "reinforcement learning", "multimodal", "multilingual"],
  "Programming": ["python", "java", "javascript", "typescript", "c++", "golang", "go lang", "php", "rust", "scala", "kotlin", "embedded c"],
  "Web & Frameworks": ["react", "reactjs", "vue", "angular", "next.js", "node", "spring boot", "django", "flask", "tailwind", "rest api", "graphql", "hibernate"],
  "Data & Databases": ["sql", "postgresql", "mysql", "mongodb", "neo4j", "redis", "firebase", "snowflake", "spark", "hadoop", "kafka", "cypher"],
  "Cloud & DevOps": ["aws", "azure", "gcp", "docker", "kubernetes", "ci/cd", "terraform", "jenkins", "netlify", "git", "linux"],
};

const TITLE_RULES = [
  { any: ["generative ai", "llm", "rag", "graphrag", "agentic", "langchain"], titles: ["Generative AI Engineer", "Applied AI Research Scientist", "AI/ML Engineer"] },
  { any: ["machine learning", "deep learning", "pytorch", "tensorflow", "gnn", "nlp", "multimodal"], titles: ["AI/ML Engineer", "Research Scientist", "Machine Learning Engineer"] },
  { any: ["react", "spring boot", "java", "full stack", "full-stack", "node"], titles: ["Senior Software Engineer", "Full-Stack Engineer"] },
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

export function analyzeResume(rawText) {
  const text = rawText || "";
  const lower = text.toLowerCase();

  // skills by category
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

  // titles
  const titleSet = [];
  for (const rule of TITLE_RULES) {
    if (rule.any.some((k) => lower.includes(k))) rule.titles.forEach((t) => { if (!titleSet.includes(t)) titleSet.push(t); });
  }
  if (/\bph\.?d\b|publication|paper|conference|research/i.test(text)) {
    ["Research Scientist", "Postdoctoral Researcher"].forEach((t) => { if (!titleSet.includes(t)) titleSet.push(t); });
  }
  const suggestedTitles = titleSet.slice(0, 6);

  // locations
  const locSet = ["Remote"];
  for (const loc of KNOWN_LOCATIONS) {
    if (loc !== "remote" && lower.includes(loc) && !locSet.map((x) => x.toLowerCase()).includes(loc)) {
      locSet.push(cap(loc));
    }
  }

  const seniority = guessSeniority(text);
  const contact = findContact(text);
  const name = guessName(text);
  const location = guessLocation(text);

  // summary: pull a summary/about section if present, else compose
  let summary = "";
  const secMatch = text.match(/(?:professional\s+summary|summary|about\s+me|profile|objective)\s*[:\n]([\s\S]{40,500}?)(?:\n\s*\n|\n[A-Z][A-Za-z ]{2,30}\n)/i);
  if (secMatch) summary = secMatch[1].replace(/\s+/g, " ").trim();
  if (!summary) {
    const topCats = Object.keys(skillsByCategory).slice(0, 2).join(" and ");
    summary = `Professional with demonstrated experience in ${topCats || "technology"}. ${seniority.years ? seniority.years + "+ years of experience. " : ""}[Edit this summary to match your target roles.]`;
  }

  // must-haves / deal-breakers suggestions
  const aiFocused = !!(skillsByCategory["Generative AI & LLMs"] || skillsByCategory["ML & AI Research"]);
  const mustHaves = aiFocused ? ["AI / ML focus"] : ["Relevant to my core skills"];
  const niceToHaves = [];
  if (skillsByCategory["Generative AI & LLMs"]) niceToHaves.push("RAG / GraphRAG / agentic AI scope");
  if (/research|publication|phd/i.test(text)) niceToHaves.push("Research / publication support");
  const dealBreakers = aiFocused ? ["No AI/ML component"] : [];

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
  const skillLines = Object.entries(p.skillsByCategory || {})
    .map(([cat, items]) => `- **${cat}:** ${items.join(", ")}`)
    .join("\n") || "- [FILL — add your core skills]";

  return `# Profile — master reference for resume auto-apply

> Generated by Job Pilot from your resume. Fill any remaining \`[FILL]\`
> placeholders and verify the suggested preferences in Section 9.

---

## 1. Personal details

- **Full name:** ${p.name || "[FILL]"}
- **Email:** ${p.contact?.email || "[FILL]"}
- **Phone:** ${p.contact?.phone || "[FILL — include country code]"}
- **Location:** ${p.location || "[FILL]"}
- **Open to relocation:** ${p.relocation || "[FILL — yes / no / specific cities]"}
- **Preferred work mode:** ${p.workMode || "[FILL — remote / hybrid / onsite]"}

---

## 2. Work eligibility & logistics

- **Citizenship / work authorization:** ${p.workAuth || "[FILL]"}
- **Sponsorship needed outside home country:** ${p.sponsorship || "[FILL — yes / no]"}
- **Notice period:** ${p.noticePeriod || "[FILL]"}
- **Current CTC:** ${p.currentCtc || "[FILL]"}
- **Expected CTC:** ${p.expectedCtc || "[FILL]"}
- **Earliest start date:** ${p.startDate || "[FILL]"}

---

## 3. Professional summary

${p.summary || "[FILL]"}

---

## 7. Core skills (keyword bank for matching & ATS)

${skillLines}

---

## 8. Links

- **Portfolio:** ${p.contact?.portfolio || "[FILL]"}
- **LinkedIn:** ${p.contact?.linkedin || "[FILL]"}
- **GitHub:** ${p.contact?.github || "[FILL]"}
- **Google Scholar / ORCID:** ${p.contact?.scholar || "[FILL]"}

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
