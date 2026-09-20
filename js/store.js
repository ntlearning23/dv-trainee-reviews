const STORAGE_KEY = "dv-trainee-reviews-v1";
const LAST_REVIEWER_KEY = "dv-last-reviewer";

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function emptyState() {
  return {
    trainees: [],
    reviews: [],
    deletedTraineeIds: [],
    deletedReviewIds: [],
    template: builtInTemplate(),
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

function saveState(state) {
  const next = normalizeState(state);
  if (state && typeof state === "object") {
    state.trainees = next.trainees;
    state.reviews = next.reviews;
    state.deletedTraineeIds = next.deletedTraineeIds;
    state.deletedReviewIds = next.deletedReviewIds;
    state.template = next.template;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function getLastReviewer() {
  return localStorage.getItem(LAST_REVIEWER_KEY) || "";
}

function setLastReviewer(name) {
  localStorage.setItem(LAST_REVIEWER_KEY, name || "");
}

function cloneChecklist(template) {
  const tpl = normalizeTemplate(template);
  const names = Object.fromEntries(tpl.categories.map((c) => [c.id, c.name]));
  return tpl.checklist.map((item) => ({
    id: uid(),
    categoryId: item.categoryId,
    category: names[item.categoryId] || "Untitled section",
    text: item.text,
    info: String(item.info || "").trim() || defaultInfoForText(item.text),
    files: copyItemFiles(item),
    status: "not_reviewed",
    notes: "",
    actionItem: "",
    isCustom: false,
  }));
}

function snapshotSections(template) {
  return normalizeTemplate(template).categories.map(normalizeSection);
}

function templateCategoryName(template, categoryId) {
  const cat = (template.categories || []).find((c) => c.id === categoryId);
  return cat ? cat.name : "Untitled section";
}

function cloneQuestions() {
  return DEFAULT_QUESTIONS.map((q) => ({
    id: uid(),
    question: q.question,
    topic: q.topic,
    expectedAnswer: q.expectedAnswer || "",
    score: null,
    notes: "",
    followUp: "",
    isCustom: false,
  }));
}

function normalizeTrainee(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    ...raw,
    id: raw.id || uid(),
    name: String(raw.name || "").trim(),
    email: String(raw.email || "").trim(),
    cohort: String(raw.cohort || "").trim(),
    currentTopic: String(raw.currentTopic || "").trim(),
    gitRepo: String(raw.gitRepo || "").trim(),
    createdAt: raw.createdAt || "",
    updatedAt: raw.updatedAt || raw.createdAt || "",
  };
}

function normalizeQuestion(raw) {
  if (!raw || typeof raw !== "object") return null;
  const question = String(raw.question || "").trim();
  if (!question) return null;
  const scoreRaw = raw.score;
  const score = scoreRaw === null || scoreRaw === "" || scoreRaw === undefined ? null : Number(scoreRaw);
  return {
    ...raw,
    id: raw.id || uid(),
    question,
    topic: String(raw.topic || ""),
    expectedAnswer: String(raw.expectedAnswer || "").trim() || questionExpectedAnswer({ question, expectedAnswer: raw.expectedAnswer }),
    score: Number.isFinite(score) ? score : null,
    notes: String(raw.notes || ""),
    followUp: String(raw.followUp || ""),
    isCustom: !!raw.isCustom,
  };
}

function normalizeChecklistItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const text = String(raw.text || "").trim();
  if (!text) return null;
  return {
    ...raw,
    id: raw.id || uid(),
    categoryId: raw.categoryId || "",
    category: String(raw.category || ""),
    text,
    info: String(raw.info || "").trim() || defaultInfoForText(text),
    files: Array.isArray(raw.files) ? normalizeCheckFiles(raw.files, true) : copyItemFiles({ text }),
    status: String(raw.status || "not_reviewed"),
    notes: String(raw.notes || ""),
    actionItem: String(raw.actionItem || ""),
    isCustom: !!raw.isCustom,
  };
}

function normalizeReview(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    ...raw,
    id: raw.id || uid(),
    traineeId: raw.traineeId || "",
    reviewName: String(raw.reviewName || ""),
    reviewer: String(raw.reviewer || ""),
    date: raw.date || "",
    module: String(raw.module || ""),
    reviewNotes: String(raw.reviewNotes || ""),
    sections: Array.isArray(raw.sections) ? raw.sections.map(normalizeSection) : [],
    checklist: (Array.isArray(raw.checklist) ? raw.checklist : []).map(normalizeChecklistItem).filter(Boolean),
    questions: (Array.isArray(raw.questions) ? raw.questions : []).map(normalizeQuestion).filter(Boolean),
    strengths: String(raw.strengths || ""),
    areasForImprovement: String(raw.areasForImprovement || ""),
    extraActions: String(raw.extraActions || ""),
    mentorFinalNotes: String(raw.mentorFinalNotes || ""),
    recommendation: String(raw.recommendation || ""),
    createdAt: raw.createdAt || "",
    updatedAt: raw.updatedAt || raw.createdAt || "",
  };
}

function normalizeState(raw) {
  if (!raw || typeof raw !== "object") return emptyState();
  return {
    trainees: (Array.isArray(raw.trainees) ? raw.trainees : []).map(normalizeTrainee).filter(Boolean),
    reviews: (Array.isArray(raw.reviews) ? raw.reviews : []).map(normalizeReview).filter(Boolean),
    deletedTraineeIds: Array.isArray(raw.deletedTraineeIds) ? raw.deletedTraineeIds.filter(Boolean) : [],
    deletedReviewIds: Array.isArray(raw.deletedReviewIds) ? raw.deletedReviewIds.filter(Boolean) : [],
    template: normalizeTemplate(raw.template),
  };
}

function todayISO() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function createTrainee(fields) {
  const data = typeof fields === "string" ? { name: fields } : fields || {};
  return {
    id: uid(),
    name: (data.name || "").trim(),
    email: (data.email || "").trim(),
    cohort: (data.cohort || "").trim(),
    currentTopic: (data.currentTopic || "").trim(),
    gitRepo: (data.gitRepo || "").trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function applyTraineeProfile(trainee, fields) {
  trainee.name = (fields.name || "").trim();
  trainee.email = (fields.email || "").trim();
  trainee.cohort = (fields.cohort || "").trim();
  trainee.currentTopic = (fields.currentTopic || "").trim();
  trainee.gitRepo = (fields.gitRepo || "").trim();
  trainee.updatedAt = new Date().toISOString();
  return trainee;
}

function createReview(trainee, fields) {
  return {
    id: uid(),
    traineeId: trainee.id,
    reviewName: fields.reviewName.trim(),
    reviewer: fields.reviewer.trim(),
    date: fields.date || todayISO(),
    module: (fields.module || "").trim(),
    reviewNotes: fields.reviewNotes || "",
    sections: snapshotSections(fields.template),
    checklist: cloneChecklist(fields.template),
    questions: cloneQuestions(),
    strengths: "",
    areasForImprovement: "",
    extraActions: "",
    mentorFinalNotes: "",
    recommendation: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
