/* ------------------------------------------------------------------ */
/* adapter: generic JSON (canonical records)  (VALIDATED)              */
/* ------------------------------------------------------------------ */
//
// JSON that is already an array of canonical daily records, or { records: [...] }
// / { data: [...] }. Source-specific JSON adapters (Fitbit, Garmin, Health
// Connect) detect higher and win.

import { normalizeRecords, completenessOf, NUMERIC_FIELDS } from "../schema.js";

export const genericJsonAdapter = {
  id: "genericJson",
  label: "JSON (canonical records)",
  detect(input) {
    if (input.ext !== "json") return 0;
    const head = input.head || "";
    if (!/"date"/.test(head)) return 0;
    const known = NUMERIC_FIELDS.filter((f) => new RegExp('"' + f + '"').test(head)).length;
    return known >= 2 ? 0.8 : known >= 1 ? 0.5 : 0.3;
  },
  async parse(input) {
    let arr = [];
    try {
      const data = JSON.parse(input.text);
      arr = Array.isArray(data) ? data : data.records || data.data || [];
    } catch (e) {
      return { records: [], provenance: { source: "genericJson" }, completeness: {}, warnings: ["Could not parse JSON: " + e.message] };
    }
    const records = normalizeRecords(arr);
    const warnings = records.length ? [] : ["No dated records found in this JSON."];
    return { records, provenance: { source: "genericJson" }, completeness: completenessOf(records), warnings };
  },
};
