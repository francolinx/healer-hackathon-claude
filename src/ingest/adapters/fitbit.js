/* ------------------------------------------------------------------ */
/* adapter: Fitbit JSON export (Takeout / Fitbit export)  NEEDS VALIDATION */
/* ------------------------------------------------------------------ */
//
// Fitbit exports many dated JSON files. We branch on the filename:
//   resting_heart_rate-*.json -> [{dateTime, value:{date,value}}]  (resting_hr)
//   steps-*.json / calories-*.json -> [{dateTime:"MM/DD/YY HH:mm:ss", value}] (sum/day)
//   sleep-*.json -> [{dateOfSleep, minutesAsleep, startTime, endTime}]
//   heart_rate-*.json -> intraday samples (avg_hr)
//   *active_minutes*.json -> exercise_minutes
// Best-effort + guided-mapping net.

import { completenessOf } from "../schema.js";
import { isoDay, dayAgg } from "./_util.js";

const NEEDS_VALIDATION = "Fitbit adapter is best-effort and NEEDS VALIDATION against a real export (see ADAPTERS.md).";

const bedMin = (ts) => { const m = /T(\d{2}):(\d{2})/.exec(String(ts)) || /\s(\d{2}):(\d{2})/.exec(String(ts)); if (!m) return null; const h = +m[1], mm = +m[2]; return ((h + 12) % 24) * 60 + mm; };
const wakeMin = (ts) => { const m = /T(\d{2}):(\d{2})/.exec(String(ts)) || /\s(\d{2}):(\d{2})/.exec(String(ts)); if (!m) return null; return +m[1] * 60 + +m[2]; };

export const fitbitAdapter = {
  id: "fitbit",
  label: "Fitbit",
  detect(input) {
    if (input.ext !== "json") return 0;
    const name = (input.name || "").toLowerCase();
    const head = input.head || "";
    if (/fitbit/.test(name)) return 0.92;
    if (/resting_heart_rate|^steps-|\/steps-|sleep-\d|calories-\d/.test(name)) return 0.85;
    if (/"dateOfSleep"|"minutesAsleep"/.test(head)) return 0.85;
    if (/"dateTime"/.test(head) && /"value"/.test(head)) return 0.55;
    return 0;
  },
  async parse(input) {
    let data;
    try { data = JSON.parse(input.text); }
    catch (e) { return { records: [], provenance: { source: this.id }, completeness: {}, warnings: ["Could not parse JSON: " + e.message] }; }
    const arr = Array.isArray(data) ? data : data.records || data.data || [];
    const name = (input.name || "").toLowerCase();
    const agg = dayAgg();
    const bedByDate = {};
    const wakeByDate = {};

    const kind = /resting_heart_rate/.test(name) ? "resting"
      : /sleep/.test(name) ? "sleep"
      : /steps/.test(name) ? "steps"
      : /calorie/.test(name) ? "calories"
      : /active_minutes|active-minutes/.test(name) ? "active"
      : /heart/.test(name) ? "hr"
      : (arr[0] && (arr[0].dateOfSleep || arr[0].minutesAsleep)) ? "sleep"
      : (arr[0] && arr[0].value && typeof arr[0].value === "object" && arr[0].value.date) ? "resting"
      : "steps";

    for (const e of arr) {
      if (!e || typeof e !== "object") continue;
      if (kind === "sleep") {
        const date = isoDay(e.dateOfSleep || e.startTime || e.dateTime);
        if (!date) continue;
        const mins = Number(e.minutesAsleep ?? e.minutes ?? e.duration);
        if (isFinite(mins)) agg.add(date, "sleep_hours", mins / 60);
        if (e.startTime) bedByDate[date] = bedMin(e.startTime);
        if (e.endTime) wakeByDate[date] = wakeMin(e.endTime);
        continue;
      }
      const date = isoDay(e.dateTime || e.date || (e.value && e.value.date));
      if (!date) continue;
      const v = (e.value && typeof e.value === "object") ? Number(e.value.value) : Number(e.value);
      if (kind === "resting") agg.add(date, "resting_hr", v);
      else if (kind === "steps") agg.add(date, "steps", v);
      else if (kind === "calories") agg.add(date, "active_energy", v);
      else if (kind === "active") agg.add(date, "exercise_minutes", v);
      else if (kind === "hr") agg.add(date, "avg_hr", v);
    }

    const records = agg.finalize({ resting_hr: "avg", avg_hr: "avg", steps: "sum", active_energy: "sum", exercise_minutes: "sum", sleep_hours: "sum" });
    for (const r of records) { if (bedByDate[r.date] != null) r.bedtime_min = bedByDate[r.date]; if (wakeByDate[r.date] != null) r.wake_min = wakeByDate[r.date]; }
    return { records, provenance: { source: this.id }, completeness: completenessOf(records), warnings: records.length ? [NEEDS_VALIDATION] : ["No Fitbit records recognized in this file."] };
  },
};
