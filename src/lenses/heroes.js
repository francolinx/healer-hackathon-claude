/* ------------------------------------------------------------------ */
/* lenses/heroes.js — deterministic condition "hero" computations      */
/* ------------------------------------------------------------------ */
//
// Each hero is a pure function (records, lens, options) -> facts, registered by
// heroSignal key. Facts share a common envelope so ONE brief renderer handles
// all conditions: { ok, heroSignal, title, summary, rows[], notes[], gaps[],
// disclaimer } plus condition-specific structured fields (for tests/future UI).
// Deterministic, non-diagnostic, robust to missing data, honest about what
// wearables can't capture. No LLM, no network.

import { registerHero } from "./heroRegistry.js";
import { HERO_SIGNALS } from "./schema.js";
import { COACH_DISCLAIMER } from "../coach.js";
import { toSeries, eventSeries, pearson, stdDev, laggedCorrelation, strengthLabel, addDays } from "./correlation.js";

const isNum = (v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round = (v, d = 0) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);
const sortRecs = (records) => (records || []).filter((r) => r && r.date).slice().sort((a, b) => a.date.localeCompare(b.date));

// Recent-vs-baseline mean for a key (recent = last `days`, baseline = before that).
function recentVsBaseline(recs, key, today, days = 30) {
  const recent = recs.filter((r) => daysBetween(r.date, today) < days).map((r) => r[key]).filter(isNum).map(Number);
  const baseline = recs.filter((r) => daysBetween(r.date, today) >= days).map((r) => r[key]).filter(isNum).map(Number);
  const rm = mean(recent), bm = baseline.length ? mean(baseline) : median(recent);
  if (rm === null || bm === null) return null;
  const deltaPct = bm !== 0 ? ((rm - bm) / Math.abs(bm)) * 100 : null;
  return { recent: round(rm, 0), baseline: round(bm, 0), delta: round(rm - bm, 1), deltaPct: round(deltaPct, 0), nRecent: recent.length, nBaseline: baseline.length };
}

/* ---------------- POTS / dysautonomia: HR patterns + tolerance ----- */
export function potsHero(records, lens, options = {}) {
  const recs = sortRecs(records);
  const out = { ok: false, heroSignal: HERO_SIGNALS.ORTHOSTATIC_HR, title: "Heart-rate patterns & activity tolerance", rows: [], notes: [], gaps: [], disclaimer: COACH_DISCLAIMER };
  if (recs.length < 14) { out.summary = "Need about two weeks of data to characterize heart-rate patterns."; out.reason = out.summary; return out; }
  const today = options.today || recs[recs.length - 1].date;

  const restingRecent = recs.filter((r) => daysBetween(r.date, today) < 30).map((r) => r.resting_hr).filter(isNum).map(Number);
  const useAvgFallback = restingRecent.length < 8;
  const hrKey = useAvgFallback ? "avg_hr" : "resting_hr";
  if (useAvgFallback) out.notes.push("Resting heart rate was sparse, so average heart rate was used for these indicators.");

  // Resting (or avg) HR elevation vs baseline.
  const elev = recentVsBaseline(recs, hrKey, today, 30);
  if (elev) out.rows.push({ key: "hr_elevation", label: `${useAvgFallback ? "Average" : "Resting"} HR vs baseline`, value: `${elev.delta > 0 ? "+" : ""}${elev.delta} bpm`, detail: `recent ${elev.recent} vs baseline ${elev.baseline} bpm` });

  // Day-to-day instability (SD) over the recent window.
  const recentHr = recs.filter((r) => daysBetween(r.date, today) < 30).map((r) => r[hrKey]).filter(isNum).map(Number);
  const sd = stdDev(recentHr);
  if (sd !== null) out.rows.push({ key: "hr_instability", label: "Day-to-day HR variability (recent)", value: `${round(sd, 1)} bpm SD`, detail: `over ${recentHr.length} recent days` });

  // Activity <-> heart-rate coupling (same day).
  const coupling = laggedCorrelation(toSeries(recs, "steps"), toSeries(recs, hrKey), { lags: [0], minPairs: 8 });
  if (coupling.best) out.rows.push({ key: "activity_hr_coupling", label: "Activity ↔ heart-rate coupling", value: `r=${round(coupling.best.r, 2)}`, detail: `${strengthLabel(coupling.best.r)}, steps vs ${hrKey.replace("_", " ")}, n=${coupling.best.n}` });

  // Activity tolerance over time (steps).
  const tol = recentVsBaseline(recs, "steps", today, 30);
  const activityTolerance = tol ? { recent: tol.recent, baseline: tol.baseline, deltaPct: tol.deltaPct, direction: tol.deltaPct === null ? "unknown" : tol.deltaPct < -10 ? "declining" : tol.deltaPct > 10 ? "improving" : "stable" } : null;
  if (activityTolerance) out.rows.push({ key: "activity_tolerance", label: "Activity tolerance (steps/day)", value: `${activityTolerance.recent} vs ${activityTolerance.baseline}`, detail: `${activityTolerance.deltaPct > 0 ? "+" : ""}${activityTolerance.deltaPct}% vs baseline — ${activityTolerance.direction}` });

  // Honest limitation: standing HR change isn't in wearable exports.
  out.gaps.push("Standing (orthostatic) heart-rate change — the core POTS pattern — is not in consumer wearable exports, so it cannot be computed here. The indicators above are wearable-derivable proxies only.");
  if (!restingRecent.length && useAvgFallback) out.gaps.push("Resting heart rate was unavailable; consider a device/app that records it for better POTS context.");

  out.ok = out.rows.length > 0;
  out.activityTolerance = activityTolerance;
  out.hrKeyUsed = hrKey;
  out.summary = out.ok
    ? "Wearable-derivable heart-rate patterns and activity tolerance (not a substitute for an in-clinic orthostatic test)."
    : "Not enough heart-rate data to characterize patterns this period.";
  return out;
}

/* ---------------- shared trigger<->event correlation (migraine, lyme) */
function bedtimeDeviationSeries(recs) {
  const beds = recs.map((r) => r.bedtime_min).filter(isNum).map(Number);
  const med = median(beds);
  const m = new Map();
  if (med === null) return m;
  for (const r of recs) if (isNum(r.bedtime_min)) m.set(r.date, Math.abs(Number(r.bedtime_min) - med));
  return m;
}

function attackStats(log, span) {
  const entries = (log || []).filter((e) => e && e.date);
  const count = entries.length;
  const spanDays = span.first && span.last ? Math.max(1, daysBetween(span.first, span.last) + 1) : 30;
  const perMonth = round((count / spanDays) * 30, 1);
  const sevs = entries.map((e) => e.severity).filter(isNum).map(Number);
  let severityTrend = null;
  if (sevs.length >= 4) {
    const half = Math.floor(sevs.length / 2);
    const earlier = mean(sevs.slice(0, half)), later = mean(sevs.slice(half));
    severityTrend = round(later - earlier, 1);
  }
  return { count, perMonth, spanDays, avgSeverity: sevs.length ? round(mean(sevs), 1) : null, severityTrend };
}

function triggerCorrelationFacts(records, options, cfg) {
  const recs = sortRecs(records);
  const out = { ok: false, heroSignal: cfg.heroSignal, title: cfg.title, rows: [], notes: [], gaps: [], disclaimer: COACH_DISCLAIMER, associations: [] };
  if (!recs.length) { out.summary = "No wearable data available."; out.reason = out.summary; return out; }
  const today = options.today || recs[recs.length - 1].date;
  const span = { first: recs[0].date, last: today };
  const log = (options.symptomLog || []).filter((e) => e && e.date);

  // Candidate trigger series from wearables (+ irregular bedtime).
  const triggers = cfg.triggers
    .map((t) => ({ ...t, series: t.key === "bedtime_dev" ? bedtimeDeviationSeries(recs) : toSeries(recs, t.key) }))
    .filter((t) => t.series.size >= 6);
  // Logged factors (binary) as additional triggers, if provided.
  for (const [factorId, dates] of Object.entries(groupFactorLog(options.factorLog))) {
    triggers.push({ key: "factor:" + factorId, label: factorId, series: eventSeries(dates.map((d) => ({ date: d })), span) });
  }

  if (!log.length) {
    out.needsLog = true;
    out.reason = `Log your ${cfg.eventNoun} (date${cfg.severity ? " + severity" : ""}) to surface ${cfg.eventNoun}-specific triggers — wearable trends alone can't identify ${cfg.eventNoun}.`;
    out.summary = out.reason;
    // Honest, useful fallback: wearable self-patterns that commonly precede flares.
    out.proxyPatterns = proxyPatterns(recs);
    if (out.proxyPatterns.length) out.notes.push("No log yet — showing wearable patterns (e.g. short sleep → next-day elevated resting HR) that commonly precede symptoms. These are not trigger correlations.");
    return out;
  }

  const attacks = eventSeries(log, span);
  const assoc = triggers.map((t) => {
    const { best } = laggedCorrelation(t.series, attacks, { lags: cfg.lags || [0, 1, 2], minPairs: cfg.minPairs ?? 6 });
    if (!best) return { trigger: t.key, label: t.label, r: null, n: 0, note: "insufficient overlapping days" };
    return { trigger: t.key, label: t.label, lag: best.lag, r: round(best.r, 2), n: best.n, strength: strengthLabel(best.r),
      direction: best.r >= 0 ? "more/higher → more " + cfg.eventNoun : "less/lower → more " + cfg.eventNoun };
  });
  const ranked = assoc.filter((a) => a.r !== null).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  out.associations = ranked;
  out.rows = ranked.slice(0, 5).map((a) => ({ key: a.trigger, label: a.label, value: `r=${a.r} (lag ${a.lag}d)`, detail: `${a.strength}, ${a.direction}, n=${a.n}` }));
  out.attacks = attackStats(log, span);
  out.rows.unshift({ key: "freq", label: cfg.eventNoun[0].toUpperCase() + cfg.eventNoun.slice(1) + " frequency", value: `${out.attacks.perMonth}/month`, detail: `${out.attacks.count} logged${out.attacks.avgSeverity !== null ? `, avg severity ${out.attacks.avgSeverity}` : ""}${out.attacks.severityTrend !== null ? `, severity ${out.attacks.severityTrend > 0 ? "rising" : out.attacks.severityTrend < 0 ? "easing" : "flat"}` : ""}` });
  if (!ranked.length) out.gaps.push("Not enough overlapping days between triggers and " + cfg.eventNoun + " to compute associations yet.");
  out.gaps.push("These are observed associations over time, not proven causes; confirm patterns with your clinician.");
  out.ok = true;
  out.summary = ranked.length
    ? `Strongest observed association: ${ranked[0].label.toLowerCase()} (${ranked[0].strength}, lag ${ranked[0].lag}d). Associations, not causes.`
    : `Logged ${out.attacks.count} ${cfg.eventNoun}; need more overlapping data to rank triggers.`;
  return out;
}

function groupFactorLog(factorLog) {
  const g = {};
  for (const e of factorLog || []) { if (!e || !e.date || !e.factor) continue; (g[e.factor] = g[e.factor] || []).push(e.date.slice(0, 10)); }
  return g;
}

// Wearable self-patterns (no symptom log needed): short sleep -> next-day RHR, etc.
function proxyPatterns(recs) {
  const out = [];
  const sleepVsNextRhr = laggedCorrelation(toSeries(recs, "sleep_hours"), toSeries(recs, "resting_hr"), { lags: [1], minPairs: 8 });
  if (sleepVsNextRhr.best) out.push({ label: "Sleep → next-day resting HR", r: round(sleepVsNextRhr.best.r, 2), n: sleepVsNextRhr.best.n, strength: strengthLabel(sleepVsNextRhr.best.r) });
  const stepsVsNextRhr = laggedCorrelation(toSeries(recs, "steps"), toSeries(recs, "resting_hr"), { lags: [1], minPairs: 8 });
  if (stepsVsNextRhr.best) out.push({ label: "Activity → next-day resting HR", r: round(stepsVsNextRhr.best.r, 2), n: stepsVsNextRhr.best.n, strength: strengthLabel(stepsVsNextRhr.best.r) });
  return out;
}

export function migraineHero(records, lens, options = {}) {
  return triggerCorrelationFacts(records, options, {
    heroSignal: HERO_SIGNALS.TRIGGER_CORRELATION,
    title: "Likely triggers & attack patterns",
    eventNoun: "attacks", severity: true, lags: [0, 1, 2], minPairs: 6,
    triggers: [
      { key: "sleep_hours", label: "Sleep duration" },
      { key: "bedtime_dev", label: "Irregular bedtime" },
      { key: "resting_hr", label: "Resting heart rate" },
      { key: "steps", label: "Activity (steps)" },
    ],
  });
}

export function lymeHero(records, lens, options = {}) {
  return triggerCorrelationFacts(records, options, {
    heroSignal: HERO_SIGNALS.SYMPTOM_FLARE_LOAD,
    title: "Flare patterns & load",
    eventNoun: "flares", severity: true, lags: [0, 1, 2], minPairs: 6,
    triggers: [
      { key: "steps", label: "Exertion (steps)" },
      { key: "exercise_minutes", label: "Exercise minutes" },
      { key: "sleep_hours", label: "Sleep duration" },
      { key: "resting_hr", label: "Resting heart rate" },
    ],
  });
}

/* ---------------- long COVID / ME-CFS: PEM load (exertion -> recovery) */
export function pemHero(records, lens, options = {}) {
  const recs = sortRecs(records);
  const out = { ok: false, heroSignal: HERO_SIGNALS.PEM_LOAD, title: "Exertion vs recovery (PEM proxy)", rows: [], notes: [], gaps: [], disclaimer: COACH_DISCLAIMER };
  if (recs.length < 14) { out.summary = "Need about two weeks of data to look at exertion vs recovery."; out.reason = out.summary; return out; }
  const today = options.today || recs[recs.length - 1].date;
  const exertion = toSeries(recs, "exercise_minutes").size >= 8 ? toSeries(recs, "exercise_minutes") : toSeries(recs, "steps");
  const exertionLabel = toSeries(recs, "exercise_minutes").size >= 8 ? "exercise minutes" : "steps";
  const pem = laggedCorrelation(exertion, toSeries(recs, "resting_hr"), { lags: [1], minPairs: 8 });
  if (pem.best) {
    out.rows.push({ key: "pem", label: "Exertion → next-day resting HR", value: `r=${round(pem.best.r, 2)}`, detail: `${strengthLabel(pem.best.r)}, ${exertionLabel} today vs resting HR tomorrow, n=${pem.best.n}` });
    out.pemIndicator = { r: round(pem.best.r, 2), n: pem.best.n, lag: 1, direction: pem.best.r >= 0 ? "more exertion → higher next-day resting HR" : "more exertion → lower next-day resting HR" };
  }
  const tol = recentVsBaseline(recs, "steps", today, 30);
  if (tol) { out.activityTolerance = { recent: tol.recent, baseline: tol.baseline, deltaPct: tol.deltaPct }; out.rows.push({ key: "tolerance", label: "Activity tolerance (steps/day)", value: `${tol.recent} vs ${tol.baseline}`, detail: `${tol.deltaPct > 0 ? "+" : ""}${tol.deltaPct}% vs baseline` }); }
  out.notes.push("PEM is symptom-defined; an elevated next-day resting heart rate after exertion is a physiological proxy, not a diagnosis.");
  out.gaps.push("Post-exertional malaise also involves cognitive exertion and symptom severity, which wearables don't capture.");
  out.ok = out.rows.length > 0;
  out.summary = out.ok ? "Whether higher-exertion days are followed by poorer next-day recovery." : "Not enough exertion/recovery data this period.";
  return out;
}

// Register all four (idempotent on import).
registerHero(HERO_SIGNALS.ORTHOSTATIC_HR, potsHero);
registerHero(HERO_SIGNALS.TRIGGER_CORRELATION, migraineHero);
registerHero(HERO_SIGNALS.SYMPTOM_FLARE_LOAD, lymeHero);
registerHero(HERO_SIGNALS.PEM_LOAD, pemHero);
