/* ------------------------------------------------------------------ */
/* adapter: Google Fit via Google Takeout (Fit/)   NEEDS VALIDATION    */
/* ------------------------------------------------------------------ */
//
// Takeout's "Fit/Daily activity metrics" CSVs: either one aggregate file with a
// Date column, or one file per day named YYYY-MM-DD.csv (date from the filename).
// Columns vary by locale/version; we match by fuzzy header name. We prefer the
// daily aggregates over the giant All-Data JSON. Best-effort + guided-mapping net.

import { completenessOf, parseCsvText } from "../schema.js";
import { isoDay, pick, dayAgg } from "./_util.js";

const NEEDS_VALIDATION = "Google Fit (Takeout) adapter is best-effort and NEEDS VALIDATION against a real export (see ADAPTERS.md).";

export const googleFitAdapter = {
  id: "googleFit",
  label: "Google Fit (Takeout)",
  detect(input) {
    if (!["csv", "tsv"].includes(input.ext)) return 0;
    const name = (input.name || "").toLowerCase();
    const head = input.head || "";
    if (/daily activity metrics|takeout\/fit|\/fit\//i.test(name)) return 0.9;
    if (/move minutes|heart points|average heart rate \(bpm\)|step count/i.test(head)) return 0.88;
    return 0;
  },
  async parse(input) {
    const res = parseCsvText(input.text);
    const rows = res.data || [];
    const agg = dayAgg();
    // Per-day files carry no Date column -> derive the date from the filename.
    const base = (input.name || "").split("/").pop() || "";
    const fileDate = isoDay((base.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || "");

    for (const r of rows) {
      const dateCell = pick(r, ["Date", "Day", "date"]);
      const date = isoDay(dateCell ? dateCell.value : null) || fileDate;
      if (!date) continue;
      const num = (cands) => { const p = pick(r, cands); return p ? Number(p.value) : NaN; };
      agg.add(date, "steps", num(["Step count", "Steps"]));
      agg.add(date, "active_energy", num(["Calories (kcal)", "Calories", "Energy (kcal)"]));
      agg.add(date, "exercise_minutes", num(["Move Minutes count", "Move minutes", "Active minutes"]));
      agg.add(date, "avg_hr", num(["Average heart rate (bpm)", "Average heart rate"]));
      agg.add(date, "resting_hr", num(["Min heart rate (bpm)", "Minimum heart rate"])); // approx resting from daily min
    }
    const records = agg.finalize({ steps: "sum", active_energy: "sum", exercise_minutes: "sum", avg_hr: "avg", resting_hr: "min" });
    return { records, provenance: { source: this.id }, completeness: completenessOf(records), warnings: records.length ? [NEEDS_VALIDATION] : ["No Google Fit daily-metric rows recognized in this file."] };
  },
};
