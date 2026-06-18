/* ------------------------------------------------------------------ */
/* adapters/_util.js — shared, pure helpers for source adapters        */
/* ------------------------------------------------------------------ */
import { NUMERIC_FIELDS } from "../schema.js";

// Best-effort conversion of any date-ish value to an ISO day (YYYY-MM-DD).
export function isoDay(value) {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value).trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    const ms = s.length >= 12 ? n : s.length >= 9 ? n * 1000 : null; // epoch ms vs s
    if (ms === null) return null;
    const d = new Date(ms);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const mdy = /^(\d{1,2})[/](\d{1,2})[/](\d{2,4})/.exec(s); // MM/DD/YY[YY]
  if (mdy) {
    let [, mo, d, y] = mdy;
    if (y.length === 2) y = "20" + y;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const t = new Date(s);
  return isNaN(t) ? null : t.toISOString().slice(0, 10);
}

// Pull the first present key from an object given candidate names (case-insensitive,
// punctuation-insensitive). Returns { key, value } or null.
export function pick(obj, candidates) {
  const norm = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, "");
  const map = {};
  for (const k of Object.keys(obj)) map[norm(k)] = k;
  for (const c of candidates) {
    const nk = norm(c);
    if (nk in map) return { key: map[nk], value: obj[map[nk]] };
  }
  // contains fallback
  for (const c of candidates) {
    const nc = norm(c);
    for (const nk of Object.keys(map)) if (nk.includes(nc)) return { key: map[nk], value: obj[map[nk]] };
  }
  return null;
}

// Per-day aggregator: collect values per (date, field), then finalize with a
// per-field reducer ("sum" default | "avg" | "min" | "max" | "last").
export function dayAgg() {
  const m = {};
  return {
    add(date, field, v) {
      if (!date || v === null || v === undefined || v === "" || !isFinite(Number(v))) return;
      (m[date] = m[date] || {});
      (m[date][field] = m[date][field] || []).push(Number(v));
    },
    has() { return Object.keys(m).length > 0; },
    finalize(reducers = {}) {
      const out = [];
      for (const date of Object.keys(m)) {
        const rec = { date };
        for (const f of NUMERIC_FIELDS) rec[f] = null;
        for (const [f, vals] of Object.entries(m[date])) {
          if (!vals.length) continue;
          const mode = reducers[f] || "sum";
          let v = mode === "avg" ? vals.reduce((a, b) => a + b, 0) / vals.length
            : mode === "min" ? Math.min(...vals)
            : mode === "max" ? Math.max(...vals)
            : mode === "last" ? vals[vals.length - 1]
            : vals.reduce((a, b) => a + b, 0);
          rec[f] = ["sleep_hours", "bedtime_min", "wake_min"].includes(f) ? Math.round(v * 10) / 10 : Math.round(v);
        }
        out.push(rec);
      }
      return out.sort((a, b) => a.date.localeCompare(b.date));
    },
  };
}

// Hours between two ISO/epoch timestamps (for sleep/exercise durations).
export function hoursBetween(start, end) {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!isFinite(a) || !isFinite(b) || b <= a) return null;
  return (b - a) / 3.6e6;
}

export function minutesBetween(start, end) {
  const h = hoursBetween(start, end);
  return h === null ? null : h * 60;
}
