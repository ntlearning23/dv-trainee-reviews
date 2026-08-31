function scoredChecklistItems(checklist) {
  return checklist.filter((item) =>
    ["pass", "needs_improvement", "fail"].includes(item.status)
  );
}

function projectScore(checklist) {
  const scored = scoredChecklistItems(checklist);
  const applicable = checklist.filter((item) => item.status !== "na");
  const done = checklist.filter((item) => item.status !== "not_reviewed");
  const pass = checklist.filter((item) => item.status === "pass").length;
  const ni = checklist.filter((item) => item.status === "needs_improvement").length;
  const fail = checklist.filter((item) => item.status === "fail").length;
  const pending = checklist.filter((item) => item.status === "pending").length;
  const notReviewed = checklist.filter((item) => item.status === "not_reviewed").length;

  if (scored.length === 0) {
    return {
      pct: null,
      pending: true,
      reviewed: done.length,
      total: checklist.length,
      applicable: applicable.length,
      pass,
      ni,
      fail,
      pendingCount: pending,
      notReviewed,
    };
  }

  const points = scored.reduce((sum, item) => {
    if (item.status === "pass") return sum + 1;
    if (item.status === "needs_improvement") return sum + 0.5;
    return sum;
  }, 0);

  return {
    pct: (points / scored.length) * 100,
    pending: false,
    reviewed: done.length,
    total: checklist.length,
    applicable: applicable.length,
    pass,
    ni,
    fail,
    pendingCount: pending,
    notReviewed,
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
  const project = projectScore(review.checklist || []);
  const interview = interviewScore(review.questions || []);
  const overall = overallScore(project, interview);
  const verdict = verdictFromScores(overall, project, interview);
  return { project, interview, overall, verdict };
}

function categoryProgress(checklist, category) {
  const items = checklist.filter((item) => item.category === category);
  const done = items.filter((item) => item.status !== "not_reviewed").length;
  return { done, total: items.length };
}
