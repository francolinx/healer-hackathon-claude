/* ------------------------------------------------------------------ */
/* adapter: generic CSV (canonical column names)  (VALIDATED)          */
/* ------------------------------------------------------------------ */
//
// Tabular files whose headers already match the canonical schema (date,
// resting_hr, steps, sleep_hours, ...). This is the lowest-priority tabular
// adapter; source-specific CSV adapters (Samsung, Google Fit) detect higher and
// win. Anything tabular this can't confidently map routes to guided mapping.

import { parseCsvText, normalizeRecords, completenessOf, NUMERIC_FIELDS } from "../schema.js";

const CANON = new Set(["date", ...NUMERIC_FIELDS]);

export const genericCsvAdapter = {
  id: "genericCsv",
  label: "CSV (canonical columns)",
  detect(input) {
    if (!["csv", "tsv", "txt"].includes(input.ext)) return 0;
    const head = (input.head || "").split(/\r?\n/)[0] || "";
    const cols = head.split(/[,\t;]/).map((c) => c.trim().toLowerCase().replace(/^"|"$/g, ""));
    if (!cols.includes("date")) return 0;
    const known = cols.filter((c) => CANON.has(c)).length;
    if (known >= 3) return 0.85; // date + >=2 canonical signals
    if (known >= 2) return 0.55;
    return 0; // tabular but not our schema -> guided mapping
  },
  async parse(input) {
    const res = parseCsvText(input.text);
    const records = normalizeRecords(res.data);
    const warnings = records.length ? [] : ["No dated rows found in this CSV."];
    return { records, provenance: { source: "genericCsv" }, completeness: completenessOf(records), warnings };
  },
};
