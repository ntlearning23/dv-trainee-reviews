function wrapLines(doc, text, maxWidth) {
  const str = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!str) return [""];
  return doc.splitTextToSize(str, maxWidth);
}

function drawPdfHeader(doc, title, subtitle) {
  doc.setFillColor(12, 59, 90);
  doc.rect(0, 0, 210, 28, "F");
  doc.setFillColor(15, 118, 110);
  doc.rect(0, 28, 210, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, 14, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(subtitle, 14, 22);
  doc.setTextColor(18, 32, 51);
}

function ensureSpace(doc, y, needed) {
  if (y + needed > 280) {
    doc.addPage();
    return 18;
  }
  return y;
}

function sectionTitle(doc, y, title) {
  y = ensureSpace(doc, y, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(12, 59, 90);
  doc.text(title, 14, y);
  doc.setDrawColor(215, 224, 234);
  doc.line(14, y + 2, 196, y + 2);
  doc.setTextColor(18, 32, 51);
  return y + 9;
}

function kv(doc, y, label, value) {
  y = ensureSpace(doc, y, 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(107, 124, 144);
  doc.text(label, 14, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(18, 32, 51);
  const lines = wrapLines(doc, value || "—", 130);
  doc.text(lines, 62, y);
  return y + Math.max(6, lines.length * 5);
}

function para(doc, y, text, indent) {
  const x = indent || 14;
  const lines = wrapLines(doc, text, 196 - x);
  for (const line of lines) {
    y = ensureSpace(doc, y, 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(line, x, y);
    y += 5;
  }
  return y;
}

function statusLabel(status) {
  return (STATUS_OPTIONS.find((s) => s.value === status) || { label: status }).label;
}

function addReviewToPdf(doc, review, trainee, startY) {
  let y = startY ?? 40;
  const scores = scoreReview(review);

  y = kv(doc, y, "Trainee", trainee ? trainee.name : "Unknown");
  y = kv(doc, y, "Review", review.reviewName);
  y = kv(doc, y, "Reviewer", review.reviewer);
  y = kv(doc, y, "Date", review.date);
  y = kv(doc, y, "Module / Component", review.module);
  y = kv(doc, y, "Project Score", formatPct(scores.project.pct));
  y = kv(doc, y, "Interview Score", scores.interview.pending ? "—" : `${formatPct(scores.interview.pct)} (${formatAvg(scores.interview.avg)})`);
  y = kv(doc, y, "Overall Score", formatPct(scores.overall.pct));
  y = kv(doc, y, "Result", verdictLabel(scores.verdict));
  y = kv(doc, y, "Recommendation", recommendationLabel(review.recommendation));
  y += 4;

  if (review.reviewNotes) {
    y = sectionTitle(doc, y, "Review Notes");
    y = para(doc, y, review.reviewNotes);
    y += 3;
  }

  y = sectionTitle(doc, y, "Project Code Review");
  let currentCat = "";
  for (const item of review.checklist) {
    if (item.category !== currentCat) {
      currentCat = item.category;
      y = ensureSpace(doc, y, 10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 118, 110);
      doc.text(currentCat, 14, y);
      doc.setTextColor(18, 32, 51);
      y += 6;
    }
    y = ensureSpace(doc, y, 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const head = wrapLines(doc, `[${statusLabel(item.status)}] ${item.text}`, 182);
    doc.text(head, 14, y);
    y += head.length * 5;
    if (item.notes && item.notes.trim()) {
      doc.setFont("helvetica", "italic");
      y = para(doc, y, "Notes: " + item.notes.trim(), 18);
    }
    if (item.actionItem && item.actionItem.trim()) {
      doc.setFont("helvetica", "italic");
      y = para(doc, y, "Action: " + item.actionItem.trim(), 18);
    }
    y += 2;
  }

  y = sectionTitle(doc, y + 2, "Interview & Discussion");
  review.questions.forEach((q, i) => {
    y = ensureSpace(doc, y, 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const qLines = wrapLines(doc, `${i + 1}. [${q.topic}] ${q.question}`, 182);
    doc.text(qLines, 14, y);
    y += qLines.length * 5;
    doc.setFont("helvetica", "normal");
    y = para(doc, y, `Score: ${q.score === null || q.score === "" ? "Not scored" : q.score + " / 5"}`, 18);
    if (q.notes && q.notes.trim()) y = para(doc, y, "Answer / notes: " + q.notes.trim(), 18);
    if (q.followUp && q.followUp.trim()) y = para(doc, y, "Follow-up: " + q.followUp.trim(), 18);
    y += 2;
  });

  y = sectionTitle(doc, y + 2, "Final Review Summary");
  y = kv(doc, y, "Project Score", formatPct(scores.project.pct));
  y = kv(doc, y, "Interview Score", formatPct(scores.interview.pct));
  y = kv(doc, y, "Overall Score", formatPct(scores.overall.pct));
  y += 2;
  y = sectionTitle(doc, y, "Strengths");
  y = para(doc, y, review.strengths || "—");
  y += 2;
  y = sectionTitle(doc, y, "Areas for Improvement");
  y = para(doc, y, review.areasForImprovement || "—");
  y += 2;
  y = sectionTitle(doc, y, "Action Items");
  const actions = collectActionItems(review);
  if (!actions.length) {
    y = para(doc, y, "None recorded.");
  } else {
    for (const action of actions) {
      y = para(doc, y, `• [${action.source}] ${action.text}`);
    }
  }
  y += 2;
  y = sectionTitle(doc, y, "Mentor Final Notes");
  y = para(doc, y, review.mentorFinalNotes || "—");
  y += 2;
  y = kv(doc, y, "Recommendation", recommendationLabel(review.recommendation));
  return y;
}

function downloadPdf(doc, filename) {
  doc.save(filename);
}

function getJsPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;
  return null;
}

function exportReviewPdf(review, trainee) {
  const JsPDF = getJsPdf();
  if (!JsPDF) {
    window.print();
    return;
  }
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  const name = trainee ? trainee.name : "Trainee";
  drawPdfHeader(doc, "DV Trainee Code Review", `${name} — ${review.reviewName}`);
  addReviewToPdf(doc, review, trainee, 40);
  const safe = `${name}-${review.reviewName}`.replace(/[^\w\-]+/g, "_").slice(0, 60);
  downloadPdf(doc, `${safe}.pdf`);
}

function exportReviewsPdf(reviews, trainees, title) {
  const JsPDF = getJsPdf();
  if (!JsPDF) {
    window.print();
    return;
  }
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  const byId = Object.fromEntries(trainees.map((t) => [t.id, t]));
  reviews.forEach((review, index) => {
    if (index > 0) doc.addPage();
    const trainee = byId[review.traineeId];
    const name = trainee ? trainee.name : "Trainee";
    drawPdfHeader(doc, title || "DV Trainee Code Reviews", `${name} — ${review.reviewName}`);
    addReviewToPdf(doc, review, trainee, 40);
  });
  downloadPdf(doc, (title || "dv-reviews").replace(/[^\w\-]+/g, "_") + ".pdf");
}
