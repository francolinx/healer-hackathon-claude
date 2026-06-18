/* ------------------------------------------------------------------ */
/* adapter: Samsung Health CSV export   NEEDS VALIDATION               */
/* ------------------------------------------------------------------ */
//
// Samsung Health exports a zip of `com.samsung.(s)health.*.csv` files (steps,
// heart rate, sleep, exercise). Each CSV's FIRST line is a metadata row; the
// real header is the second line. We strip line 1, parse the rest, infer the
// signal from the filename, and find date/value columns by fuzzy name match.
// Best-effort + guided-mapping net.

import { completenessOf, parseCsvText } from "../schema.js";
import { isoDay, pick, dayAgg, minutesBetween } from "./_util.js";

const NEEDS_VALIDATION = "Samsung Health adapter is best-effort and NEEDS VALIDATION against a real export (see ADAPTERS.md).";

export const samsungHealthAdapter = {
  id: "samsungHealth",
  label: "Samsung Health",
  detect(input) {
    const name = (input.name || "").toLowerCase();
    const head = input.head || "";
    if (/^com\.samsung\.|\/com\.samsung\./.test(name)) return 0.95;
    if (/com\.samsung\.(s)?health/.test(head)) return 0.9;
    return 0;
  },
  async parse(input) {
    const name = (input.name || "").toLowerCase();
    // Drop the leading metadata line before parsing the real header+data.
    const text = String(input.text).replace(/^[^\n]*\n/, "");
    const rows = (parseCsvText(text).data) || [];
    const agg = dayAgg();
    const dateOf = (r) => {
      const p = pick(r, ["day_time", "start_time", "create_time", "start time", "date", "update_time"]);
      return p ? isoDay(p.value) : null;
    };
    const numOf = (r, cands) => { const p = pick(r, cands); return p ? Number(p.value) : NaN; };

    const isStep = /step/.test(name);
    const isSleep = /sleep/.test(name);
    const isHr = /heart_rate|heartrate/.test(name);
    const isExercise = /exercise|workout/.test(name);

    for (const r of rows) {
      const date = dateOf(r);
      if (isStep) { if (date) agg.add(date, "steps", numOf(r, ["count", "step_count", "value"])); }
      else if (isHr) { if (date) { agg.add(date, "avg_hr", numOf(r, ["heart_rate", "value"])); } }
      else if (isSleep) {
        const start = (pick(r, ["start_time", "bed_time", "sleep_start"]) || {}).value;
        const end = (pick(r, ["end_time", "wake_time", "sleep_end"]) || {}).value;
        const dur = numOf(r, ["sleep_duration", "duration"]);
        const wakeDate = isoDay(end) || date;
        if (isFinite(dur) && wakeDate) agg.add(wakeDate, "sleep_hours", dur / 60); // minutes -> hours
        else { const mins = minutesBetween(start, end); if (mins && wakeDate) agg.add(wakeDate, "sleep_hours", mins / 60); }
      } else if (isExercise) {
        if (!date) continue;
        const durMs = numOf(r, ["duration"]);
        if (isFinite(durMs)) agg.add(date, "exercise_minutes", durMs / 60000); // ms -> minutes
        agg.add(date, "workouts", 1);
        const cal = numOf(r, ["calorie", "calories"]); if (isFinite(cal)) agg.add(date, "active_energy", cal);
      }
    }
    const records = agg.finalize({ steps: "sum", avg_hr: "avg", sleep_hours: "sum", exercise_minutes: "sum", workouts: "sum", active_energy: "sum" });
    return { records, provenance: { source: this.id }, completeness: completenessOf(records), warnings: records.length ? [NEEDS_VALIDATION] : ["No Samsung Health rows recognized in this file."] };
  },
};
