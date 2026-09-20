const app = document.getElementById("app");
let state = loadState();
let ui = {
  tab: "project",
  modal: null,
  toast: null,
  toastTimer: null,
  activeCategory: CATEGORIES[0],
  activeTemplateId: "",
  viewer: null,
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
  if (parts[0] === "template") {
    return { name: "template" };
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
        <a class="btn btn-ghost" href="#/template">Review template</a>
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

function repoHref(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^github\.com\//i.test(raw)) return "https://" + raw;
  if (/^[\w.-]+\/[\w.-]+$/.test(raw)) return "https://github.com/" + raw;
  return "";
}

function profileLine(trainee) {
  return [trainee.cohort, trainee.currentTopic].filter(Boolean).join(" · ");
}

function currentTemplate() {
  if (!state.template || !Array.isArray(state.template.categories)) {
    state.template = builtInTemplate();
  }
  if (state.template.categories.some((c) => c.name === "Driver & Monitor")) {
    const split = splitCombinedDriverMonitor(state.template.categories, state.template.checklist);
    state.template.categories = (split.didSplit ? withBonusSection(split.categories) : split.categories).map(normalizeSection);
    state.template.checklist = split.checklist;
  }
  state.template.categories.forEach((c) => {
    if (!String(c.prefix || "").trim()) c.prefix = defaultPrefixForName(c.name);
  });
  return state.template;
}

function touchTemplate() {
  const tpl = currentTemplate();
  tpl.updatedAt = new Date().toISOString();
  persist();
}

function kindBadge(kind) {
  return `<span class="badge badge-kind-${kind}">${esc(sectionKindLabel(kind))}</span>`;
}

function templateMatchItem(item) {
  const tpl = currentTemplate();
  const list = tpl.checklist || [];
  const text = String((item && item.text) || "").trim();
  if (!text) return null;
  const byIdAndText =
    item && item.categoryId
      ? list.find((t) => t.categoryId === item.categoryId && String(t.text || "").trim() === text)
      : null;
  if (byIdAndText) return byIdAndText;
  const byText = list.find((t) => String(t.text || "").trim() === text);
  if (byText) return byText;
  const catName = String((item && item.category) || "").trim();
  if (!catName) return null;
  const catIds = new Set(
    (tpl.categories || []).filter((c) => c.name === catName).map((c) => c.id)
  );
  return list.find((t) => catIds.has(t.categoryId) && String(t.text || "").trim() === text) || null;
}

function checklistInfo(item) {
  const match = templateMatchItem(item);
  const fromTpl = match ? String(match.info || "").trim() : "";
  if (fromTpl) return fromTpl;
  const fromDefault = defaultInfoForText(item && item.text);
  if (fromDefault) return fromDefault;
  return String((item && item.info) || "").trim();
}

function checklistFiles(item) {
  if (item && Array.isArray(item.files)) return itemFiles(item);
  const match = templateMatchItem(item);
  if (match && Array.isArray(match.files)) return itemFiles(match);
  return itemFiles(item);
}

function closeInfoCard(immediate) {
  closeViewer(immediate);
}

function growTextarea(el) {
  if (!el || el.tagName !== "TEXTAREA") return;
  if (!el.classList.contains("cell-notes") && !el.classList.contains("viewer-notes") && !el.classList.contains("file-note")) return;
  el.style.height = "auto";
  const min = el.classList.contains("viewer-notes") ? 128 : 88;
  el.style.height = Math.min(Math.max(el.scrollHeight, min), 280) + "px";
}

function autosizeNotes(root) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll("textarea.cell-notes, textarea.viewer-notes, textarea.file-note").forEach(growTextarea);
}

function closeViewer(immediate) {
  document.querySelectorAll(".viewer-back").forEach((el) => {
    if (immediate) {
      el.remove();
      return;
    }
    el.classList.remove("open");
    el.classList.add("closing");
    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 200);
  });
  ui.viewer = null;
}

function reviewChecklistEntries(review) {
  const sections = getReviewSections(review);
  const entries = [];
  for (const sec of sections) {
    const items = itemsForSection(review.checklist, sec);
    items.forEach((item, index) => {
      entries.push({ item, sec, items, index });
    });
  }
  return entries;
}

function viewerEmpty(text) {
  const value = String(text || "").trim();
  return value ? esc(value) : `<span class="viewer-empty">Not recorded yet</span>`;
}

function infoProseHtml(text) {
  const value = String(text || "").trim();
  if (!value) {
    return `<p class="viewer-empty">No reviewer guide yet. Add it under Info in the Review template.</p>`;
  }
  return value
    .split(/\n\n+/)
    .map((para) => `<p class="info-prose-p">${esc(para)}</p>`)
    .join("");
}

function viewerField(title, body, extraClass) {
  return `<section class="viewer-block ${extraClass || ""}"><h4>${esc(title)}</h4><div class="viewer-block-body">${body}</div></section>`;
}

function filesGuideHtml(item) {
  const files = checklistFiles(item);
  if (!files.length) return viewerField("Required files to check", viewerEmpty(""), "files");
  const body = files
    .map((f) => {
      const name = String(f.file || "").trim() || "Unnamed file";
      const note = String(f.note || "").trim();
      return `<article class="file-guide-card">
        <code class="file-guide-name">${esc(name)}</code>
        <p class="file-guide-note">${note ? esc(note) : `<span class="viewer-empty">No check notes yet</span>`}</p>
      </article>`;
    })
    .join("");
  return viewerField("Required files to check", body, "files");
}

function fileChipsHtml(item) {
  const files = checklistFiles(item).filter((f) => String(f.file || "").trim() || String(f.note || "").trim());
  if (!files.length) return "";
  return `<div class="file-chips">${files
    .map((f) => {
      const name = String(f.file || "").trim() || "file";
      return `<span class="file-chip" title="${attr(f.note || name)}"><code>${esc(name)}</code></span>`;
    })
    .join("")}</div>`;
}

function templateFilesHtml(item) {
  const files = ensureItemFiles(item);
  const rows = files
    .map(
      (f) => `
        <div class="file-row">
          <input class="cell-input file-name" data-tfile="${item.id}" data-fid="${f.id}" data-ff="file" value="${attr(f.file)}" placeholder="File, e.g. *_driver.sv" />
          <textarea class="cell-input file-note" data-tfile="${item.id}" data-fid="${f.id}" data-ff="note" rows="3" placeholder="What to check in this file to pass this item">${esc(f.note)}</textarea>
          <button class="btn btn-danger btn-sm btn-icon" type="button" data-action="delete-tfile" data-id="${item.id}" data-fid="${f.id}" title="Remove file" aria-label="Remove file">×</button>
        </div>`
    )
    .join("");
  return `
    <div class="file-editor">
      <label class="info-label">Required files to check</label>
      ${rows || `<p class="muted file-empty">No files listed yet.</p>`}
      <button class="btn btn-light btn-sm" type="button" data-action="add-tfile" data-id="${item.id}">Add file</button>
    </div>`;
}

function scorePips(q) {
  const current = q.score === null || q.score === "" ? "" : String(q.score);
  const buttons = [`<button type="button" class="score-pip ${current === "" ? "active" : ""}" data-action="rate-q" data-id="${q.id}" data-score="" title="Not scored">—</button>`]
    .concat(
      [0, 1, 2, 3, 4, 5].map(
        (n) =>
          `<button type="button" class="score-pip ${current === String(n) ? "active" : ""}" data-action="rate-q" data-id="${q.id}" data-score="${n}" aria-label="Score ${n} of 5">${n}</button>`
      )
    )
    .join("");
  return `<div class="score-pips" role="group" aria-label="Rate the answer">${buttons}</div>`;
}

function syncTwinFields(el) {
  const id = el.getAttribute("data-id");
  if (!id) return;
  const qfield = el.getAttribute("data-qfield");
  const field = el.getAttribute("data-field");
  const attr = qfield ? "data-qfield" : field ? "data-field" : "";
  const name = qfield || field;
  if (!attr || !name) return;
  document.querySelectorAll(`[${attr}="${name}"][data-id="${id}"]`).forEach((node) => {
    if (node !== el) node.value = el.value;
  });
}

function syncViewerScore(q) {
  const back = document.querySelector(".viewer-back");
  if (!back) return;
  const chip = back.querySelector("[data-score-chip]");
  if (chip) chip.textContent = questionScoreLabel(q);
  const current = q.score === null || q.score === "" ? "" : String(q.score);
  back.querySelectorAll(".score-pip").forEach((btn) => {
    btn.classList.toggle("active", (btn.getAttribute("data-score") || "") === current);
  });
  document.querySelectorAll(`select[data-qfield="score"][data-id="${q.id}"]`).forEach((sel) => {
    sel.value = current;
  });
}

function viewerInnerHtml() {
  const review = currentReview();
  if (!review || !ui.viewer) return "";
  if (ui.viewer.type === "question") return questionViewerHtml(review, ui.viewer.id);
  if (ui.viewer.type === "info") return infoViewerHtml(review, ui.viewer.id);
  return itemViewerHtml(review, ui.viewer.id);
}

function questionViewerHtml(review, id) {
  const list = review.questions || [];
  const index = list.findIndex((q) => q.id === id);
  if (index < 0) return "";
  const q = list[index];
  const expected = questionExpectedAnswer(q);
  return `
    <div class="viewer-h">
      <div>
        <p class="viewer-kicker">Interview question</p>
        <p class="viewer-count">Question ${index + 1} of ${list.length}</p>
      </div>
      <button class="btn btn-light btn-sm btn-icon" type="button" data-action="close-viewer" aria-label="Close">×</button>
    </div>
    <div class="viewer-scroll">
      <div class="viewer-meta">
        <span class="item-code">Q${String(index + 1).padStart(2, "0")}</span>
        ${q.topic ? `<span class="viewer-chip">${esc(q.topic)}</span>` : ""}
        <span class="viewer-chip" data-score-chip>${esc(questionScoreLabel(q))}</span>
      </div>
      <h3 class="viewer-title">${esc(q.question)}</h3>
      ${viewerField("Expected answer", viewerEmpty(expected), "accent")}
      ${viewerField("Rate the answer", `${scorePips(q)}<p class="viewer-hint">0 = weak or missing, 5 = complete and specific to this project.</p>`)}
      ${viewerField(
        "Trainee answer / notes",
        `<textarea class="viewer-input" data-qfield="notes" data-id="${q.id}" rows="5" placeholder="Capture the answer during the interview">${esc(q.notes)}</textarea>`
      )}
      ${viewerField(
        "Follow-up / action item",
        `<textarea class="viewer-input" data-qfield="followUp" data-id="${q.id}" rows="3" placeholder="What to study or redo">${esc(q.followUp)}</textarea>`
      )}
    </div>
    ${viewerNavHtml(index, list.length, "question")}`;
}

function infoViewerHtml(review, id) {
  const entries = reviewChecklistEntries(review);
  const index = entries.findIndex((entry) => entry.item.id === id);
  if (index < 0) return "";
  const { item, sec, items } = entries[index];
  const code = itemCode(sec, items, item);
  const info = checklistInfo(item);
  const files = checklistFiles(item).filter((f) => String(f.file || "").trim() || String(f.note || "").trim());
  const fileCards = files.length
    ? files
        .map((f) => {
          const name = String(f.file || "").trim() || "Unnamed file";
          const note = String(f.note || "").trim();
          return `<article class="file-guide-card">
            <code class="file-guide-name">${esc(name)}</code>
            <p class="file-guide-note">${note ? esc(note) : `<span class="viewer-empty">No check notes yet</span>`}</p>
          </article>`;
        })
        .join("")
    : `<p class="viewer-empty">No required files listed for this item.</p>`;
  return `
    <div class="viewer-h">
      <div>
        <p class="viewer-kicker">What to look for</p>
        <p class="viewer-count">Item ${index + 1} of ${entries.length}</p>
      </div>
      <button class="btn btn-light btn-sm btn-icon" type="button" data-action="close-viewer" aria-label="Close">×</button>
    </div>
    <div class="viewer-scroll info-scroll">
      <div class="viewer-meta">
        ${code ? `<span class="item-code">${esc(code)}</span>` : ""}
        <span class="viewer-chip">${esc(sec.name || item.category || "Section")}</span>
      </div>
      <h3 class="viewer-title">${esc(item.text)}</h3>
      <section class="info-prose">
        ${infoProseHtml(info)}
      </section>
      <section class="info-files">
        <h4>Files to check</h4>
        ${fileCards}
      </section>
    </div>
    ${viewerNavHtml(index, entries.length, "info")}`;
}

function itemViewerHtml(review, id) {
  const entries = reviewChecklistEntries(review);
  const index = entries.findIndex((entry) => entry.item.id === id);
  if (index < 0) return "";
  const { item, sec, items } = entries[index];
  const code = itemCode(sec, items, item);
  const info = checklistInfo(item);
  const kind = sectionKindLabel(sec.kind || "required");
  return `
    <div class="viewer-h">
      <div>
        <p class="viewer-kicker">Checklist item</p>
        <p class="viewer-count">Item ${index + 1} of ${entries.length}</p>
      </div>
      <button class="btn btn-light btn-sm btn-icon" type="button" data-action="close-viewer" aria-label="Close">×</button>
    </div>
    <div class="viewer-scroll">
      <div class="viewer-meta">
        ${code ? `<span class="item-code">${esc(code)}</span>` : ""}
        <span class="viewer-chip">${esc(sec.name || item.category || "Section")}</span>
        <span class="viewer-chip">${esc(kind)}</span>
        <span class="viewer-chip status-${item.status || "not_reviewed"}" data-status-chip>${esc(statusLabel(item.status))}</span>
      </div>
      <h3 class="viewer-title">${esc(item.text)}</h3>
      ${viewerField("What to look for", infoProseHtml(info), "accent info-block")}
      ${filesGuideHtml(item)}
      ${viewerField("Status", statusSelect(item))}
      ${viewerField(
        "Notes / observations",
        `<textarea class="viewer-input viewer-notes" data-field="notes" data-id="${item.id}" rows="5" placeholder="Observations — what you saw in the code">${esc(item.notes)}</textarea>`
      )}
      ${viewerField(
        "Action item",
        `<textarea class="viewer-input" data-field="actionItem" data-id="${item.id}" rows="3" placeholder="What to fix">${esc(item.actionItem)}</textarea>`
      )}
    </div>
    ${viewerNavHtml(index, entries.length, "item")}`;
}

function questionScoreLabel(q) {
  if (q.score === null || q.score === "") return "Not scored";
  return `${q.score} / 5`;
}

function viewerNavHtml(index, total, type) {
  const atStart = index <= 0;
  const atEnd = index >= total - 1;
  return `
    <div class="viewer-nav">
      <button class="btn btn-light" type="button" data-action="view-prev" data-kind="${type}" ${atStart ? "disabled" : ""}>← Previous</button>
      <span class="viewer-nav-count">${index + 1} / ${total}</span>
      <button class="btn btn-teal" type="button" data-action="view-next" data-kind="${type}" ${atEnd ? "disabled" : ""}>Next →</button>
    </div>`;
}

function showViewer(type, id, { fromNav } = {}) {
  const review = currentReview();
  if (!review || !id) return;
  ui.viewer = { type, id };
  const inner = viewerInnerHtml();
  if (!inner) {
    closeViewer(true);
    return;
  }
  let back = document.querySelector(".viewer-back");
  if (!back) {
    back = document.createElement("div");
    back.className = "viewer-back open";
    back.innerHTML = `<div class="viewer-panel ${type === "info" ? "info-panel" : ""}" role="dialog" aria-modal="true" aria-label="${type === "info" ? "What to look for" : "Review detail"}" tabindex="-1"><div class="viewer-frame">${inner}</div></div>`;
    document.body.appendChild(back);
    const panel = back.querySelector(".viewer-panel");
    if (panel) panel.focus();
    autosizeNotes(back);
    return;
  }
  const panel = back.querySelector(".viewer-panel");
  if (panel) panel.classList.toggle("info-panel", type === "info");
  const frame = back.querySelector(".viewer-frame");
  if (fromNav && frame) {
    frame.innerHTML = inner;
    autosizeNotes(back);
    return;
  }
  back.querySelector(".viewer-panel").innerHTML = `<div class="viewer-frame">${inner}</div>`;
  back.classList.add("open");
  autosizeNotes(back);
}

function shiftViewer(dir) {
  const review = currentReview();
  if (!review || !ui.viewer) return;
  if (ui.viewer.type === "question") {
    const list = review.questions || [];
    const index = list.findIndex((q) => q.id === ui.viewer.id);
    const next = list[index + dir];
    if (next) showViewer("question", next.id, { fromNav: true });
    return;
  }
  const entries = reviewChecklistEntries(review);
  const index = entries.findIndex((entry) => entry.item.id === ui.viewer.id);
  const next = entries[index + dir];
  if (next) showViewer(ui.viewer.type === "info" ? "info" : "item", next.item.id, { fromNav: true });
}

function reviewItemCode(review, item) {
  const sections = getReviewSections(review);
  const sec =
    sections.find((s) => item.categoryId && s.id === item.categoryId) ||
    sections.find((s) => s.name === item.category) ||
    sections[0];
  const items = sec ? itemsForSection(review.checklist, sec) : [item];
  return itemCode(sec || { name: item.category, prefix: "" }, items, item);
}

function progressBar(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<div class="progress-meta"><div class="progress"><span style="width:${pct}%"></span></div><span>${done}/${total}</span></div>`;
}

function renderTemplate() {
  const tpl = currentTemplate();
  const sections = tpl.categories
    .map((cat) => {
      const items = tpl.checklist.filter((item) => item.categoryId === cat.id);
      const rows = items
        .map(
          (item, idx) => `
          <tr>
            <td class="col-code"><span class="item-code">${esc(itemCode(cat, items, item) || formatItemCode(normalizePrefix(cat.prefix, cat.name), idx + 1))}</span></td>
            <td>
              <textarea class="cell-input item-text" data-titem="${item.id}" rows="2">${esc(item.text)}</textarea>
              <label class="info-label">Info</label>
              <textarea class="cell-input item-info" data-tinfo="${item.id}" rows="3" placeholder="What the reviewer should look for. Shown when the reviewer clicks i on the review.">${esc(String(item.info || "").trim() || defaultInfoForText(item.text))}</textarea>
              ${templateFilesHtml(item)}
            </td>
            <td class="col-del">
              <button class="btn btn-danger btn-sm btn-icon" data-action="delete-titem" data-id="${item.id}" title="Delete item" aria-label="Delete item">×</button>
            </td>
          </tr>`
        )
        .join("");
      const kindOpts = SECTION_KINDS.map(
        (k) => `<option value="${k.value}" ${cat.kind === k.value ? "selected" : ""}>${k.label}</option>`
      ).join("");
      const scoreHint =
        cat.kind === "bonus"
          ? "Extra credit. Missing or blank = 0, not in the average."
          : cat.kind === "optional"
            ? "Counted only if scored. Missing = 0, not in the average."
            : "Always part of the project score once items are reviewed.";
      return `
        <section class="card template-section" id="tpl-${cssId(cat.id)}">
          <div class="template-head">
            <div class="template-move">
              <button class="btn btn-light btn-sm btn-icon" data-action="move-tcat" data-id="${cat.id}" data-dir="-1" title="Move up">↑</button>
              <button class="btn btn-light btn-sm btn-icon" data-action="move-tcat" data-id="${cat.id}" data-dir="1" title="Move down">↓</button>
            </div>
            <div class="field"><label>Section name</label><input data-tcat="${cat.id}" data-tfield="name" value="${attr(cat.name)}" /></div>
            <div class="field"><label>ID prefix</label><input data-tcat="${cat.id}" data-tfield="prefix" value="${attr(cat.prefix || defaultPrefixForName(cat.name))}" maxlength="6" /></div>
            <div class="field"><label>Type</label><select data-tcat="${cat.id}" data-tfield="kind">${kindOpts}</select></div>
            <div class="field"><label>Max score</label><input data-tcat="${cat.id}" data-tfield="weight" type="number" min="0" step="0.5" value="${attr(cat.weight)}" /></div>
            <button class="btn btn-danger btn-sm" data-action="delete-tcat" data-id="${cat.id}">Delete section</button>
          </div>
          <p class="template-hint">${esc(scoreHint)}</p>
          <div class="table-wrap">
            <table class="check-table template-items">
              <colgroup><col class="col-code" /><col /><col class="col-del" /></colgroup>
              <thead><tr><th class="col-code">ID</th><th>Checklist item</th><th></th></tr></thead>
              <tbody>${rows || `<tr><td colspan="3"><p class="muted" style="margin:8px">No items yet.</p></td></tr>`}</tbody>
            </table>
          </div>
          <div class="add-row">
            <button class="btn btn-light btn-sm" data-action="add-titem" data-id="${cat.id}">Add checklist item</button>
          </div>
        </section>`;
    })
    .join("");

  if (!tpl.categories.some((c) => c.id === ui.activeTemplateId) && tpl.categories[0]) {
    ui.activeTemplateId = tpl.categories[0].id;
  }

  const templateNav = tpl.categories
    .map((cat) => {
      const count = tpl.checklist.filter((item) => item.categoryId === cat.id).length;
      const active = ui.activeTemplateId === cat.id ? "active" : "";
      return `<button class="cat-link ${active}" type="button" data-action="jump-section" data-target="tpl-${cssId(cat.id)}" data-cat="${attr(cat.name)}" data-id="${cat.id}">${esc(cat.name)}<span class="count">${sectionKindLabel(cat.kind)} · ${count}</span></button>`;
    })
    .join("");

  app.innerHTML = `
    ${header(`<button class="btn btn-light" data-action="reset-template">Reset to built-in</button>
      <button class="btn btn-teal" data-action="add-tcat">Add section</button>`)}
    <main class="page">
      <div class="crumbs"><a href="#/">Dashboard</a><span>/</span><span>Review template</span></div>
      <div class="page-head">
        <div>
          <h1>Review template</h1>
          <p>This is the default Project Code Review for new reviews. Existing reviews keep the checklist they were created with.</p>
        </div>
      </div>
      <section class="card" style="margin-bottom:16px">
        <div class="card-h"><h2>How scoring works</h2></div>
        <div class="template-help">
          <p>Give each section a <strong>max score</strong>. Project % = points earned in required and scored optional sections ÷ those max scores, then <strong>bonus</strong> points are added on top.</p>
          <ul>
            <li><strong>Required</strong> — always counted once you score items in it.</li>
            <li><strong>Optional</strong> — if the section is missing or left Not Reviewed / N/A, its max score is 0 and it is left out of the average.</li>
            <li><strong>Bonus</strong> — extra credit. If missing, it adds 0 and cannot lower the score.</li>
            <li>Each checklist item has a stable ID such as <strong>SV-01</strong> or <strong>DRV-01</strong>, from the section prefix plus item order. Change the prefix to rename the IDs.</li>
            <li>Each item lists <strong>required files to check</strong> and a note on what to inspect in that file. Edit them here; they appear as chips on the review and in the item popup.</li>
            <li><strong>Info</strong> is the reviewer guide. It is live: change it here, then click <strong>i</strong> on any review of that checklist item to see the same text.</li>
          </ul>
        </div>
      </section>
      <div class="review-layout">
        <nav class="cat-nav" aria-label="Template sections">
          <div class="cat-nav-h">Sections</div>
          ${templateNav || `<p class="muted" style="padding:8px 10px">No sections yet.</p>`}
        </nav>
        <div>${sections || `<div class="empty"><h3>No sections</h3><p>Add a section to build the default review.</p></div>`}</div>
      </div>
    </main>
    ${modalHtml()}
    ${ui.toast ? `<div class="toast">${esc(ui.toast)}</div>` : ""}
  `;
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
              <td>
                <a href="#/trainee/${t.id}"><strong>${esc(t.name)}</strong></a>
                ${profileLine(t) ? `<div class="muted">${esc(profileLine(t))}</div>` : ""}
              </td>
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

  const emailHtml = trainee.email
    ? `<a href="mailto:${attr(trainee.email)}">${esc(trainee.email)}</a>`
    : `<span class="muted">Not set</span>`;
  const repoLink = repoHref(trainee.gitRepo);
  const repoHtml = trainee.gitRepo
    ? repoLink
      ? `<a href="${attr(repoLink)}" target="_blank" rel="noopener">${esc(trainee.gitRepo)}</a>`
      : esc(trainee.gitRepo)
    : `<span class="muted">Not set</span>`;

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
          <button class="btn btn-light" data-action="rename-trainee" data-id="${trainee.id}">Edit profile</button>
          <button class="btn btn-danger" data-action="delete-trainee" data-id="${trainee.id}">Delete trainee</button>
        </div>
      </div>
      <section class="card" style="margin-bottom:16px">
        <div class="card-h"><h2>Profile</h2></div>
        <div class="profile-grid">
          <div class="field"><label>Email</label><div class="profile-value">${emailHtml}</div></div>
          <div class="field"><label>Cohort</label><div class="profile-value">${trainee.cohort ? esc(trainee.cohort) : `<span class="muted">Not set</span>`}</div></div>
          <div class="field"><label>Current topic</label><div class="profile-value">${trainee.currentTopic ? esc(trainee.currentTopic) : `<span class="muted">Not set</span>`}</div></div>
          <div class="field"><label>Git repo</label><div class="profile-value">${repoHtml}</div></div>
        </div>
      </section>
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
  const sections = getReviewSections(review);
  if (!sections.some((s) => s.name === ui.activeCategory) && sections[0]) {
    ui.activeCategory = sections[0].name;
  }
  const sectionScoreMap = Object.fromEntries((scores.project.sections || []).map((s) => [s.id, s]));

  const catNav = sections
    .map((sec) => {
      const p = categoryProgress(review.checklist, sec.name, sec);
      const scored = sectionScoreMap[sec.id];
      const active = ui.activeCategory === sec.name ? "active" : "";
      return `<button class="cat-link ${active}" type="button" data-action="jump-section" data-target="cat-${cssId(sec.name)}" data-cat="${attr(sec.name)}">${esc(sec.name)}<span class="count">${formatPct(scored && scored.pct)} · ${p.done}/${p.total}</span></button>`;
    })
    .join("");

  const checklistHtml = sections
    .map((sec) => {
      const items = itemsForSection(review.checklist, sec);
      const p = categoryProgress(review.checklist, sec.name, sec);
      const scored = sectionScoreMap[sec.id] || {};
      const body = items
        .map((item) => {
          const code = itemCode(sec, items, item);
          return `
          <tr id="item-${item.id}">
            <td>
              <div class="item-cell">
                <div class="item-main">
                  <div class="item-meta">
                    <span class="item-code">${esc(code)}</span>
                    <button class="info-icon" type="button" data-action="view-info" data-id="${item.id}" title="What to look for" aria-label="What to look for">i</button>
                    <button class="btn btn-light btn-sm view-chip" type="button" data-action="view-item" data-id="${item.id}">View</button>
                  </div>
                  <textarea class="cell-input item-text" data-field="text" data-id="${item.id}" rows="2">${esc(item.text)}</textarea>
                  ${fileChipsHtml(item)}
                </div>
              </div>
            </td>
            <td>${statusSelect(item)}</td>
            <td>
              <textarea class="cell-input cell-notes" data-field="notes" data-id="${item.id}" rows="4" placeholder="Observations — what you saw in the code">${esc(item.notes)}</textarea>
            </td>
            <td>
              <textarea class="cell-input cell-notes" data-field="actionItem" data-id="${item.id}" rows="4" placeholder="What to fix">${esc(item.actionItem)}</textarea>
            </td>
            <td class="col-del">
              <button class="btn btn-danger btn-sm btn-icon" data-action="delete-item" data-id="${item.id}" title="Delete item" aria-label="Delete item">×</button>
            </td>
          </tr>`;
        })
        .join("");
      return `
        <section class="cat-block card" id="cat-${cssId(sec.name)}">
          <div class="card-h">
            <h3>${esc(sec.name)} ${kindBadge(sec.kind)}</h3>
            <div class="section-head-meta">
              <span class="mono">${formatPct(scored.pct)}</span>
              ${progressBar(p.done, p.total)}
            </div>
          </div>
          <div class="table-wrap">
            <table class="check-table">
              <thead>
                <tr>
                  <th class="col-item">Checklist item</th>
                  <th class="col-status">Status</th>
                  <th class="col-notes">Notes</th>
                  <th class="col-action">Action item</th>
                  <th class="col-del"></th>
                </tr>
              </thead>
              <tbody>${body || `<tr><td colspan="5"><p class="muted" style="margin:8px">No items in this section yet.</p></td></tr>`}</tbody>
            </table>
          </div>
          <div class="add-row">
            <button class="btn btn-light btn-sm" data-action="add-item" data-cat="${attr(sec.name)}" data-section="${attr(sec.id)}">Add checklist item</button>
          </div>
        </section>`;
    })
    .join("");

  const questionsHtml = review.questions
    .map(
      (q, i) => `
      <article class="q-card" id="question-${q.id}">
        <div class="q-top">
          <div class="q-title">
            <div class="item-meta">
              <span class="item-code">Q${String(i + 1).padStart(2, "0")}</span>
              <button class="btn btn-light btn-sm view-chip" type="button" data-action="view-question" data-id="${q.id}">View</button>
            </div>
            <textarea data-qfield="question" data-id="${q.id}">${esc(q.question)}</textarea>
          </div>
          <input data-qfield="topic" data-id="${q.id}" value="${attr(q.topic)}" placeholder="Topic" />
          ${scoreSelect(q)}
          <button class="btn btn-danger btn-sm" data-action="delete-q" data-id="${q.id}">Delete</button>
        </div>
        <div class="check-fields">
          <div class="span-2 expected-field">
            <label>Expected answer</label>
            <textarea data-qfield="expectedAnswer" data-id="${q.id}" placeholder="What a strong answer should include">${esc(q.expectedAnswer || questionExpectedAnswer(q))}</textarea>
          </div>
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
          <nav class="cat-nav" aria-label="Review sections">
            <div class="cat-nav-h">Sections</div>
            ${catNav}
          </nav>
          <div>
            <section class="card" id="section-scores" style="margin-bottom:16px">${sectionScoresHtml(scores)}</section>
            <p class="muted interview-help">Use the <strong>i</strong> button for a readable guide (what to look for and which files to check). Use <strong>View</strong> to score the item, add notes, and set an action.</p>
            ${checklistHtml}
          </div>
        </div>
      </div>
      <div id="tab-interview" style="${tab === "interview" ? "" : "display:none"}">
        <p class="muted interview-help">Open <strong>View</strong> on a question to read it as a card with the expected answer, trainee notes, and follow-up. Use Previous / Next or the arrow keys to move between questions.</p>
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
  const bonus = scores.project.bonusPts ? ` · +${formatPts(scores.project.bonusPts)} bonus` : "";
  return `
    <article class="score-pill"><div class="k">Project review</div><div class="v">${formatPct(scores.project.pct)}</div><div class="s">${progressBar(scores.project.reviewed, scores.project.total)}${bonus ? `<span class="muted">${bonus}</span>` : ""}</div></article>
    <article class="score-pill"><div class="k">Interview score</div><div class="v">${formatPct(scores.interview.pct)}</div><div class="s"><span class="muted">${scores.interview.pending ? "No scores yet" : formatAvg(scores.interview.avg)}</span></div></article>
    <article class="score-pill"><div class="k">Overall score</div><div class="v">${formatPct(scores.overall.pct)}</div><div class="s"><span class="muted">${scores.overall.pending ? "Pending" : "Project + interview"}</span></div></article>
    <article class="score-pill"><div class="k">Result</div><div class="v" style="font-size:18px;margin-top:8px">${statusBadge(scores.verdict)}</div><div class="s"><span class="muted">Pending is not failed</span></div></article>
  `;
}

function sectionScoresHtml(scores) {
  const rows = (scores.project.sections || [])
    .map((s) => {
      const points =
        s.kind === "bonus"
          ? s.included
            ? `+${formatPts(s.earned)} extra`
            : "0 · not counted"
          : s.included
            ? `${formatPts(s.earned)} / ${formatPts(s.max)}`
            : "0 · not counted";
      return `
        <tr class="clickable" data-action="jump-section" data-target="cat-${cssId(s.name)}" data-cat="${attr(s.name)}">
          <td><strong>${esc(s.name)}</strong></td>
          <td>${kindBadge(s.kind)}</td>
          <td class="mono">${formatPct(s.pct)}</td>
          <td class="mono">${points}</td>
        </tr>`;
    })
    .join("");
  return `
    <div class="card-h">
      <h2>Section scores</h2>
      <span class="muted">Optional and bonus stay at 0 if missing</span>
    </div>
    <div class="card-b" style="overflow:auto;padding:0">
      <table class="table">
        <thead><tr><th>Section</th><th>Type</th><th>Score</th><th>Points</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function cssId(name) {
  return name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function modalHtml() {
  if (!ui.modal) return "";
  if (ui.modal.type === "trainee") {
    return `
      <div class="modal-back">
        <div class="modal wide">
          <div class="modal-h"><h2>${ui.modal.id ? "Edit trainee profile" : "Add trainee"}</h2></div>
          <div class="modal-b">
            <div class="field"><label>Trainee name</label><input id="modal-name" value="${attr(ui.modal.name || "")}" placeholder="e.g. Sara Haddad" /></div>
            <div class="field"><label>Email</label><input id="modal-email" type="email" value="${attr(ui.modal.email || "")}" placeholder="e.g. sara@company.com" /></div>
            <div class="field"><label>Cohort</label><input id="modal-cohort" value="${attr(ui.modal.cohort || "")}" placeholder="e.g. DV Bootcamp 2026" /></div>
            <div class="field"><label>Current topic</label><input id="modal-topic" value="${attr(ui.modal.currentTopic || "")}" placeholder="e.g. ALU scoreboard" /></div>
            <div class="field"><label>Git repo link</label><input id="modal-repo" value="${attr(ui.modal.gitRepo || "")}" placeholder="https://github.com/org/alu-tb" /></div>
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
      if (mode === "replace") {
        state = normalizeState({
          ...parsed,
          template: parsed.template || builtInTemplate(),
        });
      } else {
        state = mergeStates(state, parsed);
      }
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
  if (route.name === "template") renderTemplate();
  else if (route.name === "trainee") renderTrainee(route);
  else if (route.name === "review") renderReview(route);
  else renderDashboard();
  autosizeNotes();
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
  const sectionBox = document.getElementById("section-scores");
  if (sectionBox) sectionBox.innerHTML = sectionScoresHtml(scores);
  getReviewSections(review).forEach((sec) => {
    const p = categoryProgress(review.checklist, sec.name, sec);
    const scored = (scores.project.sections || []).find((s) => s.id === sec.id);
    const link = document.querySelector(`.cat-link[data-cat="${cssSelectorEscape(sec.name)}"] .count`);
    if (link) link.textContent = `${formatPct(scored && scored.pct)} · ${p.done}/${p.total}`;
    const head = document.querySelector(`#cat-${cssId(sec.name)} .section-head-meta .mono`);
    if (head) head.textContent = formatPct(scored && scored.pct);
  });
}

function cssSelectorEscape(value) {
  return value.replace(/"/g, '\\"');
}

function touchReview(review) {
  review.updatedAt = new Date().toISOString();
  persist();
}

function jumpToSectionEl(targetId) {
  const apply = () => {
    document.querySelectorAll(".cat-link").forEach((n) => n.classList.remove("active"));
    document.querySelectorAll(`.cat-link[data-target="${cssSelectorEscape(targetId)}"]`).forEach((n) => n.classList.add("active"));
    const target = document.getElementById(targetId);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  requestAnimationFrame(apply);
}

function jumpToSection(el) {
  const targetId = el.getAttribute("data-target");
  const catName = el.getAttribute("data-cat");
  if (el.dataset.id) ui.activeTemplateId = el.dataset.id;
  if (catName) ui.activeCategory = catName;
  const needProjectTab = parseRoute().name === "review" && ui.tab !== "project";
  if (needProjectTab) {
    ui.tab = "project";
    render();
  }
  jumpToSectionEl(targetId);
}

function applyTemplateField(el) {
  if (!el || typeof el.getAttribute !== "function") return false;
  const tpl = currentTemplate();
  const catId = el.getAttribute && el.getAttribute("data-tcat");
  const field = el.getAttribute && el.getAttribute("data-tfield");
  if (catId && field) {
    const cat = tpl.categories.find((c) => c.id === catId);
    if (!cat) return true;
    if (field === "weight") cat.weight = Math.max(0, Number(el.value) || 0);
    else if (field === "prefix") cat.prefix = String(el.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    else cat[field] = el.value;
    touchTemplate();
    if (field === "kind") render();
    return true;
  }
  const itemId = el.getAttribute && el.getAttribute("data-titem");
  if (itemId) {
    const item = tpl.checklist.find((i) => i.id === itemId);
    if (item) item.text = el.value;
    touchTemplate();
    return true;
  }
  const infoId = el.getAttribute && el.getAttribute("data-tinfo");
  if (infoId) {
    const item = tpl.checklist.find((i) => i.id === infoId);
    if (item) item.info = el.value;
    touchTemplate();
    return true;
  }
  const tfileItem = el.getAttribute && el.getAttribute("data-tfile");
  if (tfileItem) {
    const item = tpl.checklist.find((i) => i.id === tfileItem);
    if (!item) return true;
    const files = ensureItemFiles(item);
    const fid = el.getAttribute("data-fid");
    const ff = el.getAttribute("data-ff");
    const row = files.find((f) => f.id === fid);
    if (row && (ff === "file" || ff === "note")) row[ff] = el.value;
    touchTemplate();
    return true;
  }
  return false;
}

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-back")) {
    ui.modal = null;
    render();
    return;
  }
  if (e.target.classList.contains("viewer-back") || e.target.classList.contains("info-card-back")) {
    closeViewer();
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
  if (action === "jump-section") {
    jumpToSection(el);
    return;
  }
  if (action === "view-item") {
    e.preventDefault();
    showViewer("item", el.dataset.id);
    return;
  }
  if (action === "view-info" || action === "toggle-info") {
    e.preventDefault();
    showViewer("info", el.dataset.id);
    return;
  }
  if (action === "view-question") {
    e.preventDefault();
    showViewer("question", el.dataset.id);
    return;
  }
  if (action === "rate-q") {
    e.preventDefault();
    const review = currentReview();
    const q = review && review.questions.find((item) => item.id === el.dataset.id);
    if (!q) return;
    q.score = el.dataset.score === "" ? null : Number(el.dataset.score);
    touchReview(review);
    refreshScores();
    syncViewerScore(q);
    return;
  }
  if (action === "view-prev") {
    e.preventDefault();
    shiftViewer(-1);
    return;
  }
  if (action === "view-next") {
    e.preventDefault();
    shiftViewer(1);
    return;
  }
  if (action === "close-info" || action === "close-viewer") {
    closeViewer();
    return;
  }
  if (action === "add-tcat") {
    const tpl = currentTemplate();
    const id = uid();
    tpl.categories.push({
      id,
      name: "New section",
      kind: "required",
      weight: 1,
      prefix: defaultPrefixForName("New section"),
    });
    tpl.checklist.push({ id: uid(), categoryId: id, text: "New checklist item", info: "", files: [] });
    ui.activeTemplateId = id;
    touchTemplate();
    render();
    jumpToSectionEl("tpl-" + cssId(id));
    return;
  }
  if (action === "delete-tcat") {
    if (!confirm("Delete this section and its checklist items from the default template?")) return;
    const tpl = currentTemplate();
    const id = el.dataset.id;
    tpl.categories = tpl.categories.filter((c) => c.id !== id);
    tpl.checklist = tpl.checklist.filter((item) => item.categoryId !== id);
    touchTemplate();
    render();
    return;
  }
  if (action === "move-tcat") {
    const tpl = currentTemplate();
    const i = tpl.categories.findIndex((c) => c.id === el.dataset.id);
    const j = i + Number(el.dataset.dir);
    if (i < 0 || j < 0 || j >= tpl.categories.length) return;
    const copy = tpl.categories.slice();
    const [moved] = copy.splice(i, 1);
    copy.splice(j, 0, moved);
    tpl.categories = copy;
    touchTemplate();
    render();
    return;
  }
  if (action === "add-titem") {
    const tpl = currentTemplate();
    tpl.checklist.push({ id: uid(), categoryId: el.dataset.id, text: "New checklist item", info: "", files: [] });
    touchTemplate();
    render();
    return;
  }
  if (action === "delete-titem") {
    const tpl = currentTemplate();
    tpl.checklist = tpl.checklist.filter((item) => item.id !== el.dataset.id);
    touchTemplate();
    render();
    return;
  }
  if (action === "add-tfile") {
    const tpl = currentTemplate();
    const item = tpl.checklist.find((i) => i.id === el.dataset.id);
    if (!item) return;
    ensureItemFiles(item);
    item.files.push({ id: uid(), file: "", note: "" });
    touchTemplate();
    render();
    return;
  }
  if (action === "delete-tfile") {
    const tpl = currentTemplate();
    const item = tpl.checklist.find((i) => i.id === el.dataset.id);
    if (!item) return;
    ensureItemFiles(item);
    item.files = item.files.filter((f) => f.id !== el.dataset.fid);
    touchTemplate();
    render();
    return;
  }
  if (action === "reset-template") {
    if (!confirm("Replace the template with the built-in UVM checklist? New reviews will use it. Existing reviews stay unchanged.")) return;
    state.template = builtInTemplate();
    touchTemplate();
    toast("Template reset");
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
    ui.modal = { type: "trainee", name: "", email: "", cohort: "", currentTopic: "", gitRepo: "" };
    render();
    const input = document.getElementById("modal-name");
    if (input) input.focus();
    return;
  }
  if (action === "rename-trainee") {
    const t = traineeById(el.dataset.id);
    ui.modal = {
      type: "trainee",
      id: t.id,
      name: t.name,
      email: t.email || "",
      cohort: t.cohort || "",
      currentTopic: t.currentTopic || "",
      gitRepo: t.gitRepo || "",
    };
    render();
    return;
  }
  if (action === "submit-trainee") {
    const fields = {
      name: (document.getElementById("modal-name").value || "").trim(),
      email: (document.getElementById("modal-email").value || "").trim(),
      cohort: (document.getElementById("modal-cohort").value || "").trim(),
      currentTopic: (document.getElementById("modal-topic").value || "").trim(),
      gitRepo: (document.getElementById("modal-repo").value || "").trim(),
    };
    if (!fields.name) return;
    if (ui.modal.id) {
      applyTraineeProfile(traineeById(ui.modal.id), fields);
    } else {
      state.trainees.push(createTrainee(fields));
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
    const review = createReview(trainee, { ...fields, template: currentTemplate() });
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
      categoryId: el.getAttribute("data-section") || "",
      category: el.getAttribute("data-cat"),
      text: "New checklist item",
      status: "not_reviewed",
      notes: "",
      actionItem: "",
      info: "",
      files: [],
      isCustom: true,
    });
    touchReview(review);
    render();
    return;
  }
  if (action === "delete-item") {
    const review = currentReview();
    if (ui.viewer && ui.viewer.id === el.dataset.id) closeViewer(true);
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
      expectedAnswer: "",
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
    if (ui.viewer && ui.viewer.id === el.dataset.id) closeViewer(true);
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
  growTextarea(e.target);
  if (applyTemplateField(e.target)) return;
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
    syncTwinFields(e.target);
    touchReview(review);
    return;
  }
  const qfield = e.target.getAttribute("data-qfield");
  if (qfield) {
    const q = review.questions.find((i) => i.id === e.target.getAttribute("data-id"));
    if (!q) return;
    if (qfield === "score") q.score = e.target.value === "" ? null : Number(e.target.value);
    else q[qfield] = e.target.value;
    syncTwinFields(e.target);
    touchReview(review);
    if (qfield === "score") {
      refreshScores();
      syncViewerScore(q);
    }
  }
});

document.addEventListener("change", (e) => {
  const tfield = e.target.getAttribute && e.target.getAttribute("data-tfield");
  if (tfield === "prefix") {
    applyTemplateField(e.target);
    const catId = e.target.getAttribute("data-tcat");
    const cat = currentTemplate().categories.find((c) => c.id === catId);
    if (cat) cat.prefix = normalizePrefix(cat.prefix, cat.name);
    touchTemplate();
    render();
    return;
  }
  if (applyTemplateField(e.target)) return;
  const review = currentReview();
  if (!review) return;
  if (e.target.getAttribute("data-field") === "status") {
    const item = review.checklist.find((i) => i.id === e.target.getAttribute("data-id"));
    if (!item) return;
    item.status = e.target.value;
    e.target.className = "status-select " + item.status;
    const chip = document.querySelector(".viewer-back [data-status-chip]");
    if (chip) {
      chip.className = `viewer-chip status-${item.status || "not_reviewed"}`;
      chip.textContent = statusLabel(item.status);
    }
    document.querySelectorAll(`select[data-field="status"][data-id="${item.id}"]`).forEach((sel) => {
      if (sel !== e.target) {
        sel.value = item.status;
        sel.className = "status-select " + item.status;
      }
    });
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
    syncViewerScore(q);
  }
});

document.addEventListener("keydown", (e) => {
  if (document.querySelector(".viewer-back.open, .info-card-back.open, .viewer-back")) {
    if (e.key === "Escape") {
      closeViewer();
      return;
    }
    const typing = e.target.closest("textarea, input, select");
    if (!typing && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      shiftViewer(e.key === "ArrowLeft" ? -1 : 1);
      return;
    }
  }
  if (e.key === "Escape" && ui.modal) {
    ui.modal = null;
    render();
  }
});

window.addEventListener("hashchange", () => {
  ui.modal = null;
  closeViewer(true);
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
  saveState(state);
  render();
}

boot();
