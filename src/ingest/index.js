/* ------------------------------------------------------------------ */
/* ingest/index.js — public ingestion API                              */
/* ------------------------------------------------------------------ */
//
// ingestFiles(fileList, opts) -> {
//   records,        // canonical daily records (the downstream contract)
//   sources,        // [{source,label,records,fieldsContributed}]
//   parsedSets,     // per-file parse summaries (source, fileName, count, completeness)
//   provenance,     // Map(date -> {field: sourceId})
//   conflicts,      // cross-source disagreements
//   gapDays,        // calendar days with no record in the span
//   completeness,   // {coreField: 0..1} for the merged result
//   unmapped,       // tabular inputs no adapter claimed -> guided mapping
//   skipped,        // unrecognized inputs
//   warnings,       // [{file, message}]
// }
// Deterministic, client-side only. Never throws on a bad file (collects warnings).

import { ADAPTERS } from "./adapters/registry.js";
import { buildInputs, route } from "./router.js";
import { reconcile } from "./reconcile.js";

// Parse + reconcile a set of already-built inputs (text-based; used by tests and
// by ingestFiles after unzip/read).
export async function ingestInputs(inputs, opts = {}) {
  const adapters = opts.adapters || ADAPTERS;
  const { routed, unmapped, skipped } = route(inputs, adapters);
  const parsedSets = [];
  const warnings = [];
  for (const r of routed) {
    try {
      const res = await r.adapter.parse(r.input, opts.onProgress);
      parsedSets.push({
        source: r.adapter.id, label: r.adapter.label, fileName: r.input.name,
        confidence: r.confidence, records: res.records || [],
        completeness: res.completeness || {}, warnings: res.warnings || [],
      });
      for (const w of res.warnings || []) warnings.push({ file: r.input.name, message: w });
    } catch (e) {
      warnings.push({ file: r.input.name, message: "Failed to parse: " + (e && e.message || e) });
    }
  }
  const merged = reconcile(parsedSets, opts);
  return {
    records: merged.records,
    sources: merged.sources,
    parsedSets: parsedSets.map((p) => ({ source: p.source, label: p.label, fileName: p.fileName, count: p.records.length, completeness: p.completeness, confidence: p.confidence })),
    provenance: merged.provenance,
    conflicts: merged.conflicts,
    gapDays: merged.gapDays,
    completeness: merged.completeness,
    unmapped,
    skipped,
    warnings,
  };
}

// Ingest raw uploaded File objects (handles zips + multiple files).
export async function ingestFiles(fileList, opts = {}) {
  const inputs = await buildInputs(fileList);
  return ingestInputs(inputs, opts);
}

export { ADAPTERS } from "./adapters/registry.js";
export { inputFromText } from "./router.js";
export { reconcile } from "./reconcile.js";
