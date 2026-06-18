/* ------------------------------------------------------------------ */
/* ingest/schema.js — the CANONICAL contract (single source of truth)  */
/* ------------------------------------------------------------------ */
//
// Every adapter normalizes into this daily record shape. Downstream code
// (trends, brief, coach engine) consumes ONLY this schema, so it must not change
// shape without updating consumers. Pure + deterministic; no LLM, no network.

import Papa from "papaparse";

// Core daily signals the whole app reasons about.
export const CORE_FIELDS = [
  "resting_hr", "avg_hr", "steps", "exercise_minutes", "active_energy", "spo2", "sleep_hours", "workouts",
];
// Optional timing fields (used by the coach's sleep-consistency logic).
export const OPTIONAL_FIELDS = ["bedtime_min", "wake_min"];
// Everything an adapter may populate (besides `date`).
export const NUMERIC_FIELDS = [...CORE_FIELDS, ...OPTIONAL_FIELDS];

export const isNum = (v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));
export const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
export const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// A blank canonical record (all signals null) for a given ISO date.
export function emptyRecord(date) {
  const o = { date };
  for (const f of NUMERIC_FIELDS) o[f] = null;
  return o;
}

// Coerce a loose object (possibly with `Date`/string values) into a canonical
// record. Unknown keys are dropped; missing/blank/NaN -> null (never 0).
export function toCanonicalRecord(row) {
  const rawDate = row.date ?? row.Date;
  if (!rawDate) return null;
  const o = { date: String(rawDate).slice(0, 10) };
  for (const f of NUMERIC_FIELDS) {
    const v = row[f];
    o[f] = v === "" || v === undefined || v === null ? null : Number(v);
    if (Number.isNaN(o[f])) o[f] = null;
  }
  return o;
}

// Normalize an array of loose rows -> sorted canonical records (drops undated).
export function normalizeRecords(rows) {
  return (rows || [])
    .map(toCanonicalRecord)
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Fraction of records that have a non-null value for each core field (0..1).
export function completenessOf(records) {
  const out = {};
  const n = records.length || 1;
  for (const f of CORE_FIELDS) {
    out[f] = records.filter((r) => isNum(r[f])).length / n;
  }
  return out;
}

// Which core fields are present at all (>=1 non-null) vs entirely missing.
export function fieldPresence(records) {
  const present = [];
  const missing = [];
  for (const f of CORE_FIELDS) {
    (records.some((r) => isNum(r[f])) ? present : missing).push(f);
  }
  return { present, missing };
}

// Shared CSV parse (papaparse) used by several adapters.
export function parseCsvText(text) {
  return Papa.parse(String(text).trim(), { header: true, skipEmptyLines: true, dynamicTyping: true });
}

// Human labels for canonical fields (UI).
export const FIELD_LABELS = {
  date: "Date",
  resting_hr: "Resting HR",
  avg_hr: "Average HR",
  steps: "Steps",
  exercise_minutes: "Exercise minutes",
  active_energy: "Active energy",
  spo2: "Blood oxygen (SpO₂)",
  sleep_hours: "Sleep hours",
  workouts: "Workouts",
  bedtime_min: "Bedtime",
  wake_min: "Wake time",
};
