const STORAGE_KEY = "dv-trainee-reviews-v1";
const LAST_REVIEWER_KEY = "dv-last-reviewer";

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function emptyState() {
  return { trainees: [], reviews: [], deletedTraineeIds: [], deletedReviewIds: [] };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    return {
      trainees: Array.isArray(parsed.trainees) ? parsed.trainees : [],
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
      deletedTraineeIds: Array.isArray(parsed.deletedTraineeIds) ? parsed.deletedTraineeIds : [],
      deletedReviewIds: Array.isArray(parsed.deletedReviewIds) ? parsed.deletedReviewIds : [],
    };
  } catch {
    return emptyState();
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getLastReviewer() {
  return localStorage.getItem(LAST_REVIEWER_KEY) || "";
}

function setLastReviewer(name) {
  localStorage.setItem(LAST_REVIEWER_KEY, name || "");
}

function cloneChecklist() {
  return DEFAULT_CHECKLIST.map((item) => ({
    id: uid(),
    category: item.category,
    text: item.text,
    status: "not_reviewed",
    notes: "",
    actionItem: "",
    isCustom: false,
  }));
}

function cloneQuestions() {
  return DEFAULT_QUESTIONS.map((q) => ({
    id: uid(),
    question: q.question,
    topic: q.topic,
    score: null,
    notes: "",
    followUp: "",
    isCustom: false,
  }));
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
    checklist: cloneChecklist(),
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
