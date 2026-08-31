const app = document.getElementById("app");
let state = loadState();
let ui = {
  tab: "project",
  modal: null,
  toast: null,
  toastTimer: null,
  activeCategory: CATEGORIES[0],
};
let pushTimer = null;
let syncBusy = false;

function persist() {
  saveState(state);
  const settings = loadSyncSettings();
  if (settings.autoPush && settings.gistId && settings.token && !syncBusy) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushSharedWorkspace({ silent: true }).catch((err) => toast(err.message));
    }, 2000);
  }
}

function traineeById(id) {
  return state.trainees.find((t) => t.id === id);
}

function reviewById(id) {
  return state.reviews.find((r) => r.id === id);
}

function reviewsFor(traineeId) {
  return state.reviews
    .filter((r) => r.traineeId === traineeId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.updatedAt.localeCompare(a.updatedAt)));
}

function latestReview(traineeId) {
  return reviewsFor(traineeId)[0] || null;
}

function parseRoute() {
  const hash = (location.hash || "#/").replace(/^#/, "");
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "trainee" && parts[1] && parts[2] === "review" && parts[3]) {
    return { name: "review", traineeId: parts[1], reviewId: parts[3] };
  }
  if (parts[0] === "trainee" && parts[1]) {
    return { name: "trainee", traineeId: parts[1] };
  }
  return { name: "dashboard" };
}

function go(path) {
  location.hash = path;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attr(value) {
  return esc(value).replace(/'/g, "&#39;");
}

function toast(message) {
  ui.toast = message;
  document.querySelectorAll(".toast").forEach((el) => el.remove());
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => {
    ui.toast = null;
    el.remove();
  }, 1800);
}

function header(extra) {
  return `
    <header class="app-header">
      <a class="brand" href="#/">
        <div class="brand-mark">DV</div>
        <div class="brand-text">
          <strong>Trainee Code Reviews</strong>
          <span>Design Verification · UVM</span>
        </div>
      </a>
      <div class="header-actions">
        <button class="btn btn-ghost" data-action="open-share">Share &amp; sync</button>
        ${extra || ""}
      </div>
    </header>
  `;
}

function statusBadge(verdict) {
  return `<span class="badge badge-${verdict}">${esc(verdictLabel(verdict))}</span>`;
}

function recBadge(rec) {
  if (!rec) return `<span class="badge">Not set</span>`;
  return `<span class="badge badge-${rec}">${esc(recommendationLabel(rec))}</span>`;
}

function progressBar(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<div class="progress-meta"><div class="progress"><span style="width:${pct}%"></span></div><span>${done}/${total}</span></div>`;
}

function renderDashboard() {
  const settings = loadSyncSettings();
  const syncLine = settings.gistId
    ? `Shared workspace · last sync ${formatSyncTime(settings.lastSyncedAt)}.`
    : "Track UVM project reviews, interview scores, and follow-up work across trainees.";
  const followups = state.reviews.filter(needsFollowUp);
  const openActions = state.reviews.reduce((n, r) => n + openActionCount(r), 0);
  const sortedTrainees = [...state.trainees].sort((a, b) => a.name.localeCompare(b.name));
  const recent = [...state.reviews].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);

  const traineeRows = sortedTrainees.length
    ? sortedTrainees
        .map((t) => {
          const reviews = reviewsFor(t.id);
          const latest = reviews[0];
          const scores = latest ? scoreReview(latest) : null;
          const actions = reviews.reduce((n, r) => n + openActionCount(r), 0);
          return `
            <tr class="clickable" data-go="#/trainee/${t.id}">
              <td><a href="#/trainee/${t.id}"><strong>${esc(t.name)}</strong></a></td>
              <td>${reviews.length}</td>
              <td>${latest ? esc(latest.reviewName) : `<span class="muted">No reviews</span>`}</td>
              <td class="mono">${scores ? formatPct(scores.project.pct) : "—"}</td>
              <td class="mono">${scores ? formatPct(scores.interview.pct) : "—"}</td>
              <td class="mono">${scores ? formatPct(scores.overall.pct) : "—"}</td>
              <td>${scores ? statusBadge(scores.verdict) : `<span class="badge">—</span>`}</td>
              <td>${actions}</td>
            </tr>`;
        })
        .join("")
    : `<tr><td colspan="8"><div class="empty"><h3>No trainees yet</h3><p>Add a trainee to start a UVM project review.</p></div></td></tr>`;

  const followupList = followups.length
    ? followups
        .map((r) => {
          const t = traineeById(r.traineeId);
          const s = scoreReview(r);
          return `
            <div class="followup-item" data-go="#/trainee/${r.traineeId}/review/${r.id}">
              <div>
                <strong>${esc(t ? t.name : "Unknown")}</strong>
                <div class="muted">${esc(r.reviewName)} · ${esc(r.date)}</div>
              </div>
              <div>${statusBadge(s.verdict)} ${recBadge(r.recommendation)}</div>
            </div>`;
        })
        .join("")
    : `<div class="empty"><h3>No follow-ups</h3><p>Reviews that need improvement, re-review, or open actions will appear here.</p></div>`;

  const recentList = recent.length
    ? recent
        .map((r) => {
          const t = traineeById(r.traineeId);
          const s = scoreReview(r);
          return `
            <div class="review-row" data-go="#/trainee/${r.traineeId}/review/${r.id}">
              <div>
                <strong>${esc(r.reviewName)}</strong>
                <div class="muted">${esc(t ? t.name : "Unknown")} · ${esc(r.module || "No module")} · ${esc(r.date)}</div>
              </div>
              <div>${progressBar(s.project.reviewed, s.project.total)}</div>
              <div class="mono">${formatPct(s.project.pct)}</div>
              <div class="mono">${formatPct(s.interview.pct)}</div>
              <div class="mono">${formatPct(s.overall.pct)}</div>
              <div>${statusBadge(s.verdict)}</div>
            </div>`;
        })
        .join("")
    : `<div class="empty"><h3>No reviews yet</h3><p>Open a trainee page and add a review.</p></div>`;

  app.innerHTML = `
    ${header(`<button class="btn btn-ghost" data-action="export-all">Export all PDFs</button>
      <button class="btn btn-teal" data-action="add-trainee">Add trainee</button>`)}
    <main class="page">
      <div class="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>${esc(syncLine)}</p>
        </div>
      </div>
      <section class="stats">
        <article class="stat-card"><div class="label">Trainees</div><div class="value">${state.trainees.length}</div></article>
        <article class="stat-card"><div class="label">Reviews</div><div class="value">${state.reviews.length}</div></article>
        <article class="stat-card"><div class="label">Open action items</div><div class="value">${openActions}</div></article>
        <article class="stat-card"><div class="label">Need follow-up</div><div class="value">${followups.length}</div></article>
      </section>
      <div class="grid-2">
        <section class="card">
          <div class="card-h"><h2>Trainees</h2></div>
          <div class="card-b" style="overflow:auto">
            <table class="table">
              <thead>
                <tr>
                  <th>Trainee</th><th>Reviews</th><th>Latest review</th>
                  <th>Project</th><th>Interview</th><th>Overall</th><th>Result</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>${traineeRows}</tbody>
            </table>
          </div>
        </section>
        <section class="card">
          <div class="card-h"><h2>Reviews requiring follow-up</h2></div>
          ${followupList}
        </section>
      </div>
      <section class="card" style="margin-top:16px">
        <div class="card-h"><h2>Recent reviews</h2></div>
        <div class="review-list">${recentList}</div>
      </section>
    </main>
    ${modalHtml()}
    ${ui.toast ? `<div class="toast">${esc(ui.toast)}</div>` : ""}
  `;
}

function renderTrainee(route) {
  const trainee = traineeById(route.traineeId);
  if (!trainee) {
    app.innerHTML = `${header()}<main class="page"><p>Trainee not found. <a href="#/">Back to dashboard</a></p></main>`;
    return;
  }
  const reviews = reviewsFor(trainee.id);
  const reviewCards = reviews.length
    ? reviews
        .map((r) => {
          const s = scoreReview(r);
          return `
            <div class="review-row" data-go="#/trainee/${trainee.id}/review/${r.id}">
              <div>
                <strong>${esc(r.reviewName)}</strong>
                <div class="muted">${esc(r.module || "No module")} · ${esc(r.reviewer || "No reviewer")} · ${esc(r.date)}</div>
              </div>
              <div>${progressBar(s.project.reviewed, s.project.total)}</div>
              <div class="mono">${formatPct(s.project.pct)}</div>
              <div class="mono">${formatPct(s.interview.pct)}</div>
              <div class="mono">${formatPct(s.overall.pct)}</div>
              <div>${statusBadge(s.verdict)}</div>
            </div>`;
        })
        .join("")
    : `<div class="empty"><h3>No reviews yet</h3><p>Create the first code-review interview for ${esc(trainee.name)}.</p></div>`;

  app.innerHTML = `
    ${header(`<button class="btn btn-ghost" data-action="export-trainee" data-id="${trainee.id}">Export all PDFs</button>
      <button class="btn btn-teal" data-action="add-review" data-id="${trainee.id}">Add review</button>`)}
    <main class="page">
      <div class="crumbs"><a href="#/">Dashboard</a><span>/</span><span>${esc(trainee.name)}</span></div>
      <div class="page-head">
        <div>
          <h1>${esc(trainee.name)}</h1>
          <p>${reviews.length} review${reviews.length === 1 ? "" : "s"} · previous reviews stay in history.</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-light" data-action="rename-trainee" data-id="${trainee.id}">Rename</button>
          <button class="btn btn-danger" data-action="delete-trainee" data-id="${trainee.id}">Delete trainee</button>
        </div>
      </div>
      <section class="card">
        <div class="card-h">
          <h2>Review history</h2>
          <span class="muted">Project · Interview · Overall</span>
        </div>
        <div class="review-list">${reviewCards}</div>
      </section>
    </main>
    ${modalHtml()}
    ${ui.toast ? `<div class="toast">${esc(ui.toast)}</div>` : ""}
  `;
}

function statusSelect(item) {
  const opts = STATUS_OPTIONS.map(
    (o) => `<option value="${o.value}" ${item.status === o.value ? "selected" : ""}>${o.label}</option>`
  ).join("");
  return `<select class="status-select ${item.status}" data-field="status" data-id="${item.id}">${opts}</select>`;
}

function scoreSelect(q) {
  const val = q.score === null || q.score === "" ? "" : String(q.score);
  const opts = [`<option value="">—</option>`]
    .concat([0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${val === String(n) ? "selected" : ""}>${n}</option>`))
    .join("");
  return `<select class="score-input" data-qfield="score" data-id="${q.id}">${opts}</select>`;
}

function renderReview(route) {
  const trainee = traineeById(route.traineeId);
  const review = reviewById(route.reviewId);
  if (!trainee || !review) {
    app.innerHTML = `${header()}<main class="page"><p>Review not found. <a href="#/">Back to dashboard</a></p></main>`;
    return;
  }
  const scores = scoreReview(review);
  const tab = ui.tab;

  const catNav = CATEGORIES.map((cat) => {
    const p = categoryProgress(review.checklist, cat);
    const active = ui.activeCategory === cat ? "active" : "";
    return `<button class="cat-link ${active}" data-cat="${attr(cat)}">${esc(cat)}<span class="count">${p.done}/${p.total}</span></button>`;
  }).join("");

  const extraCats = [...new Set(review.checklist.map((i) => i.category).filter((c) => !CATEGORIES.includes(c)))];
  const allCats = CATEGORIES.concat(extraCats);

  const checklistHtml = allCats
    .map((cat) => {
      const items = review.checklist.filter((i) => i.category === cat);
      if (!items.length) return "";
      const p = categoryProgress(review.checklist, cat);
      const body = items
        .map(
          (item) => `
          <article class="check-item" id="item-${item.id}">
            <div class="check-item-top">
              <textarea class="item-text" data-field="text" data-id="${item.id}">${esc(item.text)}</textarea>
              ${statusSelect(item)}
              <button class="btn btn-danger btn-sm" data-action="delete-item" data-id="${item.id}">Delete</button>
            </div>
            <div class="check-fields">
              <div>
                <label>Notes</label>
                <textarea data-field="notes" data-id="${item.id}" placeholder="Observations from the code">${esc(item.notes)}</textarea>
              </div>
              <div>
                <label>Action item</label>
                <textarea data-field="actionItem" data-id="${item.id}" placeholder="What the trainee should fix">${esc(item.actionItem)}</textarea>
              </div>
            </div>
          </article>`
        )
        .join("");
      return `
        <section class="cat-block" id="cat-${cssId(cat)}">
          <h3>${esc(cat)} ${progressBar(p.done, p.total)}</h3>
          ${body}
          <div class="add-row">
            <button class="btn btn-light btn-sm" data-action="add-item" data-cat="${attr(cat)}">Add checklist item</button>
          </div>
        </section>`;
    })
    .join("");

  const questionsHtml = review.questions
    .map(
      (q, i) => `
      <article class="q-card">
        <div class="q-top">
          <textarea data-qfield="question" data-id="${q.id}">${esc(q.question)}</textarea>
          <input data-qfield="topic" data-id="${q.id}" value="${attr(q.topic)}" placeholder="Topic" />
          ${scoreSelect(q)}
          <button class="btn btn-danger btn-sm" data-action="delete-q" data-id="${q.id}">Delete</button>
        </div>
        <div class="check-fields">
          <div>
            <label>Notes / trainee answer</label>
            <textarea data-qfield="notes" data-id="${q.id}" placeholder="Capture the answer during the interview">${esc(q.notes)}</textarea>
          </div>
          <div>
            <label>Follow-up / action item</label>
            <textarea data-qfield="followUp" data-id="${q.id}" placeholder="What to study or redo">${esc(q.followUp)}</textarea>
          </div>
        </div>
      </article>`
    )
    .join("");

  const actions = collectActionItems(review);
  const actionList = actions.length
    ? `<ul class="action-list">${actions.map((a) => `<li><strong>${esc(a.source)}:</strong> ${esc(a.text)}</li>`).join("")}</ul>`
    : `<p class="muted" style="padding:0 18px 12px">No action items yet. Add them on checklist items or interview questions.</p>`;

  app.innerHTML = `
    ${header(`<button class="btn btn-ghost" data-action="export-review" data-id="${review.id}">Export PDF</button>
      <button class="btn btn-teal" data-action="save-review">Save review</button>`)}
    <main class="page">
      <div class="crumbs">
        <a href="#/">Dashboard</a><span>/</span>
        <a href="#/trainee/${trainee.id}">${esc(trainee.name)}</a><span>/</span>
        <span>${esc(review.reviewName)}</span>
      </div>
      <div class="page-head">
        <div>
          <h1>${esc(review.reviewName)}</h1>
          <p>Live code-review interview for ${esc(trainee.name)}. Pending is not treated as failed.</p>
        </div>
        <button class="btn btn-danger" data-action="delete-review" data-id="${review.id}" data-trainee="${trainee.id}">Delete review</button>
      </div>
      <section class="card">
        <div class="meta-grid">
          <div class="field"><label>Review name</label><input data-meta="reviewName" value="${attr(review.reviewName)}" /></div>
          <div class="field"><label>Trainee</label><input value="${attr(trainee.name)}" disabled /></div>
          <div class="field"><label>Reviewer</label><input data-meta="reviewer" value="${attr(review.reviewer)}" /></div>
          <div class="field"><label>Date</label><input type="date" data-meta="date" value="${attr(review.date)}" /></div>
          <div class="field span-2"><label>Module / component</label><input data-meta="module" value="${attr(review.module)}" placeholder="e.g. AXI agent, ALU env" /></div>
          <div class="field span-2"><label>Review notes</label><textarea data-meta="reviewNotes" placeholder="Context for this review">${esc(review.reviewNotes)}</textarea></div>
        </div>
      </section>
      <section class="scorebar" id="scorebar">${scorebarHtml(scores)}</section>
      <div class="tabs">
        <button class="tab ${tab === "project" ? "active" : ""}" data-tab="project">Project Code Review</button>
        <button class="tab ${tab === "interview" ? "active" : ""}" data-tab="interview">Interview & Discussion</button>
      </div>
      <div id="tab-project" style="${tab === "project" ? "" : "display:none"}">
        <div class="review-layout">
          <nav class="cat-nav">${catNav}</nav>
          <div>${checklistHtml}</div>
        </div>
      </div>
      <div id="tab-interview" style="${tab === "interview" ? "" : "display:none"}">
        ${questionsHtml || `<div class="empty"><h3>No questions</h3></div>`}
        <button class="btn btn-light" data-action="add-q">Add interview question</button>
      </div>
      <section class="card summary-card">
        <div class="card-h"><h2>End-of-review summary</h2></div>
        <div class="scorebar" style="padding:16px;margin:0">${scorebarHtml(scores)}</div>
        <div class="summary-grid">
          <div class="field"><label>Strengths</label><textarea data-meta="strengths">${esc(review.strengths)}</textarea></div>
          <div class="field"><label>Areas for improvement</label><textarea data-meta="areasForImprovement">${esc(review.areasForImprovement)}</textarea></div>
          <div class="field span-2"><label>Additional action items</label><textarea data-meta="extraActions">${esc(review.extraActions)}</textarea></div>
          <div class="field span-2"><label>Mentor final notes</label><textarea data-meta="mentorFinalNotes">${esc(review.mentorFinalNotes)}</textarea></div>
          <div class="field">
            <label>Recommendation</label>
            <select data-meta="recommendation">
              ${RECOMMENDATIONS.map((r) => `<option value="${r.value}" ${review.recommendation === r.value ? "selected" : ""}>${r.label}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="card-h" style="border-top:1px solid var(--line);border-bottom:0"><h2>Collected action items</h2></div>
        ${actionList}
      </section>
      <div class="sticky-save">
        <div class="save-msg">Autosaves as you type. Use Save to stamp the review.</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-light" data-action="export-review" data-id="${review.id}">Export PDF</button>
          <button class="btn btn-teal" data-action="save-review">Save review</button>
        </div>
      </div>
    </main>
    ${modalHtml()}
    ${ui.toast ? `<div class="toast">${esc(ui.toast)}</div>` : ""}
  `;
}

function scorebarHtml(scores) {
  return `
    <article class="score-pill"><div class="k">Project review</div><div class="v">${formatPct(scores.project.pct)}</div><div class="s">${progressBar(scores.project.reviewed, scores.project.total)}</div></article>
    <article class="score-pill"><div class="k">Interview score</div><div class="v">${formatPct(scores.interview.pct)}</div><div class="s"><span class="muted">${scores.interview.pending ? "No scores yet" : formatAvg(scores.interview.avg)}</span></div></article>
    <article class="score-pill"><div class="k">Overall score</div><div class="v">${formatPct(scores.overall.pct)}</div><div class="s"><span class="muted">${scores.overall.pending ? "Pending" : "Project + interview"}</span></div></article>
    <article class="score-pill"><div class="k">Result</div><div class="v" style="font-size:18px;margin-top:8px">${statusBadge(scores.verdict)}</div><div class="s"><span class="muted">Pending is not failed</span></div></article>
  `;
}

function cssId(name) {
  return name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function modalHtml() {
  if (!ui.modal) return "";
  if (ui.modal.type === "trainee") {
    return `
      <div class="modal-back">
        <div class="modal">
          <div class="modal-h"><h2>${ui.modal.id ? "Rename trainee" : "Add trainee"}</h2></div>
          <div class="modal-b">
            <div class="field"><label>Trainee name</label><input id="modal-name" value="${attr(ui.modal.name || "")}" placeholder="e.g. Sara Haddad" /></div>
          </div>
          <div class="modal-f">
            <button class="btn btn-light" data-action="close-modal">Cancel</button>
            <button class="btn btn-teal" data-action="submit-trainee">Save</button>
          </div>
        </div>
      </div>`;
  }
  if (ui.modal.type === "review") {
    return `
      <div class="modal-back">
        <div class="modal">
          <div class="modal-h"><h2>New review</h2></div>
          <div class="modal-b">
            <div class="field"><label>Review name</label><input id="m-reviewName" placeholder="e.g. ALU UVM env — week 3" /></div>
            <div class="field"><label>Reviewer</label><input id="m-reviewer" value="${attr(getLastReviewer())}" placeholder="Mentor name" /></div>
            <div class="field"><label>Date</label><input id="m-date" type="date" value="${todayISO()}" /></div>
            <div class="field"><label>Module / component</label><input id="m-module" placeholder="e.g. AXI master agent" /></div>
            <div class="field"><label>Review notes</label><textarea id="m-notes" placeholder="Optional context"></textarea></div>
          </div>
          <div class="modal-f">
            <button class="btn btn-light" data-action="close-modal">Cancel</button>
            <button class="btn btn-teal" data-action="submit-review">Create review</button>
          </div>
        </div>
      </div>`;
  }
  if (ui.modal.type === "share") {
    const s = loadSyncSettings();
    return `
      <div class="modal-back">
        <div class="modal wide">
          <div class="modal-h">
            <h2>Share &amp; sync</h2>
            <p>Use the same trainee reviews from different computers. Pull before you start, push when you finish.</p>
          </div>
          <div class="modal-b">
            <p class="help"><strong>Recommended: GitHub Gist</strong> — one person creates the shared workspace, then both of you use the same gist ID.</p>
            <ol class="help">
              <li>Create a GitHub token with the <strong>gist</strong> scope: <a href="https://github.com/settings/tokens" target="_blank" rel="noopener">github.com/settings/tokens</a></li>
              <li>Paste the token below and click <strong>Create shared gist</strong> (first person only).</li>
              <li>Send your colleague the gist ID. They paste it here with their own token, then click <strong>Save settings</strong>.</li>
              <li>Each session: <strong>Pull</strong> first, work, then <strong>Push</strong>. Avoid editing the same review at the same time.</li>
            </ol>
            <div class="field"><label>Gist ID or gist URL</label><input id="sync-gist" value="${attr(s.gistId)}" placeholder="Paste gist ID" /></div>
            <div class="field"><label>GitHub token (gist scope)</label><input id="sync-token" type="password" value="${attr(s.token)}" placeholder="ghp_…" autocomplete="off" /></div>
            <label class="field field-check"><input id="sync-auto" type="checkbox" ${s.autoPush ? "checked" : ""} /> Auto-push a few seconds after I save</label>
            <p class="sync-meta">Last sync: ${esc(formatSyncTime(s.lastSyncedAt))}</p>
            <div class="sync-actions">
              <button class="btn btn-teal" data-action="gist-create">Create shared gist</button>
              <button class="btn btn-light" data-action="gist-pull">Pull</button>
              <button class="btn btn-light" data-action="gist-push">Push</button>
              <button class="btn btn-light" data-action="save-sync">Save settings</button>
            </div>
            <div class="divider"></div>
            <p class="help"><strong>Or share a file</strong> via Teams, email, or OneDrive. Export, send the JSON, then Import (merge) on the other computer.</p>
            <div class="sync-actions">
              <button class="btn btn-light" data-action="export-json">Export JSON</button>
              <button class="btn btn-light" data-action="import-json-merge">Import JSON (merge)</button>
              <button class="btn btn-danger" data-action="import-json-replace">Import JSON (replace)</button>
            </div>
          </div>
          <div class="modal-f">
            <button class="btn btn-light" data-action="close-modal">Close</button>
          </div>
        </div>
      </div>`;
  }
  return "";
}

function applyShareForm() {
  const current = loadSyncSettings();
  const gistEl = document.getElementById("sync-gist");
  const tokenEl = document.getElementById("sync-token");
  const autoEl = document.getElementById("sync-auto");
  if (!gistEl) return current;
  const next = {
    ...current,
    gistId: normalizeGistId(gistEl.value),
    token: (tokenEl.value || "").trim(),
    autoPush: !!(autoEl && autoEl.checked),
  };
  saveSyncSettings(next);
  return next;
}

async function pullSharedWorkspace() {
  const settings = applyShareForm();
  if (!settings.gistId || !settings.token) throw new Error("Enter the gist ID and GitHub token first.");
  syncBusy = true;
  try {
    const remote = await readGistWorkspace(settings.gistId, settings.token);
    state = mergeStates(state, remote);
    persist();
    saveSyncSettings({ ...settings, lastSyncedAt: new Date().toISOString() });
    toast("Pulled shared workspace");
    render();
  } finally {
    syncBusy = false;
  }
}

async function pushSharedWorkspace(opts) {
  const silent = opts && opts.silent;
  const settings = document.getElementById("sync-gist") ? applyShareForm() : loadSyncSettings();
  if (!settings.gistId || !settings.token) throw new Error("Enter the gist ID and GitHub token first.");
  syncBusy = true;
  try {
    const remote = await readGistWorkspace(settings.gistId, settings.token);
    state = mergeStates(state, remote);
    saveState(state);
    await writeGistWorkspace(settings.gistId, settings.token, state);
    saveSyncSettings({ ...settings, lastSyncedAt: new Date().toISOString() });
    if (!silent) {
      toast("Pushed shared workspace");
      render();
    }
  } finally {
    syncBusy = false;
  }
}

async function createSharedWorkspace() {
  const settings = applyShareForm();
  if (!settings.token) throw new Error("Paste a GitHub token with gist access first.");
  syncBusy = true;
  try {
    const id = await createSharedGist(state, settings.token);
    saveSyncSettings({ ...settings, gistId: id, lastSyncedAt: new Date().toISOString() });
    toast("Shared gist created");
    ui.modal = { type: "share" };
    render();
  } finally {
    syncBusy = false;
  }
}

function importWorkspaceFromFile(file, mode) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = parseWorkspace(JSON.parse(reader.result));
      state = mode === "replace" ? parsed : mergeStates(state, parsed);
      persist();
      ui.modal = null;
      toast(mode === "replace" ? "Workspace replaced" : "Workspace merged");
      render();
    } catch (err) {
      toast(err.message || "Could not import that file");
    }
  };
  reader.readAsText(file);
}

function render() {
  const route = parseRoute();
  if (route.name === "trainee") renderTrainee(route);
  else if (route.name === "review") renderReview(route);
  else renderDashboard();
}

function currentReview() {
  const route = parseRoute();
  return route.name === "review" ? reviewById(route.reviewId) : null;
}

function refreshScores() {
  const review = currentReview();
  if (!review) return;
  const scores = scoreReview(review);
  document.querySelectorAll(".scorebar").forEach((el) => {
    el.innerHTML = scorebarHtml(scores);
  });
  CATEGORIES.forEach((cat) => {
    const p = categoryProgress(review.checklist, cat);
    const link = document.querySelector(`.cat-link[data-cat="${cssSelectorEscape(cat)}"] .count`);
    if (link) link.textContent = `${p.done}/${p.total}`;
  });
}

function cssSelectorEscape(value) {
  return value.replace(/"/g, '\\"');
}

function touchReview(review) {
  review.updatedAt = new Date().toISOString();
  persist();
}

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-back")) {
    ui.modal = null;
    render();
    return;
  }
  const goEl = e.target.closest("[data-go]");
  if (goEl) {
    go(goEl.getAttribute("data-go").replace(/^#/, ""));
    return;
  }
  const el = e.target.closest("[data-action]");
  if (!el) {
    const tab = e.target.closest("[data-tab]");
    if (tab) {
      ui.tab = tab.getAttribute("data-tab");
      render();
      return;
    }
    const cat = e.target.closest("[data-cat]");
    if (cat && cat.classList.contains("cat-link")) {
      ui.activeCategory = cat.getAttribute("data-cat");
      document.querySelectorAll(".cat-link").forEach((n) => n.classList.remove("active"));
      cat.classList.add("active");
      const target = document.getElementById("cat-" + cssId(ui.activeCategory));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return;
  }
  const action = el.getAttribute("data-action");
  if (action === "close-modal") {
    ui.modal = null;
    render();
    return;
  }
  if (action === "open-share") {
    ui.modal = { type: "share" };
    render();
    return;
  }
  if (action === "save-sync") {
    applyShareForm();
    toast("Sync settings saved");
    render();
    return;
  }
  if (action === "gist-create") {
    createSharedWorkspace().catch((err) => toast(err.message));
    return;
  }
  if (action === "gist-pull") {
    pullSharedWorkspace().catch((err) => toast(err.message));
    return;
  }
  if (action === "gist-push") {
    pushSharedWorkspace().catch((err) => toast(err.message));
    return;
  }
  if (action === "export-json") {
    if (document.getElementById("sync-gist")) applyShareForm();
    downloadWorkspace(state);
    toast("Workspace JSON downloaded");
    return;
  }
  if (action === "import-json-merge" || action === "import-json-replace") {
    if (action === "import-json-replace" && !confirm("Replace all local reviews with the imported file?")) return;
    const input = document.getElementById("import-file");
    input.dataset.mode = action === "import-json-replace" ? "replace" : "merge";
    input.value = "";
    input.click();
    return;
  }
  if (action === "add-trainee") {
    ui.modal = { type: "trainee", name: "" };
    render();
    const input = document.getElementById("modal-name");
    if (input) input.focus();
    return;
  }
  if (action === "rename-trainee") {
    const t = traineeById(el.dataset.id);
    ui.modal = { type: "trainee", id: t.id, name: t.name };
    render();
    return;
  }
  if (action === "submit-trainee") {
    const name = (document.getElementById("modal-name").value || "").trim();
    if (!name) return;
    if (ui.modal.id) {
      const t = traineeById(ui.modal.id);
      t.name = name;
      t.updatedAt = new Date().toISOString();
    } else {
      state.trainees.push(createTrainee(name));
    }
    persist();
    ui.modal = null;
    toast("Trainee saved");
    render();
    return;
  }
  if (action === "delete-trainee") {
    if (!confirm("Delete this trainee and all of their reviews?")) return;
    const id = el.dataset.id;
    state.trainees = state.trainees.filter((t) => t.id !== id);
    state.reviews = state.reviews.filter((r) => r.traineeId !== id);
    state.deletedTraineeIds = [...new Set([...(state.deletedTraineeIds || []), id])];
    persist();
    go("/");
    toast("Trainee deleted");
    return;
  }
  if (action === "add-review") {
    ui.modal = { type: "review", traineeId: el.dataset.id };
    render();
    const input = document.getElementById("m-reviewName");
    if (input) input.focus();
    return;
  }
  if (action === "submit-review") {
    const trainee = traineeById(ui.modal.traineeId);
    const reviewName = (document.getElementById("m-reviewName").value || "").trim();
    if (!reviewName) return;
    const fields = {
      reviewName,
      reviewer: document.getElementById("m-reviewer").value,
      date: document.getElementById("m-date").value,
      module: document.getElementById("m-module").value,
      reviewNotes: document.getElementById("m-notes").value,
    };
    const review = createReview(trainee, fields);
    state.reviews.push(review);
    setLastReviewer(fields.reviewer);
    persist();
    ui.modal = null;
    ui.tab = "project";
    go(`/trainee/${trainee.id}/review/${review.id}`);
    return;
  }
  if (action === "save-review") {
    const review = currentReview();
    if (!review) return;
    touchReview(review);
    toast("Review saved");
    return;
  }
  if (action === "delete-review") {
    if (!confirm("Delete this review? History for other reviews is kept.")) return;
    state.reviews = state.reviews.filter((r) => r.id !== el.dataset.id);
    state.deletedReviewIds = [...new Set([...(state.deletedReviewIds || []), el.dataset.id])];
    persist();
    go(`/trainee/${el.dataset.trainee}`);
    toast("Review deleted");
    return;
  }
  if (action === "add-item") {
    const review = currentReview();
    review.checklist.push({
      id: uid(),
      category: el.getAttribute("data-cat"),
      text: "New checklist item",
      status: "not_reviewed",
      notes: "",
      actionItem: "",
      isCustom: true,
    });
    touchReview(review);
    render();
    return;
  }
  if (action === "delete-item") {
    const review = currentReview();
    review.checklist = review.checklist.filter((i) => i.id !== el.dataset.id);
    touchReview(review);
    render();
    return;
  }
  if (action === "add-q") {
    const review = currentReview();
    review.questions.push({
      id: uid(),
      question: "New interview question",
      topic: "Custom",
      score: null,
      notes: "",
      followUp: "",
      isCustom: true,
    });
    touchReview(review);
    ui.tab = "interview";
    render();
    return;
  }
  if (action === "delete-q") {
    const review = currentReview();
    review.questions = review.questions.filter((q) => q.id !== el.dataset.id);
    touchReview(review);
    ui.tab = "interview";
    render();
    return;
  }
  if (action === "export-review") {
    const review = reviewById(el.dataset.id);
    exportReviewPdf(review, traineeById(review.traineeId));
    return;
  }
  if (action === "export-trainee") {
    const reviews = reviewsFor(el.dataset.id);
    if (!reviews.length) {
      toast("No reviews to export");
      return;
    }
    const trainee = traineeById(el.dataset.id);
    exportReviewsPdf(reviews, [trainee], `${trainee.name} — DV Reviews`);
    return;
  }
  if (action === "export-all") {
    if (!state.reviews.length) {
      toast("No reviews to export");
      return;
    }
    exportReviewsPdf(state.reviews, state.trainees, "All DV Trainee Reviews");
  }
});

document.addEventListener("input", (e) => {
  const review = currentReview();
  if (!review) return;
  const meta = e.target.getAttribute("data-meta");
  if (meta) {
    review[meta] = e.target.value;
    if (meta === "reviewer") setLastReviewer(e.target.value);
    touchReview(review);
    return;
  }
  const field = e.target.getAttribute("data-field");
  if (field) {
    const item = review.checklist.find((i) => i.id === e.target.getAttribute("data-id"));
    if (item) item[field] = e.target.value;
    touchReview(review);
    return;
  }
  const qfield = e.target.getAttribute("data-qfield");
  if (qfield) {
    const q = review.questions.find((i) => i.id === e.target.getAttribute("data-id"));
    if (!q) return;
    if (qfield === "score") q.score = e.target.value === "" ? null : Number(e.target.value);
    else q[qfield] = e.target.value;
    touchReview(review);
    refreshScores();
  }
});

document.addEventListener("change", (e) => {
  const review = currentReview();
  if (!review) return;
  if (e.target.getAttribute("data-field") === "status") {
    const item = review.checklist.find((i) => i.id === e.target.getAttribute("data-id"));
    if (!item) return;
    item.status = e.target.value;
    e.target.className = "status-select " + item.status;
    touchReview(review);
    refreshScores();
  }
  if (e.target.getAttribute("data-meta") === "recommendation") {
    review.recommendation = e.target.value;
    touchReview(review);
  }
  if (e.target.getAttribute("data-qfield") === "score") {
    const q = review.questions.find((i) => i.id === e.target.getAttribute("data-id"));
    if (!q) return;
    q.score = e.target.value === "" ? null : Number(e.target.value);
    touchReview(review);
    refreshScores();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && ui.modal) {
    ui.modal = null;
    render();
  }
});

window.addEventListener("hashchange", () => {
  ui.modal = null;
  if (parseRoute().name !== "review") ui.tab = "project";
  render();
});

document.getElementById("import-file").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  importWorkspaceFromFile(file, e.target.dataset.mode || "merge");
});

async function boot() {
  const settings = loadSyncSettings();
  if (settings.gistId && settings.token) {
    try {
      syncBusy = true;
      const remote = await readGistWorkspace(settings.gistId, settings.token);
      state = mergeStates(state, remote);
      saveState(state);
      saveSyncSettings({ ...settings, lastSyncedAt: new Date().toISOString() });
    } catch (err) {
      console.warn("Could not pull shared workspace", err);
    } finally {
      syncBusy = false;
    }
  }
  render();
}

boot();
