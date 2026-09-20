function scoredChecklistItems(checklist) {
  return checklist.filter((item) =>
    ["pass", "needs_improvement", "fail"].includes(item.status)
  );
}

function itemScoreValue(status) {
  if (status === "pass") return 1;
  if (status === "needs_improvement") return 0.5;
  if (status === "fail") return 0;
  return null;
}

function itemsForSection(checklist, section) {
  return (checklist || []).filter((item) => {
    if (item.categoryId && section.id) return item.categoryId === section.id;
    return item.category === section.name;
  });
}

function getReviewSections(review) {
  if (review && Array.isArray(review.sections) && review.sections.length) {
    return review.sections.map(normalizeSection);
  }
  const names = [];
  for (const item of (review && review.checklist) || []) {
    if (item.category && !names.includes(item.category)) names.push(item.category);
  }
  const ordered = CATEGORIES.filter((c) => names.includes(c)).concat(names.filter((c) => !CATEGORIES.includes(c)));
  return ordered.map((name) => normalizeSection({ id: slugId("cat", name), name, kind: "required", weight: 1 }));
}

function scoreSection(items, section) {
  const scored = scoredChecklistItems(items);
  const done = items.filter((item) => item.status !== "not_reviewed");
  const applicable = items.filter((item) => item.status !== "na");
  const allNa = items.length > 0 && items.every((item) => item.status === "na");
  const kind = section.kind || "required";
  const weight = Number(section.weight);
  const max = Number.isFinite(weight) && weight >= 0 ? weight : 1;
  const base = {
    id: section.id,
    name: section.name,
    kind,
    max,
    reviewed: done.length,
    total: items.length,
    applicable: applicable.length,
    pass: items.filter((item) => item.status === "pass").length,
    ni: items.filter((item) => item.status === "needs_improvement").length,
    fail: items.filter((item) => item.status === "fail").length,
  };

  if (allNa || items.length === 0) {
    return { ...base, pct: null, pending: true, included: false, earned: 0, missing: true };
  }
  if (scored.length === 0) {
    return { ...base, pct: null, pending: true, included: false, earned: 0, missing: true };
  }

  const ratio = scored.reduce((sum, item) => sum + itemScoreValue(item.status), 0) / scored.length;
  return {
    ...base,
    pct: ratio * 100,
    pending: false,
    included: true,
    earned: ratio * max,
    missing: false,
  };
}

function projectScore(checklist, sections) {
  const list = checklist || [];
  const sectionList = Array.isArray(sections) && sections.length
    ? sections
    : getReviewSections({ checklist: list });
  const sectionScores = sectionList.map((section) => scoreSection(itemsForSection(list, section), section));

  const scored = scoredChecklistItems(list);
  const applicable = list.filter((item) => item.status !== "na");
  const done = list.filter((item) => item.status !== "not_reviewed");
  const pass = list.filter((item) => item.status === "pass").length;
  const ni = list.filter((item) => item.status === "needs_improvement").length;
  const pending = list.filter((item) => item.status === "pending").length;
  const notReviewed = list.filter((item) => item.status === "not_reviewed").length;

  const counted = sectionScores.filter((s) => s.kind !== "bonus" && s.included);
  const bonuses = sectionScores.filter((s) => s.kind === "bonus" && s.included);
  const fail = counted.reduce((n, s) => n + s.fail, 0);
  const possiblePts = counted.reduce((n, s) => n + s.max, 0);
  const earnedPts = counted.reduce((n, s) => n + s.earned, 0);
  const bonusPts = bonuses.reduce((n, s) => n + s.earned, 0);

  const stats = {
    reviewed: done.length,
    total: list.length,
    applicable: applicable.length,
    pass,
    ni,
    fail,
    pendingCount: pending,
    notReviewed,
    sections: sectionScores,
    possiblePts,
    earnedPts,
    bonusPts,
  };

  if (scored.length === 0 || possiblePts <= 0) {
    return { pct: null, pending: true, ...stats };
  }

  return {
    pct: ((earnedPts + bonusPts) / possiblePts) * 100,
    pending: false,
    ...stats,
  };
}

function interviewScore(questions) {
  const scored = questions.filter((q) => q.score !== null && q.score !== "" && !Number.isNaN(Number(q.score)));
  if (scored.length === 0) {
    return { pct: null, avg: null, pending: true, scored: 0, total: questions.length };
  }
  const avg = scored.reduce((sum, q) => sum + Number(q.score), 0) / scored.length;
  return {
    pct: (avg / 5) * 100,
    avg,
    pending: false,
    scored: scored.length,
    total: questions.length,
  };
}

function overallScore(project, interview) {
  if (project.pending && interview.pending) {
    return { pct: null, pending: true };
  }
  if (project.pending) return { pct: interview.pct, pending: false };
  if (interview.pending) return { pct: project.pct, pending: false };
  return { pct: (project.pct + interview.pct) / 2, pending: false };
}

function verdictFromScores(overall, project, interview) {
  const started = project.reviewed >= 8 || (interview && interview.scored >= 5);
  if (!started || overall.pending) return "pending";
  if (project.fail > 0 && overall.pct < 70) return "failed";
  if (overall.pct >= 80) return "passed";
  if (overall.pct >= 55) return "needs_improvement";
  return "failed";
}

function verdictLabel(verdict) {
  return {
    passed: "Passed",
    needs_improvement: "Needs Improvement",
    failed: "Failed",
    pending: "Pending",
  }[verdict] || "Pending";
}

function recommendationLabel(value) {
  return {
    ready: "Ready for Next Topic",
    needs_improvement: "Needs Improvement",
    re_review: "Re-review Required",
  }[value] || "Not set";
}

function formatPct(pct) {
  if (pct === null || pct === undefined) return "—";
  return Math.round(pct) + "%";
}

function formatAvg(avg) {
  if (avg === null || avg === undefined) return "—";
  return avg.toFixed(1) + " / 5";
}

function formatPts(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function collectActionItems(review) {
  const items = [];
  for (const item of review.checklist) {
    if (item.actionItem && item.actionItem.trim()) {
      items.push({
        source: "Project",
        text: item.actionItem.trim(),
        related: item.text,
        status: item.status,
      });
    }
  }
  for (const q of review.questions) {
    if (q.followUp && q.followUp.trim()) {
      items.push({
        source: "Interview",
        text: q.followUp.trim(),
        related: q.question,
        status: q.score === null ? "pending" : Number(q.score) <= 2 ? "fail" : "needs_improvement",
      });
    }
  }
  if (review.extraActions && review.extraActions.trim()) {
    items.push({
      source: "Mentor",
      text: review.extraActions.trim(),
      related: "Additional action items",
      status: "pending",
    });
  }
  return items;
}

function openActionCount(review) {
  return collectActionItems(review).filter((item) => item.status !== "pass" && item.status !== "na").length;
}

function needsFollowUp(review) {
  const scores = scoreReview(review);
  if (review.recommendation === "needs_improvement" || review.recommendation === "re_review") return true;
  if (scores.verdict === "needs_improvement" || scores.verdict === "failed") return true;
  return openActionCount(review) > 0;
}

function scoreReview(review) {
  const sections = getReviewSections(review);
  const project = projectScore(review.checklist || [], sections);
  const interview = interviewScore(review.questions || []);
  const overall = overallScore(project, interview);
  const verdict = verdictFromScores(overall, project, interview);
  return { project, interview, overall, verdict };
}

function categoryProgress(checklist, category, section) {
  const items = section ? itemsForSection(checklist, section) : checklist.filter((item) => item.category === category);
  const done = items.filter((item) => item.status !== "not_reviewed").length;
  return { done, total: items.length };
}
