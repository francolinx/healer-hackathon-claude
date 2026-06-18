/* ------------------------------------------------------------------ */
/* adapter: Garmin Connect account export (DI_CONNECT zip)  NEEDS VALIDATION */
/* ------------------------------------------------------------------ */
//
// Garmin's "Export Your Data" is a zip of JSON. Daily-summary files contain
// arrays of objects keyed by calendarDate with totalSteps / restingHeartRate /
// activeKilocalories / intensity minutes; sleep files carry sleep duration.
// Field names vary across files, so we match by fuzzy name. Best-effort + net.

import { completenessOf } from "../schema.js";
import { isoDay, pick, dayAgg } from "./_util.js";

const NEEDS_VALIDATION = "Garmin adapter is best-effort and NEEDS VALIDATION against a real export (see ADAPTERS.md).";

export const garminAdapter = {
  id: "garmin",
  label: "Garmin Connect",
  detect(input) {
    if (input.ext !== "json") return 0;
    const name = (input.name || "").toLowerCase();
    const head = input.head || "";
    if (/di[_-]?connect|garmin/.test(name)) return 0.9;
    if (/"calendarDate"/.test(head) && /"(totalSteps|restingHeartRate|activeKilocalories)"/.test(head)) return 0.85;
    return 0;
  },
  async parse(input) {
    let data;
    try { data = JSON.parse(input.text); }
    catch (e) { return { records: [], provenance: { source: this.id }, completeness: {}, warnings: ["Could not parse JSON: " + e.message] }; }
    // Garmin nests arrays in various ways; flatten one level of array/objects.
    let arr = Array.isArray(data) ? data : data.records || data.data || [];
    if (!Array.isArray(arr)) arr = [arr];
    const agg = dayAgg();

    for (const r of arr) {
      if (!r || typeof r !== "object") continue;
      const dp = pick(r, ["calendarDate", "calendar_date", "date"]);
      const date = dp ? isoDay(dp.value) : null;
      if (!date) continue;
      const num = (cands) => { const p = pick(r, cands); return p ? Number(p.value) : NaN; };
      agg.add(date, "steps", num(["totalSteps", "steps"]));
      agg.add(date, "resting_hr", num(["restingHeartRate", "restingHeartRateInBeatsPerMinute", "resting_heart_rate"]));
      agg.add(date, "avg_hr", num(["averageHeartRate", "avgHeartRate"]));
      agg.add(date, "active_energy", num(["activeKilocalories", "activeCalories", "active_calories"]));
      const mod = num(["moderateIntensityMinutes", "moderateIntensityDurationInMinutes"]);
      const vig = num(["vigorousIntensityMinutes", "vigorousIntensityDurationInMinutes"]);
      if (isFinite(mod) || isFinite(vig)) agg.add(date, "exercise_minutes", (isFinite(mod) ? mod : 0) + (isFinite(vig) ? vig : 0));
      const sleepSec = num(["sleepTimeSeconds", "sleepingSeconds", "measurableAwakeDuration", "totalSleepSeconds"]);
      if (isFinite(sleepSec)) agg.add(date, "sleep_hours", sleepSec / 3600);
    }
    const records = agg.finalize({ steps: "max", resting_hr: "avg", avg_hr: "avg", active_energy: "max", exercise_minutes: "max", sleep_hours: "max" });
    return { records, provenance: { source: this.id }, completeness: completenessOf(records), warnings: records.length ? [NEEDS_VALIDATION] : ["No Garmin daily-summary records recognized in this file."] };
  },
};
