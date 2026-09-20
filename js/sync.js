const SYNC_SETTINGS_KEY = "dv-sync-settings-v1";
const GIST_FILENAME = "dv-reviews.json";

function emptySyncSettings() {
  return { gistId: "", token: "", autoPush: false, lastSyncedAt: "" };
}

function loadSyncSettings() {
  try {
    const raw = localStorage.getItem(SYNC_SETTINGS_KEY);
    if (!raw) return emptySyncSettings();
    return { ...emptySyncSettings(), ...JSON.parse(raw) };
  } catch {
    return emptySyncSettings();
  }
}

function saveSyncSettings(settings) {
  localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(settings));
}

function workspacePayload(current) {
  const normalized = normalizeState(current);
  return {
    app: "dv-trainee-reviews",
    version: 2,
    exportedAt: new Date().toISOString(),
    trainees: normalized.trainees,
    reviews: normalized.reviews,
    deletedTraineeIds: normalized.deletedTraineeIds,
    deletedReviewIds: normalized.deletedReviewIds,
    template: normalized.template,
  };
}

function parseWorkspace(data) {
  if (!data || typeof data !== "object") throw new Error("Invalid workspace file");
  const normalized = normalizeState({
    trainees: data.trainees,
    reviews: data.reviews,
    deletedTraineeIds: data.deletedTraineeIds,
    deletedReviewIds: data.deletedReviewIds,
    template: data.template,
  });
  if (!data.template) normalized.template = null;
  return normalized;
}

function mergeTemplate(localTpl, remoteTpl) {
  if (!remoteTpl) return normalizeTemplate(localTpl);
  if (!localTpl) return normalizeTemplate(remoteTpl);
  const localAt = (localTpl && localTpl.updatedAt) || "";
  const remoteAt = (remoteTpl && remoteTpl.updatedAt) || "";
  return normalizeTemplate(remoteAt > localAt ? remoteTpl : localTpl);
}

function newerItem(a, b) {
  const at = a.updatedAt || a.createdAt || "";
  const bt = b.updatedAt || b.createdAt || "";
  return bt > at ? b : a;
}

function mergeById(localArr, remoteArr) {
  const map = new Map();
  for (const item of localArr || []) {
    if (item && item.id) map.set(item.id, item);
  }
  for (const item of remoteArr || []) {
    if (!item || !item.id) continue;
    const existing = map.get(item.id);
    map.set(item.id, existing ? newerItem(existing, item) : item);
  }
  return [...map.values()];
}

function mergeStates(local, remote) {
  const deletedT = new Set([...(local.deletedTraineeIds || []), ...(remote.deletedTraineeIds || [])]);
  const deletedR = new Set([...(local.deletedReviewIds || []), ...(remote.deletedReviewIds || [])]);
  const trainees = mergeById(local.trainees, remote.trainees).filter((t) => !deletedT.has(t.id));
  const reviews = mergeById(local.reviews, remote.reviews).filter(
    (r) => !deletedR.has(r.id) && !deletedT.has(r.traineeId)
  );
  return normalizeState({
    trainees,
    reviews,
    deletedTraineeIds: [...deletedT],
    deletedReviewIds: [...deletedR],
    template: mergeTemplate(local.template, remote.template),
  });
}

function downloadWorkspace(current) {
  const blob = new Blob([JSON.stringify(workspacePayload(current), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `dv-reviews-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

function normalizeGistId(value) {
  const v = String(value || "").trim();
  const fromUrl = v.match(/gist\.github\.com\/(?:[^/]+\/)?([a-f0-9]+)/i);
  if (fromUrl) return fromUrl[1];
  return v;
}

function gistHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: "Bearer " + token,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function gistRequest(url, token, options) {
  const res = await fetch(url, {
    ...options,
    headers: { ...gistHeaders(token), ...(options && options.headers) },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }
  if (!res.ok) {
    const msg = (body && body.message) || res.statusText || "GitHub request failed";
    throw new Error(msg);
  }
  return body;
}

async function createSharedGist(current, token) {
  const body = await gistRequest("https://api.github.com/gists", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description: "DV Trainee Code Reviews — shared workspace",
      public: false,
      files: {
        [GIST_FILENAME]: { content: JSON.stringify(workspacePayload(current), null, 2) },
      },
    }),
  });
  return body.id;
}

async function readGistWorkspace(gistId, token) {
  const gist = await gistRequest("https://api.github.com/gists/" + gistId, token, { method: "GET" });
  const file = gist.files && (gist.files[GIST_FILENAME] || Object.values(gist.files)[0]);
  if (!file) throw new Error("The gist has no workspace file yet.");
  let content = file.content;
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url);
    content = await raw.text();
  }
  return parseWorkspace(JSON.parse(content));
}

async function writeGistWorkspace(gistId, token, current) {
  await gistRequest("https://api.github.com/gists/" + gistId, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: { content: JSON.stringify(workspacePayload(current), null, 2) },
      },
    }),
  });
}

function formatSyncTime(iso) {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString();
}
