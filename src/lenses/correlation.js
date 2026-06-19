/* ------------------------------------------------------------------ */
/* lenses/correlation.js — deterministic lagged correlation engine     */
/* ------------------------------------------------------------------ */
//
// Pure, auditable, LLM-free. Used by condition heroes to surface OBSERVED
// associations (e.g. short sleep today -> migraine tomorrow). Reports the Pearson
// r at each lag with the pair count, so every association traces to N data points.
// Never claims causation; the UI frames these as associations, not diagnoses.

const toUTC = (s) => new Date(s + "T00:00:00Z");
const dayStr = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = toUTC(s); d.setUTCDate(d.getUTCDate() + n); return dayStr(d); };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const isNum = (v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));

// Build a date->value Map for a canonical signal key (skips missing days).
export function toSeries(records, key) {
  const m = new Map();
  for (const r of records || []) if (isNum(r[key])) m.set(r.date, Number(r[key]));
  return m;
}

// Build a binary date->1 Map of event days from a log of { date } entries,
// restricted to a [first,last] span. Optionally fill non-event days as 0 across
// the span so a correlation "sees" the zeros (point-biserial).
export function eventSeries(log, span) {
  const days = new Set((log || []).filter((e) => e && e.date).map((e) => e.date.slice(0, 10)));
  const m = new Map();
  if (span && span.first && span.last) {
    for (let d = span.first; d <= span.last; d = addDays(d, 1)) m.set(d, days.has(d) ? 1 : 0);
  } else {
    for (const d of days) m.set(d, 1);
  }
  return m;
}

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx === 0 || syy === 0) return null; // no variance -> undefined correlation
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

export function stdDev(vals) {
  if (vals.length < 2) return null;
  const m = mean(vals);
  return Math.sqrt(mean(vals.map((v) => (v - m) ** 2)));
}

// Align x at date d with y at date d+lag (lag>=0: x precedes/leads y by `lag` days).
export function alignedPairs(xSeries, ySeries, lag) {
  const xs = [], ys = [];
  for (const [date, xv] of xSeries) {
    const yd = lag === 0 ? date : addDays(date, lag);
    if (ySeries.has(yd)) { xs.push(xv); ys.push(ySeries.get(yd)); }
  }
  return { xs, ys };
}

// Correlate x against y across several lags; return the strongest (by |r|) lag
// meeting the min-pairs guard, plus every lag's r/n for auditing.
export function laggedCorrelation(xSeries, ySeries, opts = {}) {
  const lags = opts.lags || [0, 1, 2];
  const minPairs = opts.minPairs ?? 8;
  const all = lags.map((lag) => {
    const { xs, ys } = alignedPairs(xSeries, ySeries, lag);
    const r = xs.length >= minPairs ? pearson(xs, ys) : null;
    return { lag, r, n: xs.length };
  });
  const valid = all.filter((a) => a.r !== null);
  const best = valid.length ? valid.reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a)) : null;
  return { best, all };
}

// Qualitative strength label for |r| (presentation only; not a p-value).
export function strengthLabel(r) {
  const a = Math.abs(r);
  if (a >= 0.5) return "strong";
  if (a >= 0.3) return "moderate";
  if (a >= 0.15) return "weak";
  return "negligible";
}
