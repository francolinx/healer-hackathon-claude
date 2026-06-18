/* ------------------------------------------------------------------ */
/* adapter: Apple Health export.xml  (VALIDATED against samples)        */
/* ------------------------------------------------------------------ */
//
// Streaming, byte-bounded parser for Apple Health `export.xml` (commonly
// hundreds of MB). Reads the file in 8MB slices and scans opening Record/Workout
// tags with a regex into daily buckets. Only attributes are needed; children are
// ignored. Sleep counts only Asleep* stages, merges overlapping intervals, and
// attributes each night to its WAKE date (see DECISIONS.md D2). Deterministic.

import { avg, completenessOf } from "../schema.js";

// Core streaming parser. `source` is a Blob/File OR a string (tests / zip entry).
export async function parseAppleHealthXML(source, onProgress) {
  const isBlob = typeof source !== "string" && source && typeof source.slice === "function" && typeof source.arrayBuffer === "function";
  const decoder = new TextDecoder("utf-8");
  const day = (s) => (s ? s.slice(0, 10) : null);
  const hhmm = (s) => (s && s.length >= 16 ? s.slice(11, 16) : null);
  const attr = (tag, name) => { const m = tag.match(new RegExp(name + '="([^"]*)"')); return m ? m[1] : null; };
  const buckets = {};
  const ensure = (dt) => (buckets[dt] = buckets[dt] || { date: dt, _rhr: [], _hr: [], steps: 0, exercise_minutes: 0, active_energy: 0, _spo2: [], workouts: 0, sleep_hours: null, bedtime_min: null, wake_min: null });
  const asleep = [];
  const inbed = [];

  const handleTag = (tag) => {
    if (tag.startsWith("<Workout")) {
      const dt = day(attr(tag, "startDate"));
      if (dt) ensure(dt).workouts += 1;
      return;
    }
    const type = attr(tag, "type");
    const sd = attr(tag, "startDate");
    const dt = day(sd);
    if (!type || !dt) return;
    if (type === "HKCategoryTypeIdentifierSleepAnalysis") {
      const ed = attr(tag, "endDate");
      const start = new Date(sd).getTime();
      const end = new Date(ed).getTime();
      if (!(end > start)) return;
      const rec = { start, end, endDay: day(ed), bed: hhmm(sd), wake: hhmm(ed) };
      const v = attr(tag, "value") || "";
      if (/Asleep/i.test(v)) asleep.push(rec);
      else if (/InBed/i.test(v)) inbed.push(rec);
      return;
    }
    const val = parseFloat(attr(tag, "value"));
    const b = ensure(dt);
    switch (type) {
      case "HKQuantityTypeIdentifierRestingHeartRate": if (!isNaN(val)) b._rhr.push(val); break;
      case "HKQuantityTypeIdentifierHeartRate": if (!isNaN(val)) b._hr.push(val); break;
      case "HKQuantityTypeIdentifierStepCount": if (!isNaN(val)) b.steps += val; break;
      case "HKQuantityTypeIdentifierAppleExerciseTime": if (!isNaN(val)) b.exercise_minutes += val; break;
      case "HKQuantityTypeIdentifierActiveEnergyBurned": if (!isNaN(val)) b.active_energy += val; break;
      case "HKQuantityTypeIdentifierOxygenSaturation": if (!isNaN(val)) b._spo2.push(val <= 1 ? val * 100 : val); break;
      default: break;
    }
  };

  const tagRe = /<(?:Record|Workout)\b[^>]*>/g;
  const scan = (text) => { tagRe.lastIndex = 0; let m; while ((m = tagRe.exec(text))) handleTag(m[0]); };

  if (isBlob) {
    const CHUNK = 8 * 1024 * 1024;
    let buffer = "";
    let offset = 0;
    const size = source.size;
    while (offset < size) {
      const buf = await source.slice(offset, offset + CHUNK).arrayBuffer();
      offset += CHUNK;
      buffer += decoder.decode(buf, { stream: offset < size });
      const lastGt = buffer.lastIndexOf(">");
      if (lastGt !== -1) { scan(buffer.slice(0, lastGt + 1)); buffer = buffer.slice(lastGt + 1); }
      if (onProgress) onProgress(Math.min(offset, size) / size);
    }
    scan(buffer);
  } else {
    scan(String(source));
    if (onProgress) onProgress(1);
  }

  const bedToNoon = (hm) => { if (!hm) return null; const [h, m] = hm.split(":").map(Number); return ((h + 12) % 24) * 60 + m; };
  const wakeToMid = (hm) => { if (!hm) return null; const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
  const assignSleep = (intervals) => {
    if (!intervals.length) return;
    intervals.sort((a, b) => a.start - b.start);
    const merged = [];
    let cur = null;
    for (const iv of intervals) {
      if (cur && iv.start <= cur.end) { if (iv.end > cur.end) { cur.end = iv.end; cur.endDay = iv.endDay; cur.wake = iv.wake; } }
      else { if (cur) merged.push(cur); cur = { ...iv }; }
    }
    if (cur) merged.push(cur);
    const byDay = {};
    for (const m of merged) {
      const hrs = (m.end - m.start) / 3.6e6;
      if (!(hrs > 0 && hrs < 24) || !m.endDay) continue;
      const d = byDay[m.endDay] || (byDay[m.endDay] = { hrs: 0, longest: 0, bed: null, wake: null });
      d.hrs += hrs;
      if (hrs > d.longest) { d.longest = hrs; d.bed = m.bed; d.wake = m.wake; }
    }
    for (const [d, info] of Object.entries(byDay)) {
      const b = ensure(d);
      b.sleep_hours = Math.round(info.hrs * 10) / 10;
      b.bedtime_min = bedToNoon(info.bed);
      b.wake_min = wakeToMid(info.wake);
    }
  };
  assignSleep(asleep.length ? asleep : inbed);

  const rows = Object.values(buckets).map((b) => ({
    date: b.date,
    resting_hr: b._rhr.length ? Math.round(avg(b._rhr)) : null,
    avg_hr: b._hr.length ? Math.round(avg(b._hr)) : null,
    steps: b.steps ? Math.round(b.steps) : null,
    exercise_minutes: b.exercise_minutes ? Math.round(b.exercise_minutes) : null,
    active_energy: b.active_energy ? Math.round(b.active_energy) : null,
    spo2: b._spo2.length ? Math.round(avg(b._spo2)) : null,
    sleep_hours: b.sleep_hours,
    bedtime_min: b.bedtime_min,
    wake_min: b.wake_min,
    workouts: b.workouts || 0,
  }));
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export const appleHealthAdapter = {
  id: "appleHealth",
  label: "Apple Health",
  detect(input) {
    const name = (input.name || "").toLowerCase();
    const head = input.head || "";
    if (name.includes("cda")) return 0; // CDA is a different format; let it fail clearly
    if (/HKQuantityTypeIdentifier|HKCategoryTypeIdentifier/.test(head)) return 0.98;
    if (input.ext === "xml" && /<HealthData/.test(head)) return 0.9;
    if (name.endsWith("export.xml")) return 0.7;
    return 0;
  },
  async parse(input, onProgress) {
    const name = (input.name || "").toLowerCase();
    if (name.includes("cda") || /<ClinicalDocument/.test(input.head || "")) {
      return { records: [], provenance: { source: "appleHealth" }, completeness: {}, warnings: ["This looks like export_cda.xml (Clinical Document format). Upload export.xml instead - the CDA file uses a different format VisitPulse doesn't read."] };
    }
    const records = await parseAppleHealthXML(input.file || input.text, onProgress);
    const warnings = records.length ? [] : ["No HealthKit records found in this XML."];
    return { records, provenance: { source: "appleHealth" }, completeness: completenessOf(records), warnings };
  },
};
