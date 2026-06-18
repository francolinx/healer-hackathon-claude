/* ------------------------------------------------------------------ */
/* ingest/reconcile.js — merge records across sources/files by date    */
/* ------------------------------------------------------------------ */
//
// Deterministic merge: group by date; for each canonical field, keep the value
// from the highest-priority source that has it (configurable order), tag
// provenance so every value traces to its source, dedupe, and flag cross-source
// conflicts + gaps. Absent signals stay null (never 0). Pure, no LLM.

import { NUMERIC_FIELDS, CORE_FIELDS, emptyRecord, isNum, completenessOf } from "./schema.js";

// Default source priority, highest trust first. Configurable via opts.priority.
export const DEFAULT_PRIORITY = [
  "appleHealth", "healthConnect", "garmin", "fitbit", "samsungHealth", "googleFit",
  "genericJson", "genericCsv", "guidedMapping",
];

// Is the difference between two numbers a real conflict (not rounding noise)?
function conflicts(a, b) {
  if (!isNum(a) || !isNum(b)) return false;
  const diff = Math.abs(a - b);
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return diff / scale > 0.2 && diff > 0.5;
}

export function reconcile(parsedSets, opts = {}) {
  const priority = opts.priority || DEFAULT_PRIORITY;
  const rank = (id) => { const i = priority.indexOf(id); return i === -1 ? priority.length : i; };
  const avgCompleteness = (set) => {
    const c = set.completeness || {};
    const vals = CORE_FIELDS.map((f) => c[f] || 0);
    return vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  };

  // Highest priority first; tie-break by completeness then filename (stable).
  const sets = parsedSets.filter((s) => s && s.records && s.records.length).slice().sort(
    (a, b) => rank(a.source) - rank(b.source) || avgCompleteness(b) - avgCompleteness(a) || String(a.fileName).localeCompare(String(b.fileName))
  );

  const byDate = new Map();
  const prov = new Map(); // date -> { field: sourceId }
  const conflictList = [];
  const perSource = {}; // sourceId -> { fields: n, records: Set(dates) }

  for (const set of sets) {
    const src = set.source;
    perSource[src] = perSource[src] || { source: src, label: set.label || src, fieldsContributed: 0, dates: new Set() };
    for (const rec of set.records) {
      if (!rec || !rec.date) continue;
      if (!byDate.has(rec.date)) { byDate.set(rec.date, emptyRecord(rec.date)); prov.set(rec.date, {}); }
      const target = byDate.get(rec.date);
      const pmap = prov.get(rec.date);
      let contributed = false;
      for (const f of NUMERIC_FIELDS) {
        const v = rec[f];
        if (!isNum(v)) continue;
        if (!isNum(target[f])) {
          target[f] = Number(v);
          pmap[f] = src;
          contributed = true;
        } else if (pmap[f] !== src && conflicts(target[f], Number(v))) {
          conflictList.push({ date: rec.date, field: f, kept: { source: pmap[f], value: target[f] }, other: { source: src, value: Number(v) } });
        }
      }
      if (contributed) perSource[src].dates.add(rec.date);
    }
  }

  const records = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  // Count fields each source actually won.
  for (const [, pmap] of prov) {
    for (const f of NUMERIC_FIELDS) {
      const s = pmap[f];
      if (s && perSource[s]) perSource[s].fieldsContributed += 1;
    }
  }

  // Gaps: calendar days within the span that have no record at all.
  let gapDays = 0;
  if (records.length) {
    const first = new Date(records[0].date + "T00:00:00Z");
    const last = new Date(records[records.length - 1].date + "T00:00:00Z");
    const span = Math.round((last - first) / 86400000) + 1;
    gapDays = Math.max(0, span - records.length);
  }

  const sources = Object.values(perSource).map((s) => ({
    source: s.source, label: s.label, records: s.dates.size, fieldsContributed: s.fieldsContributed,
  }));

  return {
    records,
    provenance: prov, // Map(date -> {field: source})
    conflicts: conflictList,
    sources,
    gapDays,
    completeness: completenessOf(records),
  };
}
