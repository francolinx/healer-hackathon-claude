/* ------------------------------------------------------------------ */
/* healthEngine.js — VisitPulse FACTS layer (deterministic, LLM-free)  */
/* ------------------------------------------------------------------ */
//
// Pure functions only. No React, no network, no LLM, no randomness. Everything
// here is auditable: every number a clinician or user sees traces back to the
// input rows through arithmetic documented in SCORING.md.
//
// Responsibilities:
//   - composite, completeness-weighted daily wellness score
//   - rolling-window aggregation over the FULL history
//   - "best sustained window" selection (with a minimum-coverage guard)
//   - behavioral profile of a window ("what you were doing then")
//   - current state, per-metric gap, and the "% back to your best" headline
//   - realistic-goal guardrails (recency-aware target, confound flags)
//
// NOTE ON FRAMING: scores are general-WELLNESS relative, never diagnostic.
// They exist only to compare windows of a person's own data against each other.

export const ENGINE_CONFIG = {
  WINDOW_DAYS: 35, // length of a "sustained" window (~5 weeks)
  CURRENT_DAYS: 30, // current-state window ending at the most recent day
  MIN_WINDOW_COVERAGE: 0.6, // a window needs scores on >=60% of its days to qualify
  MIN_HISTORY_DAYS: 21, // below this we can't say anything useful
  RECENCY_THRESHOLD_DAYS: 730, // a "best" older than this triggers a realistic target
  RECENT_BEST_DAYS: 540, // horizon for the "recent best" comparison (~18 months)
  REALISTIC_BLEND: 0.6, // realistic target = current + 0.6 * (peak - current)
  CONSISTENCY_WEIGHT: 0.1, // window-level bedtime-consistency share of the window score
  BEDTIME_STD_ZERO: 90, // bedtime std (min) at which the consistency sub-score hits 0
};

// Point-in-time daily metrics that make up the composite score.
// dir: "higher" = more is better, "lower" = less is better, "band" = target range.
// good/bad: values mapped to sub-score 1 and 0 respectively (clamped between).
export const METRIC_SPECS = [
  { key: "resting_hr", label: "Resting heart rate", unit: "bpm", weight: 0.22, dir: "lower", good: 50, bad: 75, decimals: 0 },
  { key: "sleep_hours", label: "Sleep duration", unit: "h", weight: 0.22, dir: "band", lo: 7, hi: 8.5, floor: 5, ceil: 10, decimals: 1 },
  { key: "steps", label: "Daily steps", unit: "/day", weight: 0.20, dir: "higher", good: 11000, bad: 2000, decimals: 0 },
  { key: "exercise_minutes", label: "Exercise minutes", unit: "min/day", weight: 0.14, dir: "higher", good: 45, bad: 0, decimals: 0 },
  { key: "active_energy", label: "Active energy", unit: "kcal/day", weight: 0.08, dir: "higher", good: 700, bad: 150, decimals: 0 },
  { key: "spo2", label: "Blood oxygen", unit: "%", weight: 0.06, dir: "higher", good: 98, bad: 93, decimals: 0 },
  { key: "avg_hr", label: "Average heart rate", unit: "bpm", weight: 0.08, dir: "lower", good: 65, bad: 95, decimals: 0 },
];

const TOTAL_WEIGHT = METRIC_SPECS.reduce((a, m) => a + m.weight, 0);

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const isNum = (v) => v !== null && v !== undefined && !Number.isNaN(Number(v));
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const round = (v, d = 0) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);

/* ---------------- date helpers (UTC, no timezone surprises) -------- */
const toUTC = (s) => new Date(s + "T00:00:00Z");
const dayStr = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = toUTC(s); d.setUTCDate(d.getUTCDate() + n); return dayStr(d); };
const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);

/* ---------------- per-metric sub-score ----------------------------- */
// Returns a wellness sub-score in [0,1], or null if the value is missing.
export function metricSubScore(spec, value) {
  if (!isNum(value)) return null;
  const v = Number(value);
  if (spec.dir === "higher") return clamp01((v - spec.bad) / (spec.good - spec.bad));
  if (spec.dir === "lower") return clamp01((spec.bad - v) / (spec.bad - spec.good));
  if (spec.dir === "band") {
    if (v >= spec.lo && v <= spec.hi) return 1;
    if (v < spec.lo) return clamp01((v - spec.floor) / (spec.lo - spec.floor));
    return clamp01((spec.ceil - v) / (spec.ceil - spec.hi));
  }
  return null;
}

/* ---------------- composite daily score ---------------------------- */
// Completeness-weighted: only metrics present that day contribute, and weights
// are renormalized over what's present. Returns { score: 0..100|null,
// completeness: 0..1, present: [keys] }.
export function dailyScore(row) {
  let wsum = 0;
  let acc = 0;
  const present = [];
  for (const spec of METRIC_SPECS) {
    const sub = metricSubScore(spec, row[spec.key]);
    if (sub === null) continue;
    wsum += spec.weight;
    acc += spec.weight * sub;
    present.push(spec.key);
  }
  if (wsum === 0) return { score: null, completeness: 0, present };
  return { score: (acc / wsum) * 100, completeness: wsum / TOTAL_WEIGHT, present };
}

// Annotate each row with its score. Input rows are assumed sorted by date asc.
export function computeDailyScores(data) {
  return (data || []).map((row) => {
    const { score, completeness, present } = dailyScore(row);
    return { ...row, score, completeness, present };
  });
}

/* ---------------- calendar timeline (fills gaps with nulls) -------- */
// Produces one entry per calendar day from first to last date, so windows are
// measured in real days (gaps count against coverage), not array indices.
function buildTimeline(scored) {
  if (!scored.length) return [];
  const byDate = new Map(scored.map((r) => [r.date, r]));
  const first = scored[0].date;
  const last = scored[scored.length - 1].date;
  const out = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    out.push(byDate.get(d) || { date: d, score: null, completeness: 0, present: [] });
  }
  return out;
}

/* ---------------- consistency sub-score (window-level) ------------- */
function stdDev(vals) {
  if (vals.length < 2) return null;
  const m = mean(vals);
  return Math.sqrt(mean(vals.map((v) => (v - m) ** 2)));
}
function consistencySubScore(rows) {
  const beds = rows.map((r) => r.bedtime_min).filter(isNum);
  if (beds.length < 3) return null; // not enough timing data to judge consistency
  const sd = stdDev(beds);
  return clamp01(1 - sd / ENGINE_CONFIG.BEDTIME_STD_ZERO);
}

/* ---------------- window stats ------------------------------------- */
// Aggregates a slice of timeline entries into a window score + coverage.
// Window score blends the completeness-weighted mean daily score with a small
// bedtime-consistency component (only when timing data exists).
function windowStats(slice) {
  const len = slice.length;
  const scoredDays = slice.filter((r) => r.score !== null);
  if (!scoredDays.length) return null;
  let wsum = 0;
  let acc = 0;
  for (const r of scoredDays) {
    const w = Math.max(r.completeness, 0.0001);
    wsum += w;
    acc += w * r.score;
  }
  const meanScore = acc / wsum;
  const cons = consistencySubScore(scoredDays);
  let score = meanScore;
  if (cons !== null) {
    score = (1 - ENGINE_CONFIG.CONSISTENCY_WEIGHT) * meanScore + ENGINE_CONFIG.CONSISTENCY_WEIGHT * cons * 100;
  }
  return {
    score,
    meanScore,
    consistency: cons,
    coverage: scoredDays.length / len,
    nDays: scoredDays.length,
    avgCompleteness: mean(scoredDays.map((r) => r.completeness)),
  };
}

/* ---------------- behavioral profile of a window ------------------- */
// "What you were doing then" — averages of the raw metrics over the window.
export function characterizeWindow(rows) {
  const avgOf = (key) => { const vals = rows.map((r) => r[key]).filter(isNum).map(Number); return vals.length ? mean(vals) : null; };
  const days = rows.length || 1;
  const workouts = rows.map((r) => r.workouts).filter(isNum).reduce((a, b) => a + Number(b), 0);
  const bedVals = rows.map((r) => r.bedtime_min).filter(isNum);
  const wakeVals = rows.map((r) => r.wake_min).filter(isNum);
  return {
    resting_hr: round(avgOf("resting_hr"), 0),
    avg_hr: round(avgOf("avg_hr"), 0),
    sleep_hours: round(avgOf("sleep_hours"), 1),
    steps: round(avgOf("steps"), 0),
    exercise_minutes: round(avgOf("exercise_minutes"), 0),
    active_energy: round(avgOf("active_energy"), 0),
    spo2: round(avgOf("spo2"), 0),
    workouts_per_week: round((workouts / days) * 7, 1),
    bedtime_min: bedVals.length ? round(mean(bedVals), 0) : null,
    wake_min: wakeVals.length ? round(mean(wakeVals), 0) : null,
    bedtime_std: bedVals.length >= 2 ? round(stdDev(bedVals), 0) : null,
  };
}

/* ---------------- best-window search ------------------------------- */
// Slides a WINDOW_DAYS calendar window across the timeline and returns the
// highest-scoring window meeting the coverage guard. Tie-break: more recent.
// `within` optionally restricts the search to windows ending within the last
// `within` days of the timeline (used for the "recent best").
function searchBestWindow(timeline, { windowDays, minCoverage, within } = {}) {
  windowDays = windowDays || ENGINE_CONFIG.WINDOW_DAYS;
  minCoverage = minCoverage ?? ENGINE_CONFIG.MIN_WINDOW_COVERAGE;
  if (timeline.length < windowDays) {
    // Not enough span for a full window: evaluate the whole timeline once.
    const stats = windowStats(timeline);
    if (!stats || stats.coverage < minCoverage) return null;
    return { startDate: timeline[0].date, endDate: timeline[timeline.length - 1].date, ...stats };
  }
  const lastDate = timeline[timeline.length - 1].date;
  let best = null;
  for (let i = 0; i + windowDays <= timeline.length; i++) {
    const slice = timeline.slice(i, i + windowDays);
    const endDate = slice[slice.length - 1].date;
    if (within !== undefined && daysBetween(endDate, lastDate) > within) continue;
    const stats = windowStats(slice);
    if (!stats || stats.coverage < minCoverage) continue;
    const cand = { startDate: slice[0].date, endDate, ...stats };
    if (!best || cand.score > best.score + 1e-9 ||
        (Math.abs(cand.score - best.score) <= 1e-9 && cand.endDate > best.endDate)) {
      best = cand;
    }
  }
  return best;
}

/* ---------------- gap between two profiles -------------------------- */
const GAP_METRICS = [
  { key: "resting_hr", label: "Resting heart rate", unit: "bpm", better: "lower", decimals: 0 },
  { key: "sleep_hours", label: "Sleep duration", unit: "h", better: "higher", decimals: 1 },
  { key: "steps", label: "Daily steps", unit: "", better: "higher", decimals: 0 },
  { key: "exercise_minutes", label: "Exercise minutes", unit: "min/day", better: "higher", decimals: 0 },
  { key: "workouts_per_week", label: "Workouts", unit: "/week", better: "higher", decimals: 1 },
  { key: "bedtime_min", label: "Bedtime", unit: "", better: "lower", decimals: 0 }, // earlier (smaller mins-after-noon) is "better"
];

function computeGaps(bestProfile, currentProfile) {
  const gaps = [];
  for (const g of GAP_METRICS) {
    const best = bestProfile[g.key];
    const current = currentProfile[g.key];
    if (!isNum(best) || !isNum(current)) continue;
    const delta = current - best; // current minus best
    const pctChange = best !== 0 ? (delta / Math.abs(best)) * 100 : null;
    // "towardBest" = is current already at or better than the best on this metric?
    const towardBest = g.better === "higher" ? current >= best : current <= best;
    gaps.push({ ...g, best, current, delta, pctChange, towardBest, gapAbs: Math.abs(delta) });
  }
  return gaps;
}

/* ---------------- seasons / confounds ------------------------------ */
const monthOf = (s) => toUTC(s).getUTCMonth() + 1;
const SUMMER = new Set([5, 6, 7, 8, 9]);
const WINTER = new Set([11, 12, 1, 2]);
const midpoint = (start, end) => addDays(start, Math.floor(daysBetween(start, end) / 2));

/* ---------------- top-level facts builder -------------------------- */
// The single entry point the UI/coach use. Returns a fully deterministic facts
// object. Never throws on missing/partial data; returns { ok:false, reason }.
export function computeHistoricalBest(data, opts = {}) {
  const cfg = { ...ENGINE_CONFIG, ...(opts.config || {}) };
  const rows = (data || []).filter((r) => r && r.date).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < cfg.MIN_HISTORY_DAYS) {
    return { ok: false, reason: `Need at least ${cfg.MIN_HISTORY_DAYS} days of data to find your best window (have ${rows.length}).` };
  }

  const scored = computeDailyScores(rows);
  const timeline = buildTimeline(scored);
  const lastDate = timeline[timeline.length - 1].date;
  const firstDate = timeline[0].date;
  const historySpanDays = daysBetween(firstDate, lastDate) + 1;

  // Current state = last CURRENT_DAYS calendar days.
  const currentStart = addDays(lastDate, -(cfg.CURRENT_DAYS - 1));
  const currentSlice = timeline.filter((r) => r.date >= currentStart);
  const currentStats = windowStats(currentSlice);
  const currentRows = rows.filter((r) => r.date >= currentStart);
  const currentProfile = characterizeWindow(currentRows);

  // Best sustained window across all history.
  const best = searchBestWindow(timeline, { windowDays: Math.min(cfg.WINDOW_DAYS, timeline.length), minCoverage: cfg.MIN_WINDOW_COVERAGE });
  if (!best || !currentStats) {
    return { ok: false, reason: "Not enough scored days to compare a best window against now. Add more complete data." };
  }
  const bestRows = rows.filter((r) => r.date >= best.startDate && r.date <= best.endDate);
  const bestProfile = characterizeWindow(bestRows);
  const bestAgeDays = daysBetween(best.endDate, lastDate);

  // Headline: % back to your best (capped at 100; >100 means at/above best now).
  const ratio = best.score > 0 ? currentStats.score / best.score : 1;
  const percentBack = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  const atOrAboveBest = currentStats.score >= best.score - 1e-9;

  const gaps = computeGaps(bestProfile, currentProfile)
    .sort((a, b) => Number(a.towardBest) - Number(b.towardBest) || (b.pctChange === null ? 0 : Math.abs(b.pctChange)) - (a.pctChange === null ? 0 : Math.abs(a.pctChange)));

  /* ----- Phase 2: realistic-goal guardrails ----- */
  const oldPeak = bestAgeDays > cfg.RECENCY_THRESHOLD_DAYS;
  let recentBest = null;
  if (oldPeak) {
    recentBest = searchBestWindow(timeline, { windowDays: Math.min(cfg.WINDOW_DAYS, timeline.length), minCoverage: cfg.MIN_WINDOW_COVERAGE, within: cfg.RECENT_BEST_DAYS });
  }
  // Realistic target: blend current -> peak so we don't coach toward an ancient
  // peak. When the peak is recent, the realistic target IS the peak.
  let target;
  if (oldPeak) {
    const blend = cfg.REALISTIC_BLEND;
    const blendProfile = {};
    for (const g of GAP_METRICS) {
      const b = bestProfile[g.key];
      const c = currentProfile[g.key];
      blendProfile[g.key] = isNum(b) && isNum(c) ? round(c + blend * (b - c), g.decimals) : (isNum(b) ? b : c);
    }
    target = { kind: "realistic", profile: blendProfile, blend,
      label: "Realistic next target",
      note: `Your best window is about ${Math.round(bestAgeDays / 30)} months ago, so the suggested target blends ${Math.round(blend * 100)}% of the way from where you are now toward that peak - a step you've shown is within reach.` };
  } else {
    target = { kind: "peak", profile: bestProfile,
      label: "Target: your proven best",
      note: "Your best window is recent enough to aim for directly - this is a level you've already sustained." };
  }

  /* ----- confound flags (deterministic heuristics) ----- */
  const confounds = [];
  if (currentStats.coverage < 0.5) {
    confounds.push({ code: "LOW_CURRENT_COVERAGE", label: `Recent data is sparse (${Math.round(currentStats.coverage * 100)}% of the last ${cfg.CURRENT_DAYS} days have readings), so the comparison to your best is less certain.` });
  }
  if (oldPeak) {
    confounds.push({ code: "OLD_PEAK", label: `Your best window is roughly ${Math.round(bestAgeDays / 30)} months old; the realistic target above accounts for that.` });
  }
  const bestMonth = monthOf(midpoint(best.startDate, best.endDate));
  const curMonth = monthOf(midpoint(currentStart, lastDate));
  if ((SUMMER.has(bestMonth) && WINTER.has(curMonth)) || (WINTER.has(bestMonth) && SUMMER.has(curMonth))) {
    confounds.push({ code: "SEASONAL", label: "Your best window and now fall in different seasons, which can shift activity on its own - read the activity gap with that in mind." });
  }
  if (historySpanDays < cfg.WINDOW_DAYS * 2) {
    confounds.push({ code: "SHORT_HISTORY", label: "History is short, so your best window may overlap with now; the gap will sharpen as more data accrues." });
  }

  return {
    ok: true,
    config: cfg,
    today: lastDate,
    historyDays: rows.length,
    historySpanDays,
    firstDate,
    best: { ...best, score: round(best.score, 1), profile: bestProfile, ageDays: bestAgeDays, monthsAgo: Math.round(bestAgeDays / 30) },
    recentBest: recentBest ? { ...recentBest, score: round(recentBest.score, 1), profile: characterizeWindow(rows.filter((r) => r.date >= recentBest.startDate && r.date <= recentBest.endDate)), ageDays: daysBetween(recentBest.endDate, lastDate) } : null,
    current: { startDate: currentStart, endDate: lastDate, score: round(currentStats.score, 1), coverage: currentStats.coverage, profile: currentProfile },
    percentBack,
    atOrAboveBest,
    gaps,
    target,
    confounds,
  };
}
