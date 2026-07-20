// Skill-gap catalog + keyword matching, ported 1:1 from
// scripts/generate_skills_tracker.py (SKILLS + RULES) so job cards inside
// Job Pilot can show the same "what to learn for this job" checklist inline,
// with no separate HTML page needed. Keep this in sync with the Python
// version if either is edited.

export const SKILLS = {
  lora_qlora: {
    title: "LLM fine-tuning (LoRA / QLoRA / PEFT)",
    why: "Parameter-efficient fine-tuning is the standard way teams adapt open-weight LLMs to a domain without full retraining. Several JDs list this explicitly.",
    time: "1-2 weekends (hands-on)",
    resources: [
      { label: "Hugging Face PEFT docs", url: "https://huggingface.co/docs/peft/en/index" },
      { label: "DeepLearning.AI — Finetuning Large Language Models", url: "https://www.deeplearning.ai/short-courses/finetuning-large-language-models/" },
    ],
  },
  post_training: {
    title: "Post-training methods (SFT, DPO, RLHF, GRPO)",
    why: "Increasingly asked for in applied-AI-research roles building agentic/instruction-tuned systems, e.g. Tether, PlexTrac.",
    time: "1-2 weeks (concepts + a small hands-on run)",
    resources: [
      { label: "Hugging Face TRL docs (SFT/DPO trainers)", url: "https://huggingface.co/docs/trl/en/index" },
      { label: "DeepLearning.AI — RLHF", url: "https://www.deeplearning.ai/short-courses/reinforcement-learning-from-human-feedback/" },
    ],
  },
  distributed_training: {
    title: "Distributed training (FSDP, DeepSpeed, Accelerate)",
    why: "Research-heavy roles (Tether, Featherless AI distillation role) expect multi-GPU training experience beyond single-node fine-tuning.",
    time: "1-2 weeks",
    resources: [
      { label: "PyTorch FSDP tutorial", url: "https://pytorch.org/tutorials/intermediate/FSDP_tutorial.html" },
      { label: "DeepSpeed — Getting Started", url: "https://www.deepspeed.ai/getting-started/" },
      { label: "Hugging Face Accelerate docs", url: "https://huggingface.co/docs/accelerate/en/index" },
    ],
  },
  dspy_prompt_opt: {
    title: "Prompt-optimization frameworks (DSPy or similar)",
    why: "PlexTrac and similar roles ask for systematic prompt optimization rather than manual iteration.",
    time: "2-3 days",
    resources: [{ label: "DSPy documentation", url: "https://dspy.ai/" }],
  },
  azure_ai: {
    title: "Azure AI stack (Azure OpenAI, AI Search, Prompt Flow)",
    why: "NorthBay (Azure AI Specialist) and Xenon7 list Azure as the core cloud platform; your production experience is on-premise/Docker-Kubernetes instead.",
    time: "1 week (fundamentals) + hands-on lab",
    resources: [
      { label: "Microsoft Learn — AI on Azure", url: "https://learn.microsoft.com/en-us/training/paths/get-started-with-artificial-intelligence-on-azure/" },
      { label: "Azure AI Search documentation", url: "https://learn.microsoft.com/en-us/azure/search/" },
    ],
  },
  aws_cloud: {
    title: "AWS AI stack (SageMaker, Bedrock)",
    why: "AHEAD, Sia Partners, and Xenon7 all expect hands-on AWS ownership (SageMaker/Bedrock) for production AI systems.",
    time: "1 week (fundamentals) + hands-on lab",
    resources: [
      { label: "AWS SageMaker — Getting Started", url: "https://aws.amazon.com/sagemaker/getting-started/" },
      { label: "Amazon Bedrock documentation", url: "https://docs.aws.amazon.com/bedrock/" },
    ],
  },
  vector_db_alt: {
    title: "Alternate vector databases (Pinecone, Weaviate, Faiss)",
    why: "Your RAG work is Neo4j-based; SS&C and similar JDs specifically name Pinecone/Weaviate/Faiss.",
    time: "2-3 days",
    resources: [
      { label: "Pinecone Learning Center", url: "https://www.pinecone.io/learn/" },
      { label: "Weaviate Academy", url: "https://weaviate.io/developers/academy" },
    ],
  },
  asr_speech: {
    title: "Speech / ASR (Whisper, Wav2Vec, ESPnet)",
    why: "Wadhwani AI (ASR) and Sun King both need production speech-model experience, which is not currently in your project history.",
    time: "2-3 weeks (a real specialization, not a quick add-on)",
    resources: [
      { label: "Hugging Face Audio Course", url: "https://huggingface.co/learn/audio-course" },
      { label: "OpenAI Whisper (GitHub)", url: "https://github.com/openai/whisper" },
    ],
  },
  computer_vision: {
    title: "Computer vision (detection/segmentation, YOLO)",
    why: "Sun King's role pairs speech work with production CV (YOLO, detection/segmentation).",
    time: "2-3 weeks",
    resources: [{ label: "Hugging Face Computer Vision Course", url: "https://huggingface.co/learn/computer-vision-course" }],
  },
  jax_rl: {
    title: "JAX & reinforcement learning",
    why: "Google DeepMind's AQUA role is RL/JAX-first — a deep specialization gap from your GenAI/RAG background.",
    time: "3-4 weeks (substantial)",
    resources: [
      { label: "JAX documentation", url: "https://jax.readthedocs.io/" },
      { label: "Hugging Face Deep RL Course", url: "https://huggingface.co/learn/deep-rl-course" },
    ],
  },
  gan_vae: {
    title: "GANs & VAEs (generative modeling beyond LLMs)",
    why: "Nagarro's Principal ML role lists GAN/VAE as a nice-to-have alongside RAG.",
    time: "2 weeks",
    resources: [{ label: "DeepLearning.AI — GANs Specialization", url: "https://www.deeplearning.ai/courses/generative-adversarial-networks-gans-specialization/" }],
  },
  mlops_platforms: {
    title: "MLOps platforms (MLflow, Kubeflow)",
    why: "Several ML-engineering JDs (Nagarro, Uvation) name MLflow/Kubeflow specifically; you have Docker/Kubernetes but not these ML-specific orchestration layers.",
    time: "3-5 days",
    resources: [
      { label: "MLflow documentation", url: "https://mlflow.org/docs/latest/index.html" },
      { label: "Kubeflow documentation", url: "https://www.kubeflow.org/docs/" },
    ],
  },
  terraform_iac: {
    title: "Infrastructure-as-Code (Terraform)",
    why: "Sia Partners leans on Terraform/IaC for cloud-native microservices ownership.",
    time: "3-5 days",
    resources: [{ label: "Terraform — Get Started tutorials", url: "https://developer.hashicorp.com/terraform/tutorials" }],
  },
  databricks: {
    title: "Databricks",
    why: "ONE (OnePay) names Databricks as part of its data/ML stack.",
    time: "2-3 days",
    resources: [{ label: "Databricks Academy (free courses)", url: "https://www.databricks.com/learn/training/home" }],
  },
  distillation: {
    title: "Model distillation & compression (teacher-student pipelines)",
    why: "Featherless AI's distillation role is a specialised research area not covered by your current RAG/agentic-AI project history.",
    time: "1-2 weeks",
    resources: [{ label: "\"Distilling the Knowledge in a Neural Network\" (Hinton et al.)", url: "https://arxiv.org/abs/1503.02531" }],
  },
  fintech_domain: {
    title: "Fintech domain literacy (fraud, payments, claims)",
    why: "OnePay, Luma Financial, and Cotiviti all sit in fintech/payments/claims — a domain step away from your healthcare/e-governance background.",
    time: "1 week (self-study, domain vocabulary + case studies)",
    resources: [{ label: "Coursera — Fintech: Foundations & Applications", url: "https://www.coursera.org/learn/fintech-foundations" }],
  },
  csharp_dotnet: {
    title: "C# / .NET",
    why: "Built In's role has a C#/.NET component alongside the agentic-AI work.",
    time: "1 week (fundamentals, if coming from Java background)",
    resources: [{ label: "Microsoft Learn — C# first steps", url: "https://learn.microsoft.com/en-us/training/paths/csharp-first-steps/" }],
  },
  top_tier_pubs: {
    title: "Top-tier publication venues (NeurIPS/ICML/ICLR/ACL/EMNLP)",
    why: "Featherless AI and Tether expect these venues specifically; GCON 2026 (IEEE) is respected but a different tier.",
    time: "Ongoing — plan around your next paper cycle",
    resources: [
      { label: "ACL Anthology (browse target venues/CFPs)", url: "https://aclanthology.org/" },
      { label: "NeurIPS conference site", url: "https://nips.cc/" },
    ],
  },
  orchestration_frameworks: {
    title: "Agent-orchestration frameworks (AutoGPT, Semantic Kernel)",
    why: "NorthBay's Generative AI Lead role names these by name alongside LangChain/CrewAI, which your SAHAYAK-AI architecture already covers conceptually.",
    time: "2-3 days (framework-specific syntax, concepts already known)",
    resources: [
      { label: "Microsoft Semantic Kernel docs", url: "https://learn.microsoft.com/en-us/semantic-kernel/overview/" },
      { label: "AutoGPT (GitHub)", url: "https://github.com/Significant-Gravitas/AutoGPT" },
    ],
  },
  extreme_scale_systems: {
    title: "Extreme-scale/low-latency system design",
    why: "HighLevel's JD operates at billions of API hits/day across 250+ microservices — a different scale tier from national-government-scale delivery.",
    time: "1-2 weeks reading + case studies",
    resources: [{ label: "System Design Primer (GitHub)", url: "https://github.com/donnemartin/system-design-primer" }],
  },
  classical_ml: {
    title: "Classical ML (regression, clustering, time-series)",
    why: "Uvation and Fusemachines lean on classical ML/statistical modeling more than GenAI.",
    time: "1-2 weeks (refresher)",
    resources: [{ label: "Coursera — Machine Learning Specialization", url: "https://www.coursera.org/specializations/machine-learning-introduction" }],
  },
  security_data: {
    title: "Security telemetry (SIEM, network/endpoint logs)",
    why: "PlexTrac's product is cybersecurity-specific; no direct experience with SIEM/network-telemetry data per your profile.",
    time: "3-5 days (conceptual familiarity, enough to speak to it in an interview)",
    resources: [{ label: "MITRE ATT&CK framework overview", url: "https://attack.mitre.org/" }],
  },
  clinical_imaging: {
    title: "Clinical imaging research (PET/CT, MRI, nuclear medicine)",
    why: "Requires a PhD specifically in medical-imaging research with publications in clinical-imaging venues — a multi-year specialization, not a course you can add quickly. Only pursue this if you're genuinely interested in pivoting your PhD focus.",
    time: "Not realistically closeable short-term",
    resources: [],
  },
  review_jd: {
    title: "Re-read the full live JD & tune resume emphasis",
    why: "No specific hard skill gap was flagged during scoring for this role beyond fit/seniority considerations — the main lever here is making sure the tailored resume's emphasis still matches the live posting before you apply.",
    time: "15-20 minutes",
    resources: [],
  },
};

// [regex, skillId] — matched against "rationale + notes" text (case-insensitive)
export const RULES = [
  [/\bC#\/\.NET\b|\bC#\b/, "csharp_dotnet"],
  [/ACL\/EMNLP|NeurIPS\/ICML|NeurIPS|ICML|ICLR|top-tier ML conference|top-tier NLP/, "top_tier_pubs"],
  [/crypto|fintech domain|fraud, payments|payment\/claims|claims-specific fintech/, "fintech_domain"],
  [/[Dd]istributed (GPU )?training at scale|[Dd]istributed[- ]training/, "distributed_training"],
  [/\bRL\b|\bJAX\b/, "jax_rl"],
  [/AutoGPT|Semantic Kernel/, "orchestration_frameworks"],
  [/Azure[- ]specific|Azure AI Search|Prompt Flow|Azure OpenAI|AWS[/,]\s?(GCP[/,]\s?)?Azure|AWS\/Azure ownership/, "azure_ai"],
  [/[Dd]istillation|teacher-student|model compression/, "distillation"],
  [/ASR|speech recognition|Wav2Vec|Whisper/, "asr_speech"],
  [/computer vision|YOLO|CV\b/, "computer_vision"],
  [/Databricks/, "databricks"],
  [/Pinecone|Weaviate|Faiss/, "vector_db_alt"],
  [/AWS SageMaker|NVIDIA DGX|SageMaker|Bedrock|AWS[/,]\s?(GCP[/,]\s?)?Azure|AWS\/Azure ownership/, "aws_cloud"],
  [/GAN\/VAE|GAN\b|VAE\b/, "gan_vae"],
  [/MLflow|Kubeflow/, "mlops_platforms"],
  [/EdTech|K-12/, "review_jd"],
  [/Terraform|IaC\b/, "terraform_iac"],
  [/billions of API hits|250\+ microservices|extreme scale|low-latency engineering/, "extreme_scale_systems"],
  [/SIEM|network-telemetry|network telemetry|security data/, "security_data"],
  [/medical imaging|clinical-imaging|PET\/CT|MRI|PSMA-PET|SPECT|nuclear-medicine/, "clinical_imaging"],
  [/classical.{0,20}ML|[Tt]raditional ML|regression\/clustering|tabular\/time-series|classical statistics/, "classical_ml"],
  [/LoRA|QLoRA|fine-tuning LLMs/, "lora_qlora"],
  [/SFT, DPO, RLHF|DPO\/RLHF|post-training/, "post_training"],
  [/DSPy/, "dspy_prompt_opt"],
];

/**
 * Returns the list of skill ids required for a job, based on its
 * rationale + missing-requirements text. Falls back to ["review_jd"]
 * when nothing specific was flagged.
 */
export function matchSkills(text) {
  const t = String(text || "");
  const matched = [];
  for (const [re, id] of RULES) {
    if (re.test(t) && !matched.includes(id)) matched.push(id);
  }
  return matched.length ? matched : ["review_jd"];
}

// ---------------------------------------------------------------------
// "Already on your resume" — free refresher resources for skills the
// applicant's resume already claims, so the job checklist can show them
// too: check the box confidently, or brush up first from a good free
// source before applying. Keyed by the same lowercase keywords used in
// resumeAnalyzer.js's TAXONOMY. Anything not explicitly curated below
// falls back to a generic search link so nothing is ever missing one.
// ---------------------------------------------------------------------
export const RESUME_SKILL_RESOURCES = {
  "generative ai": { label: "DeepLearning.AI — Generative AI with LLMs", url: "https://www.deeplearning.ai/courses/generative-ai-with-llms/" },
  "llm": { label: "DeepLearning.AI — LLM short courses", url: "https://www.deeplearning.ai/short-courses/" },
  "large language model": { label: "DeepLearning.AI — LLM short courses", url: "https://www.deeplearning.ai/short-courses/" },
  "rag": { label: "DeepLearning.AI — Building Apps with Vector DBs", url: "https://www.deeplearning.ai/short-courses/building-applications-vector-databases/" },
  "graphrag": { label: "Microsoft GraphRAG docs", url: "https://microsoft.github.io/graphrag/" },
  "agentic": { label: "DeepLearning.AI — Agentic AI courses", url: "https://www.deeplearning.ai/courses/" },
  "langchain": { label: "LangChain documentation", url: "https://python.langchain.com/docs/introduction/" },
  "llamaindex": { label: "LlamaIndex documentation", url: "https://docs.llamaindex.ai/" },
  "prompt engineering": { label: "DeepLearning.AI — ChatGPT Prompt Engineering", url: "https://www.deeplearning.ai/short-courses/chatgpt-prompt-engineering-for-developers/" },
  "mcp": { label: "Model Context Protocol docs", url: "https://modelcontextprotocol.io/introduction" },
  "knowledge graph": { label: "Neo4j — Graph Academy", url: "https://graphacademy.neo4j.com/" },
  "multi-agent": { label: "DeepLearning.AI — Multi AI Agent Systems", url: "https://www.deeplearning.ai/short-courses/multi-ai-agent-systems-with-crewai/" },
  "retrieval-augmented": { label: "DeepLearning.AI — Building Apps with Vector DBs", url: "https://www.deeplearning.ai/short-courses/building-applications-vector-databases/" },
  "retrieval augmented": { label: "DeepLearning.AI — Building Apps with Vector DBs", url: "https://www.deeplearning.ai/short-courses/building-applications-vector-databases/" },
  "fine-tuning": { label: "Hugging Face PEFT docs", url: "https://huggingface.co/docs/peft/en/index" },
  "vector database": { label: "Pinecone Learning Center", url: "https://www.pinecone.io/learn/" },
  "embeddings": { label: "Hugging Face — Embeddings guide", url: "https://huggingface.co/blog/getting-started-with-embeddings" },
  "ollama": { label: "Ollama documentation", url: "https://github.com/ollama/ollama/blob/main/README.md" },
  "machine learning": { label: "Coursera — Machine Learning Specialization", url: "https://www.coursera.org/specializations/machine-learning-introduction" },
  "deep learning": { label: "DeepLearning.AI — Deep Learning Specialization", url: "https://www.deeplearning.ai/courses/deep-learning-specialization/" },
  "neural network": { label: "3Blue1Brown — Neural Networks", url: "https://www.3blue1brown.com/topics/neural-networks" },
  "gnn": { label: "Stanford CS224W — Graph ML", url: "https://web.stanford.edu/class/cs224w/" },
  "graph neural": { label: "Stanford CS224W — Graph ML", url: "https://web.stanford.edu/class/cs224w/" },
  "nlp": { label: "Hugging Face NLP Course", url: "https://huggingface.co/learn/nlp-course" },
  "natural language": { label: "Hugging Face NLP Course", url: "https://huggingface.co/learn/nlp-course" },
  "computer vision": { label: "Hugging Face Computer Vision Course", url: "https://huggingface.co/learn/computer-vision-course" },
  "pytorch": { label: "PyTorch official tutorials", url: "https://pytorch.org/tutorials/" },
  "tensorflow": { label: "TensorFlow official tutorials", url: "https://www.tensorflow.org/tutorials" },
  "transformer": { label: "Hugging Face — The Transformer, explained", url: "https://huggingface.co/learn/nlp-course/chapter1/4" },
  "xai": { label: "Christoph Molnar — Interpretable ML book (free)", url: "https://christophm.github.io/interpretable-ml-book/" },
  "explainable ai": { label: "Christoph Molnar — Interpretable ML book (free)", url: "https://christophm.github.io/interpretable-ml-book/" },
  "reinforcement learning": { label: "Hugging Face Deep RL Course", url: "https://huggingface.co/learn/deep-rl-course" },
  "multimodal": { label: "Hugging Face — Multimodal models", url: "https://huggingface.co/learn/computer-vision-course/unit4/multimodal-models/tasks-models-part1" },
  "multilingual": { label: "Hugging Face NLP Course", url: "https://huggingface.co/learn/nlp-course" },
  "python": { label: "Python official tutorial", url: "https://docs.python.org/3/tutorial/" },
  "java": { label: "dev.java — Learn Java", url: "https://dev.java/learn/" },
  "javascript": { label: "MDN — JavaScript guide", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide" },
  "typescript": { label: "TypeScript Handbook", url: "https://www.typescriptlang.org/docs/handbook/intro.html" },
  "c++": { label: "learncpp.com", url: "https://www.learncpp.com/" },
  "golang": { label: "A Tour of Go", url: "https://go.dev/tour/welcome/1" },
  "go lang": { label: "A Tour of Go", url: "https://go.dev/tour/welcome/1" },
  "php": { label: "PHP: The Right Way", url: "https://phptherightway.com/" },
  "rust": { label: "The Rust Book (free)", url: "https://doc.rust-lang.org/book/" },
  "scala": { label: "Scala documentation", url: "https://docs.scala-lang.org/" },
  "kotlin": { label: "Kotlin official docs", url: "https://kotlinlang.org/docs/getting-started.html" },
  "react": { label: "React official docs", url: "https://react.dev/learn" },
  "reactjs": { label: "React official docs", url: "https://react.dev/learn" },
  "vue": { label: "Vue.js guide", url: "https://vuejs.org/guide/introduction.html" },
  "angular": { label: "Angular official docs", url: "https://angular.dev/overview" },
  "next.js": { label: "Next.js documentation", url: "https://nextjs.org/docs" },
  "node": { label: "Node.js official docs", url: "https://nodejs.org/en/learn" },
  "spring boot": { label: "Spring Boot reference docs", url: "https://docs.spring.io/spring-boot/index.html" },
  "django": { label: "Django official tutorial", url: "https://docs.djangoproject.com/en/stable/intro/tutorial01/" },
  "flask": { label: "Flask official docs", url: "https://flask.palletsprojects.com/" },
  "tailwind": { label: "Tailwind CSS docs", url: "https://tailwindcss.com/docs" },
  "rest api": { label: "MDN — HTTP & REST basics", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP" },
  "graphql": { label: "GraphQL official docs", url: "https://graphql.org/learn/" },
  "sql": { label: "Mode — SQL tutorial (free)", url: "https://mode.com/sql-tutorial/" },
  "postgresql": { label: "PostgreSQL official tutorial", url: "https://www.postgresql.org/docs/current/tutorial.html" },
  "mysql": { label: "MySQL official tutorial", url: "https://dev.mysql.com/doc/refman/8.4/en/tutorial.html" },
  "mongodb": { label: "MongoDB University (free)", url: "https://learn.mongodb.com/" },
  "neo4j": { label: "Neo4j Graph Academy", url: "https://graphacademy.neo4j.com/" },
  "redis": { label: "Redis official docs", url: "https://redis.io/docs/latest/" },
  "snowflake": { label: "Snowflake free courses", url: "https://learn.snowflake.com/" },
  "spark": { label: "Apache Spark quick start", url: "https://spark.apache.org/docs/latest/quick-start.html" },
  "hadoop": { label: "Apache Hadoop docs", url: "https://hadoop.apache.org/docs/stable/" },
  "kafka": { label: "Apache Kafka quickstart", url: "https://kafka.apache.org/quickstart" },
  "aws": { label: "AWS Skill Builder (free tier)", url: "https://skillbuilder.aws/" },
  "azure": { label: "Microsoft Learn — Azure", url: "https://learn.microsoft.com/en-us/training/azure/" },
  "gcp": { label: "Google Cloud Skills Boost (free tier)", url: "https://www.cloudskillsboost.google/" },
  "docker": { label: "Docker official get-started guide", url: "https://docs.docker.com/get-started/" },
  "kubernetes": { label: "Kubernetes official tutorials", url: "https://kubernetes.io/docs/tutorials/" },
  "ci/cd": { label: "GitHub Actions docs", url: "https://docs.github.com/en/actions" },
  "terraform": { label: "Terraform — Get Started tutorials", url: "https://developer.hashicorp.com/terraform/tutorials" },
  "jenkins": { label: "Jenkins official docs", url: "https://www.jenkins.io/doc/" },
  "git": { label: "Git official docs / Pro Git book (free)", url: "https://git-scm.com/book/en/v2" },
  "linux": { label: "Linux Journey (free)", url: "https://linuxjourney.com/" },
};

const fallbackResource = (label) => ({
  label: "Search free tutorials",
  url: `https://www.google.com/search?q=${encodeURIComponent(`${label} free tutorial`)}`,
});

/**
 * Cross-references the applicant's already-detected resume skills against
 * a job's own text (rationale + notes), returning the ones relevant to
 * this job — each with a free resource link so the applicant can either
 * confidently check it off or brush up first.
 */
export function matchExistingSkillsForJob(jobText, skillsByCategory) {
  const text = String(jobText || "").toLowerCase();
  if (!text || !skillsByCategory) return [];
  const seen = new Set();
  const out = [];
  for (const items of Object.values(skillsByCategory)) {
    for (const label of items || []) {
      const kw = String(label).toLowerCase();
      if (seen.has(kw) || !text.includes(kw)) continue;
      seen.add(kw);
      const resource = RESUME_SKILL_RESOURCES[kw] || fallbackResource(label);
      out.push({ id: `existing_${kw.replace(/[^a-z0-9]+/g, "_")}`, label, resource });
    }
  }
  return out;
}
