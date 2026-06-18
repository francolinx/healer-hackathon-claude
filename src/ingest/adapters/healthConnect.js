/* ------------------------------------------------------------------ */
/* adapter: Health Connect (Android)   NEEDS VALIDATION                */
/* ------------------------------------------------------------------ */
//
// Android's unified health store. There is no single official user-facing text
// export; third-party exporters emit JSON. We target a plausible shape: an array
// of records (or { records: [...] }) each with a recordType/dataType, a
// start/time, and type-specific value fields. Aggregates to canonical days.
// Field names vary across exporters, so this is best-effort + guided-mapping net.

import { completenessOf } from "../schema.js";
import { isoDay, pick, dayAgg, hoursBetween } from "./_util.js";

const NEEDS_VALIDATION = "Health Connect adapter is best-effort and NEEDS VALIDATION against a real export (see ADAPTERS.md).";

export const healthConnectAdapter = {
  id: "healthConnect",
  label: "Health Connect (Android)",
  detect(input) {
    if (input.ext !== "json") return 0;
    const name = (input.name || "").toLowerCase();
    const head = input.head || "";
    if (/health[_ ]?connect/.test(name)) return 0.9;
    if (/androidx\.health/.test(head)) return 0.85;
    if (/("recordType"|"dataType")/.test(head) && /"(startTime|time)"/.test(head)) return 0.7;
    return 0;
  },
  async parse(input) {
    let data;
    try { data = JSON.parse(input.text); }
    catch (e) { return { records: [], provenance: { source: this.id }, completeness: {}, warnings: ["Could not parse JSON: " + e.message] }; }
    const recs = Array.isArray(data) ? data : data.records || data.data || [];
    const agg = dayAgg();
    const num = (r, cands) => { const p = pick(r, cands); if (!p) return NaN; const v = p.value; if (v && typeof v === "object") { const q = pick(v, ["inKilocalories", "kilocalories", "kcal", "value", "beatsPerMinute"]); return q ? Number(q.value) : NaN; } return Number(v); };

    for (const r of recs) {
      if (!r || typeof r !== "object") continue;
      const type = String(r.recordType || r.dataType || r.type || "").toLowerCase();
      const start = (pick(r, ["startTime", "time", "startDate", "instant"]) || {}).value;
      const end = (pick(r, ["endTime", "endDate"]) || {}).value;
      const date = isoDay(start);
      if (!date && !/sleep/.test(type)) continue;
      if (/step/.test(type)) agg.add(date, "steps", num(r, ["count", "steps", "value"]));
      else if (/restingheartrate/.test(type)) agg.add(date, "resting_hr", num(r, ["beatsPerMinute", "bpm", "value"]));
      else if (/heartrate/.test(type)) {
        const samples = r.samples || r.values;
        if (Array.isArray(samples)) for (const s of samples) agg.add(date, "avg_hr", num(s, ["beatsPerMinute", "bpm", "value"]));
        else agg.add(date, "avg_hr", num(r, ["beatsPerMinute", "bpm", "value"]));
      } else if (/oxygen|spo2/.test(type)) agg.add(date, "spo2", num(r, ["percentage", "value"]));
      else if (/activecalories|activeenergy|caloriesburned|totalcalories/.test(type)) agg.add(date, "active_energy", num(r, ["energy", "kilocalories", "kcal", "calories", "value"]));
      else if (/sleep/.test(type)) { const h = hoursBetween(start, end); const wakeDate = isoDay(end) || date; if (h) agg.add(wakeDate, "sleep_hours", h); }
      else if (/exercise|workout/.test(type)) { const h = hoursBetween(start, end); if (h) agg.add(date, "exercise_minutes", h * 60); agg.add(date, "workouts", 1); }
    }

    const records = agg.finalize({ resting_hr: "avg", avg_hr: "avg", spo2: "avg", steps: "sum", active_energy: "sum", sleep_hours: "sum", exercise_minutes: "sum", workouts: "sum" });
    return { records, provenance: { source: this.id }, completeness: completenessOf(records), warnings: records.length ? [NEEDS_VALIDATION] : ["No Health Connect records recognized in this file."] };
  },
};
