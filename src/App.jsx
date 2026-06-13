import React, { useState, useMemo, useRef, forwardRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea,
} from "recharts";
import Papa from "papaparse";
import { useReactToPrint } from "react-to-print";
import {
  Activity, HeartPulse, Moon, Footprints, Dumbbell, Flame, Wind, FileText, Send,
  Copy, Check, AlertTriangle, TrendingUp, TrendingDown, Minus, ShieldCheck, ChevronRight,
  ChevronLeft, Database, FileSpreadsheet, FileCode, CheckCircle2, Stethoscope, ClipboardList, ThumbsUp,
  Download, Calculator, Unlock, Clock,
} from "lucide-react";
import { logFeedback } from "./feedback.js";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */
const TODAY = "2026-06-13";

const SIGNALS = [
  { key: "resting_hr", label: "Resting heart rate", unit: "bpm", icon: HeartPulse, concern: "up", decimals: 0,
    flag: (b, r) => Math.abs(r - b) >= 4 && r > b, q: "Has the patient noticed palpitations, breathlessness, poorer sleep, illness, stress, or changes in caffeine/alcohol or medications that can raise resting heart rate?" },
  { key: "sleep_hours", label: "Sleep duration", unit: "h", icon: Moon, concern: "down", decimals: 1,
    flag: (b, r, pct) => pct <= -10, q: "What is driving the recent drop in sleep - schedule, stress, pain, or a new symptom? Is daytime fatigue affecting function?" },
  { key: "steps", label: "Daily steps", unit: "/day", icon: Footprints, concern: "down", decimals: 0,
    flag: (b, r, pct) => pct <= -15, q: "Is reduced daily activity due to pain, fatigue, motivation, schedule, or a new physical limitation?" },
  { key: "exercise_minutes", label: "Exercise minutes", unit: "min/day", icon: Dumbbell, concern: "down", decimals: 0,
    flag: (b, r, pct) => pct <= -20, q: "Has exercise dropped because of injury, fatigue, time, or feeling unwell?" },
  { key: "active_energy", label: "Active energy", unit: "kcal/day", icon: Flame, concern: "down", decimals: 0,
    flag: (b, r, pct) => pct <= -25, q: "Reduced active energy expenditure tracks with lower overall activity this period." },
  { key: "workouts", label: "Workouts", unit: "/day", icon: Activity, concern: "down", decimals: 1,
    flag: (b, r) => b > 0 && r < b * 0.6, q: "Fewer logged workouts recently - intentional rest, or a barrier worth discussing?" },
  { key: "spo2", label: "Blood oxygen (SpO2)", unit: "%", icon: Wind, concern: "lowmissing", decimals: 0,
    flag: () => false, q: "" },
];

const SIGNAL_COLORS = {
  resting_hr: "#0d9488", sleep_hours: "#6366f1", steps: "#0ea5e9", exercise_minutes: "#8b5cf6",
  active_energy: "#f97316", workouts: "#14b8a6", spo2: "#06b6d4", avg_hr: "#64748b",
};

// Clinician type -> signal priority ordering + framing. Reorders/frames only; never diagnoses.
const CLINICIAN_PROFILES = {
  general:    { label: "Primary care", frame: "primary care visit", priority: ["resting_hr","sleep_hours","steps","active_energy","exercise_minutes","workouts","spo2"] },
  cardiology: { label: "Cardiology", frame: "cardiology visit", priority: ["resting_hr","workouts","active_energy","steps","spo2","sleep_hours","exercise_minutes"] },
  sleep:      { label: "Sleep medicine", frame: "sleep medicine visit", priority: ["sleep_hours","resting_hr","steps","active_energy","exercise_minutes","workouts","spo2"] },
  endocrine:  { label: "Endocrinology", frame: "endocrinology visit", priority: ["steps","active_energy","sleep_hours","resting_hr","workouts","exercise_minutes","spo2"] },
  sports:     { label: "Sports medicine", frame: "sports medicine visit", priority: ["workouts","exercise_minutes","resting_hr","steps","active_energy","sleep_hours","spo2"] },
  behavioral: { label: "Behavioral health", frame: "behavioral health visit", priority: ["sleep_hours","steps","active_energy","resting_hr","exercise_minutes","workouts","spo2"] },
};

// Chief complaint -> relevant signals + non-diagnostic framing + emphasized question. Relevance selection only.
const CHIEF_COMPLAINTS = {
  general:          { label: "General check-up / none", signals: [], why: "", q: "" },
  palpitations:     { label: "Palpitations / racing heart", signals: ["resting_hr","workouts"],
                      why: "Because the visit is about palpitations, resting heart-rate trends and exertion context are the most relevant signals to review together.",
                      q: "When do the palpitations occur relative to activity, caffeine, stress, or sleep?" },
  fatigue:          { label: "Fatigue / low energy", signals: ["sleep_hours","resting_hr","steps","active_energy"],
                      why: "For fatigue, sleep, resting heart rate, and overall activity are the signals most worth viewing side by side.",
                      q: "Does the fatigue track with the recent change in sleep or activity?" },
  breathless:       { label: "Breathless on exertion", signals: ["workouts","resting_hr","spo2","active_energy"],
                      why: "For breathlessness with exertion, exertion, heart-rate, and (if available) oxygen data are the relevant context.",
                      q: "Is the breathlessness new, and does it line up with the change in exercise tolerance?" },
  poor_sleep:       { label: "Poor sleep / insomnia", signals: ["sleep_hours","resting_hr"],
                      why: "For sleep concerns, sleep duration and overnight resting heart rate are the core signals.",
                      q: "How does the patient's sense of sleep quality compare with what the device shows?" },
  reduced_exercise: { label: "Reduced exercise tolerance", signals: ["workouts","exercise_minutes","steps","resting_hr"],
                      why: "For declining exercise tolerance, training volume and recovery (resting heart rate) are most relevant.",
                      q: "Is the drop in activity by choice, or from feeling unable to sustain it?" },
  weight_change:    { label: "Weight change", signals: ["active_energy","steps","workouts"],
                      why: "For weight changes, activity and energy-expenditure trends provide useful behavioral context.",
                      q: "Have diet or appetite shifted alongside the activity trend?" },
  low_mood:         { label: "Low mood / stress", signals: ["sleep_hours","steps","active_energy"],
                      why: "For mood and stress, sleep and daily activity rhythm provide behavioral context - not a diagnosis.",
                      q: "Has the daily routine of sleep and activity shifted recently?" },
};

/* ------------------------------------------------------------------ */
/* Sample data (deterministic, with a planted clinically-relevant arc) */
/* ------------------------------------------------------------------ */
function buildSampleData() {
  const days = 30;
  const today = new Date(TODAY + "T00:00:00");
  let seed = 42;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 1000) / 1000; };
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const recent = i < 7;
    const rhrB = recent ? 67 : 61;
    const slpB = recent ? 6.0 : 7.2;
    const stpB = recent ? 6200 : 8600;
    const exB = recent ? 18 : 33;
    const aeB = recent ? 320 : 520;
    const exercise_minutes = Math.max(0, Math.round(exB + (rnd() * 16 - 8)));
    let spo2 = 96 + Math.round(rnd() * 2);
    if (recent && (i === 1 || i === 3 || i === 4 || i === 6)) spo2 = null; // sparse recent SpO2 -> demonstrates data-quality handling
    out.push({
      date: d.toISOString().slice(0, 10),
      resting_hr: Math.round(rhrB + (rnd() * 6 - 3)),
      avg_hr: Math.round(78 + (rnd() * 12 - 6)),
      steps: Math.round(stpB + (rnd() * 2400 - 1200)),
      exercise_minutes,
      active_energy: Math.round(aeB + (rnd() * 160 - 80)),
      spo2,
      sleep_hours: Math.round((slpB + (rnd() * 1.2 - 0.6)) * 10) / 10,
      workouts: exercise_minutes > 20 ? 1 : 0,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Parsers                                                             */
/* ------------------------------------------------------------------ */
const FIELDS = ["resting_hr", "avg_hr", "steps", "exercise_minutes", "active_energy", "spo2", "sleep_hours", "workouts"];
const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

function normalizeRows(rows) {
  return rows
    .filter((r) => r && (r.date || r.Date))
    .map((r) => {
      const o = { date: String(r.date || r.Date).slice(0, 10) };
      FIELDS.forEach((f) => {
        const v = r[f];
        o[f] = v === "" || v === undefined || v === null ? null : Number(v);
        if (Number.isNaN(o[f])) o[f] = null;
      });
      return o;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseCSV(text) {
  const res = Papa.parse(text.trim(), { header: true, skipEmptyLines: true, dynamicTyping: true });
  return normalizeRows(res.data);
}

function parseJSON(text) {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : data.records || data.data || [];
  return normalizeRows(arr);
}

// Streaming Apple Health export.xml parser. Real exports are commonly hundreds
// of MB - too large to read into one string (JS max-string-length) or feed to
// DOMParser. We read the file in byte-bounded slices and scan opening tags with
// a regex, aggregating into daily buckets. Only the opening tag's attributes
// (type/startDate/endDate/value) are needed; record children are ignored.
// Angle brackets inside attribute values are XML-escaped in Apple exports, so
// every literal '>' is a real tag terminator and we can split on it safely.
// Bounded memory + a progress callback => multi-hundred-MB files parse fine.
async function parseAppleHealthXML(file, onProgress) {
  const CHUNK = 8 * 1024 * 1024; // 8 MB slices
  const decoder = new TextDecoder("utf-8");
  const day = (s) => (s ? s.slice(0, 10) : null);
  const attr = (tag, name) => { const m = tag.match(new RegExp(name + '="([^"]*)"')); return m ? m[1] : null; };
  const buckets = {};
  const ensure = (dt) => (buckets[dt] = buckets[dt] || { date: dt, _rhr: [], _hr: [], steps: 0, exercise_minutes: 0, active_energy: 0, _spo2: [], _sleep: 0, workouts: 0 });

  const handleTag = (tag) => {
    if (tag.startsWith("<Workout")) {
      const dt = day(attr(tag, "startDate"));
      if (dt) ensure(dt).workouts += 1;
      return;
    }
    const type = attr(tag, "type");
    const dt = day(attr(tag, "startDate"));
    if (!type || !dt) return;
    const val = parseFloat(attr(tag, "value"));
    const b = ensure(dt);
    switch (type) {
      case "HKQuantityTypeIdentifierRestingHeartRate": if (!isNaN(val)) b._rhr.push(val); break;
      case "HKQuantityTypeIdentifierHeartRate": if (!isNaN(val)) b._hr.push(val); break;
      case "HKQuantityTypeIdentifierStepCount": if (!isNaN(val)) b.steps += val; break;
      case "HKQuantityTypeIdentifierAppleExerciseTime": if (!isNaN(val)) b.exercise_minutes += val; break;
      case "HKQuantityTypeIdentifierActiveEnergyBurned": if (!isNaN(val)) b.active_energy += val; break;
      case "HKQuantityTypeIdentifierOxygenSaturation": if (!isNaN(val)) b._spo2.push(val <= 1 ? val * 100 : val); break;
      case "HKCategoryTypeIdentifierSleepAnalysis": {
        const start = new Date(attr(tag, "startDate"));
        const end = new Date(attr(tag, "endDate"));
        const hrs = (end - start) / 3.6e6;
        if (hrs > 0 && hrs < 16) b._sleep += hrs;
        break;
      }
      default: break;
    }
  };

  const tagRe = /<(?:Record|Workout)\b[^>]*>/g;
  const scan = (text) => { tagRe.lastIndex = 0; let m; while ((m = tagRe.exec(text))) handleTag(m[0]); };

  let buffer = "";
  let offset = 0;
  while (offset < file.size) {
    const buf = await file.slice(offset, offset + CHUNK).arrayBuffer();
    offset += CHUNK;
    buffer += decoder.decode(buf, { stream: offset < file.size });
    const lastGt = buffer.lastIndexOf(">");
    if (lastGt !== -1) {
      scan(buffer.slice(0, lastGt + 1));
      buffer = buffer.slice(lastGt + 1); // carry partial tag to next chunk
    }
    if (onProgress) onProgress(Math.min(offset, file.size) / file.size);
  }
  scan(buffer); // flush any trailing complete tag

  const rows = Object.values(buckets).map((b) => ({
    date: b.date,
    resting_hr: b._rhr.length ? Math.round(avg(b._rhr)) : null,
    avg_hr: b._hr.length ? Math.round(avg(b._hr)) : null,
    steps: b.steps ? Math.round(b.steps) : null,
    exercise_minutes: b.exercise_minutes ? Math.round(b.exercise_minutes) : null,
    active_energy: b.active_energy ? Math.round(b.active_energy) : null,
    spo2: b._spo2.length ? Math.round(avg(b._spo2)) : null,
    sleep_hours: b._sleep ? Math.round(b._sleep * 10) / 10 : null,
    workouts: b.workouts || 0,
  }));
  const sorted = rows.sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) {
    throw new Error("No HealthKit records found. If you exported export_cda.xml, upload export.xml from the same export.zip instead - the CDA file uses a different format VisitPulse doesn't read.");
  }
  return sorted.slice(-30);
}

/* ------------------------------------------------------------------ */
/* Trend engine                                                        */
/* ------------------------------------------------------------------ */
function windowAvg(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  return { value: vals.length ? avg(vals) : null, n: vals.length, total: rows.length };
}

function computeTrends(data) {
  if (!data || data.length < 8) return [];
  const recent = data.slice(-7);
  const baseline = data.slice(-28, -7);
  return SIGNALS.map((s) => {
    const b = windowAvg(baseline, s.key);
    const r = windowAvg(recent, s.key);
    const completeness = (b.n + r.n) / (b.total + r.total || 1);
    let flagged = false, direction = "stable", note = "", pct = null, delta = null;

    if (b.value !== null && r.value !== null) {
      pct = b.value === 0 ? 0 : ((r.value - b.value) / b.value) * 100;
      delta = r.value - b.value;
      if (s.concern === "lowmissing") {
        if (r.value < 94) { flagged = true; direction = "concerning"; note = "Recent average below 94%"; }
        else direction = "stable";
      } else {
        flagged = s.flag(b.value, r.value, pct);
        const concerningDir = s.concern === "up" ? delta > 0 : delta < 0;
        if (flagged) direction = "concerning";
        else if (Math.abs(pct) >= 8) direction = concerningDir ? "concerning" : "improving";
        else direction = "stable";
      }
    }
    if (s.key === "spo2" && r.n < recent.length * 0.6) {
      flagged = true; direction = "missing"; note = "Sparse data (" + r.n + "/" + recent.length + " recent days)";
    }

    let strength = "Weak";
    const absPct = pct === null ? 0 : Math.abs(pct);
    if (s.key === "resting_hr") {
      if (Math.abs(delta || 0) >= 6 && completeness >= 0.7) strength = "Strong";
      else if (Math.abs(delta || 0) >= 3) strength = "Moderate";
    } else {
      if (absPct >= 20 && completeness >= 0.7) strength = "Strong";
      else if (absPct >= 10) strength = "Moderate";
    }
    if (completeness < 0.5 && strength === "Strong") strength = "Moderate";

    return { ...s, baseline: b.value, recent: r.value, pct, delta, flagged, direction, note, strength, completeness };
  });
}

/* ------------------------------------------------------------------ */
/* Formatting + contextual brief generation                           */
/* ------------------------------------------------------------------ */
const fmt = (v, d) => (v === null || v === undefined ? "-" : v.toFixed(d));

function trendSentence(t) {
  const dirWord = (t.delta || 0) > 0 ? "increased" : "decreased";
  const pctTxt = t.pct === null ? "" : (t.pct > 0 ? "+" : "") + t.pct.toFixed(0) + "%";
  return `${t.label} ${dirWord} ${pctTxt} (${fmt(t.baseline, t.decimals)} -> ${fmt(t.recent, t.decimals)} ${t.unit}) over the last 7 days vs the prior 21 - ${t.strength.toLowerCase()} signal, ${(t.completeness * 100).toFixed(0)}% data coverage.`;
}

// One rendered line for a signal inside the "most relevant" section.
function leadLine(t) {
  if (t.recent === null) return { text: `${t.label}: no recent data in this window.`, tone: "muted" };
  if (t.direction === "missing") return { text: `${t.label}: ${t.note || "sparse recent data"}.`, tone: "muted" };
  if (t.flagged) return { text: trendSentence(t), tone: "flag" };
  const chg = t.pct === null ? "" : ` (${fmt(t.baseline, t.decimals)} -> ${fmt(t.recent, t.decimals)} ${t.unit})`;
  return { text: `${t.label} stable${chg}.`, tone: "ok" };
}

function buildContextualBrief(trends, ctx) {
  const prof = CLINICIAN_PROFILES[ctx.clinicianType] || CLINICIAN_PROFILES.general;
  const comp = CHIEF_COMPLAINTS[ctx.chiefComplaint] || CHIEF_COMPLAINTS.general;
  const byKey = Object.fromEntries(trends.map((t) => [t.key, t]));
  const order = prof.priority;
  const rank = (k) => { const i = order.indexOf(k); return i === -1 ? 99 : i; };
  const isGeneral = ctx.chiefComplaint === "general" || !comp.signals.length;

  let relevantKeys = (comp.signals.length ? comp.signals : order).slice();
  relevantKeys = [...new Set(relevantKeys)].sort((a, b) => rank(a) - rank(b));
  const relevantSet = new Set(relevantKeys);

  const flaggedSort = (a, b) => (Number(b.flagged) - Number(a.flagged)) || (rank(a.key) - rank(b.key));
  const lead = relevantKeys.map((k) => byKey[k]).filter(Boolean).sort(flaggedSort);

  const others = trends.filter((t) => !relevantSet.has(t.key));
  const otherFlagged = others.filter((t) => t.flagged && t.direction !== "missing");
  const otherStable = others.filter((t) => !(t.flagged && t.direction !== "missing"));

  const allFlagged = trends.filter((t) => t.flagged && t.direction !== "missing");
  const missing = trends.filter((t) => t.direction === "missing" || (relevantSet.has(t.key) && t.recent === null));

  let relevance;
  if (allFlagged.length === 0) {
    relevance = "No meaningful shifts from baseline were detected across the shared signals this period. The data is most useful here as reassurance and as a baseline for future visits.";
  } else {
    const labels = allFlagged.map((t) => t.label.toLowerCase());
    relevance = `A shift is visible across ${labels.join(", ")}. Patterns like this can be associated with a range of factors - intercurrent illness, deconditioning, stress or sleep disruption, overtraining, or medication effects, among others. These are consumer-device context signals, not diagnostic findings.`;
  }

  const questions = [];
  if (comp.q) questions.push(comp.q);
  allFlagged.forEach((t) => { if (t.q && !questions.includes(t.q)) questions.push(t.q); });
  if (questions.length === 0) questions.push("No data-driven follow-up flags this period; routine review.");

  const complaintShort = comp.label.split(" / ")[0];
  const reason = `Patient is sharing 30 days of consumer wearable data (Garmin via Apple Health) ahead of a ${prof.frame}${isGeneral ? "" : ` regarding ${complaintShort.toLowerCase()}`} to give relevant context on recent changes.`;
  const headerLabel = `${prof.label}${isGeneral ? "" : " / " + complaintShort}`;
  const keyTrends = allFlagged.map(trendSentence);

  return { prof, comp, isGeneral, complaintShort, lead, otherFlagged, otherStable, allFlagged,
    flagged: allFlagged, hasFlags: allFlagged.length > 0, missing, relevance, questions, why: comp.why,
    reason, headerLabel, keyTrends };
}

function buildPortalMessage(brief) {
  const top = brief.flagged.slice(0, 2).map((t) => {
    const dirWord = (t.delta || 0) > 0 ? "up" : "down";
    return `${t.label.toLowerCase()} is ${dirWord} (${fmt(t.baseline, t.decimals)} -> ${fmt(t.recent, t.decimals)} ${t.unit})`;
  });
  const visit = brief.isGeneral ? "my upcoming visit" : `my ${brief.prof.label.toLowerCase()} visit about ${brief.complaintShort.toLowerCase()}`;
  const body = brief.hasFlags
    ? `the main change is that my ${top.join(", and my ")} over the past week compared with the three weeks before.`
    : `things look stable compared with the prior three weeks, but I wanted you to have the baseline.`;
  return `Hi Dr. [Name],

Ahead of ${visit} I'm sharing a summary of the last 30 days of my wearable data (Garmin, via Apple Health). In plain terms, ${body}

I know this is consumer-device data, not a medical reading - I'd just love to talk through whether it's worth looking into. The full one-page summary is attached.

Thanks,
[Patient name]`;
}

function buildFHIR(trends) {
  const obs = trends
    .filter((t) => t.recent !== null && ["resting_hr", "steps", "spo2"].includes(t.key))
    .map((t) => ({
      resource: {
        resourceType: "Observation",
        status: "preliminary",
        category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "activity" }] }],
        code: { text: t.label },
        effectivePeriod: { start: "2026-06-06", end: TODAY },
        valueQuantity: { value: Number(t.recent.toFixed(t.decimals)), unit: t.unit },
        note: [{ text: "Patient-generated, consumer wearable. Context only; not diagnostic." }],
      },
    }));
  return JSON.stringify({ resourceType: "Bundle", type: "collection", entry: obs }, null, 2);
}

function briefPlainText(brief) {
  const L = [];
  L.push("PRE-VISIT WEARABLE SUMMARY (generated " + TODAY + ")");
  L.push("Visit context: " + brief.headerLabel, "");
  L.push("REASON FOR SHARING", brief.reason, "");
  if (brief.why) L.push("WHY THESE SIGNALS", brief.why, "");
  L.push("KEY WEARABLE TRENDS");
  if (brief.hasFlags) brief.keyTrends.forEach((k) => L.push("- " + k));
  else L.push("- No meaningful shifts from baseline this period.");
  L.push("", "POSSIBLE RELEVANCE", brief.relevance, "");
  L.push("SUGGESTED VISIT QUESTIONS");
  brief.questions.forEach((q) => L.push("- " + q));
  L.push("", "DATA LIMITATIONS");
  L.push("Consumer wrist wearable, not FDA-cleared diagnostic equipment. Affected by motion/fit; some days may be missing. 7-day vs 21-day window; short-term variation expected.", "");
  L.push("DISCLAIMER");
  L.push("This is patient-generated wearable data and should be interpreted as context, not diagnosis. Clinician-in-the-loop; VisitPulse does not interpret, triage, or make recommendations.");
  return L.join("\n");
}

/* ------------------------------------------------------------------ */
/* UI atoms                                                            */
/* ------------------------------------------------------------------ */
function Spark({ data, dataKey, color }) {
  return (
    <div className="h-9 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const dirStyle = {
  concerning: { badge: "bg-amber-50 text-amber-700 border-amber-200", Icon: TrendingUp, iconCls: "text-amber-500" },
  improving: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: TrendingDown, iconCls: "text-emerald-500" },
  stable: { badge: "bg-slate-50 text-slate-500 border-slate-200", Icon: Minus, iconCls: "text-slate-400" },
  missing: { badge: "bg-slate-50 text-slate-500 border-slate-200", Icon: AlertTriangle, iconCls: "text-slate-400" },
};

function CopyBtn({ text, id, copied, onCopy }) {
  const active = copied === id;
  return (
    <button onClick={() => onCopy(text, id)}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
      {active ? <Check size={15} /> : <Copy size={15} />}{active ? "Copied" : "Copy"}
    </button>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <div className="text-sm leading-relaxed text-slate-600">{children}</div>
    </div>
  );
}

function NavRow({ onBack, backLabel, onNext, nextLabel }) {
  return (
    <div className="mt-7 flex items-center justify-between">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"><ChevronLeft size={16} />{backLabel}</button>
      <button onClick={onNext} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700">{nextLabel}<ChevronRight size={16} /></button>
    </div>
  );
}

function Select({ label, value, onChange, options, compact }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-teal-400 focus:outline-none ${compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

const CLINICIAN_OPTIONS = Object.entries(CLINICIAN_PROFILES).map(([k, v]) => ({ value: k, label: v.label }));
const COMPLAINT_OPTIONS = Object.entries(CHIEF_COMPLAINTS).map(([k, v]) => ({ value: k, label: v.label }));

const toneCls = { flag: "bg-amber-400", ok: "bg-emerald-400", muted: "bg-slate-300" };

const printToneCls = { flag: "bg-amber-500", ok: "bg-emerald-500", muted: "bg-slate-400" };

/* ------------------------------------------------------------------ */
/* Printable brief (react-to-print)                                    */
/* Clean, self-contained one-page document for the CURRENT lens.       */
/* Reuses the same deterministic brief object - no separate content.   */
/* ------------------------------------------------------------------ */
const PrintableBrief = forwardRef(function PrintableBrief({ brief }, ref) {
  if (!brief) return <div ref={ref} />;
  return (
    <div ref={ref} className="bg-white p-8 font-sans text-slate-800">
      <div className="flex items-start justify-between border-b border-slate-200 pb-3">
        <div>
          <div className="text-xl font-semibold tracking-tight">VisitPulse - pre-visit wearable summary</div>
          <div className="mt-0.5 text-xs text-slate-500">Generated {TODAY} | patient-approved | clinician-in-the-loop | not a diagnostic device</div>
        </div>
        <div className="shrink-0 rounded-full bg-teal-100 px-3 py-1 text-xs font-medium text-teal-700">{brief.headerLabel}</div>
      </div>

      <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-700">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Reason for sharing</div>
          <p>{brief.reason}</p>
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Most relevant to this visit</div>
          {brief.why && <p className="mb-1.5 italic text-slate-500">{brief.why}</p>}
          <ul className="space-y-1">
            {brief.lead.map((t) => {
              const ln = leadLine(t);
              return (<li key={t.key} className="flex gap-2"><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${printToneCls[ln.tone]}`} />{ln.text}</li>);
            })}
          </ul>
        </div>

        {brief.otherFlagged.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-600">Also noted (flagged, outside the visit reason)</div>
            <ul className="space-y-1">
              {brief.otherFlagged.map((t) => (<li key={t.key} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{trendSentence(t)}</li>))}
            </ul>
          </div>
        )}

        {!brief.isGeneral && brief.otherStable.length > 0 && (
          <p className="text-slate-500">Other tracked signals stable or limited this period: {brief.otherStable.map((t) => t.label.toLowerCase()).join(", ")}.</p>
        )}

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Possible relevance</div>
          <p>{brief.relevance}</p>
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Suggested visit questions</div>
          <ul className="space-y-1">
            {brief.questions.map((q, i) => (<li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />{q}</li>))}
          </ul>
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Data limitations</div>
          <p>Readings are from a consumer wrist wearable, not FDA-cleared diagnostic equipment. Values can be affected by motion, fit, and skin contact; some days may be missing{brief.missing.length ? ` (limited this period: ${brief.missing.map((m) => m.label.toLowerCase()).join(", ")})` : ""}. Trends reflect a 7-day vs 21-day window and short-term variation is expected.</p>
        </div>

        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-teal-800">
          This is patient-generated wearable data and should be interpreted as <span className="font-semibold">context, not diagnosis</span>. VisitPulse supports the clinician's judgment and keeps a human in the loop - it does not interpret, triage, or make clinical recommendations.
        </div>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */
const STEPS = ["Upload", "Data preview", "Trend analysis", "Visit context", "Clinician brief", "Send to clinician"];

export default function VisitPulse() {
  const [screen, setScreen] = useState(0);
  const [data, setData] = useState(null);
  const [source, setSource] = useState("");
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const [chartKey, setChartKey] = useState("resting_hr");
  const [visitContext, setVisitContext] = useState({ clinicianType: "general", chiefComplaint: "general", note: "" });
  const [feedback, setFeedback] = useState(null);
  const [parsing, setParsing] = useState(null); // { progress: 0..1, name } while streaming a large export

  const trends = useMemo(() => computeTrends(data), [data]);
  const brief = useMemo(() => (trends.length ? buildContextualBrief(trends, visitContext) : null), [trends, visitContext]);
  const portalMsg = useMemo(() => (brief ? buildPortalMessage(brief) : ""), [brief]);
  const fhir = useMemo(() => (trends.length ? buildFHIR(trends) : ""), [trends]);

  // Download PDF: client-side print of the brief for the CURRENT lens. No API/keys.
  const printRef = useRef(null);
  const handleDownloadPdf = useReactToPrint({
    contentRef: printRef,
    documentTitle: brief ? `VisitPulse brief - ${brief.headerLabel}` : "VisitPulse brief",
  });

  const loadSample = () => { setData(buildSampleData()); setSource("Sample Garmin Fenix data | 30 days"); setError(null); setScreen(1); };

  const setCtx = (patch) => { setVisitContext((c) => ({ ...c, ...patch })); setFeedback(null); };

  // Record a usefulness signal (the flywheel). Optimistic local state always
  // updates; if Supabase is configured the click is also persisted (best-effort).
  const onFeedback = (value) => {
    setFeedback(value);
    logFeedback({ clinicianType: visitContext.clinicianType, chiefComplaint: visitContext.chiefComplaint, value });
  };

  const onFile = async (e, kind) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const name = file.name.toLowerCase();
    const isXml = kind === "xml" || name.endsWith(".xml");

    // Apple Health export.xml: streamed in chunks so huge files (hundreds of MB) work.
    if (isXml) {
      if (name.includes("cda")) {
        setError("That looks like export_cda.xml (Clinical Document format). Upload export.xml from the same export.zip instead - it holds the HealthKit records VisitPulse reads.");
        return;
      }
      setError(null);
      setParsing({ progress: 0, name: file.name });
      try {
        const rows = await parseAppleHealthXML(file, (p) => setParsing((s) => (s ? { ...s, progress: p } : s)));
        if (!rows.length) throw new Error("Could not find any dated records in that file.");
        setData(rows); setSource(file.name + " | " + rows.length + " days"); setError(null); setScreen(1);
      } catch (err) {
        setError((err && err.message) || "Could not parse that file. Try the sample data, CSV, or JSON.");
      } finally {
        setParsing(null);
      }
      return;
    }

    // CSV / JSON: small files, read directly.
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = name.endsWith(".json") || kind === "json" ? parseJSON(reader.result) : parseCSV(reader.result);
        if (!rows.length) throw new Error("Could not find any dated records in that file.");
        setData(rows); setSource(file.name + " | " + rows.length + " days"); setError(null); setScreen(1);
      } catch (err) {
        setError((err && err.message) || "Could not parse that file. Try the sample data, CSV, or JSON.");
      }
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsText(file);
  };

  const copy = async (text, id) => {
    try { await navigator.clipboard.writeText(text); } catch (_) { /* clipboard blocked; text is selectable on screen */ }
    setCopied(id); setTimeout(() => setCopied(null), 1500);
  };

  const coverage = data ? data.length : 0;
  const recentStart = data && data.length >= 7 ? data[data.length - 7].date : null;
  const lastDate = data ? data[data.length - 1].date : null;
  const flaggedCount = trends.filter((t) => t.flagged).length;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white"><Activity size={20} /></div>
            <div>
              <div className="text-lg font-semibold leading-none tracking-tight">VisitPulse</div>
              <div className="mt-0.5 text-xs text-slate-400">Wearable noise into a pre-visit brief clinicians can read</div>
            </div>
          </div>
          <div className="hidden items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 sm:flex">
            <ShieldCheck size={13} className="text-teal-600" /> Patient-approved | not diagnostic
          </div>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-5 py-2.5">
          {STEPS.map((s, i) => {
            const reachable = i === 0 || data;
            const active = i === screen;
            return (
              <button key={s} disabled={!reachable} onClick={() => reachable && setScreen(i)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition ${active ? "bg-teal-50 font-medium text-teal-700" : reachable ? "text-slate-500 hover:bg-slate-50" : "cursor-not-allowed text-slate-300"}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${active ? "bg-teal-600 text-white" : reachable ? "bg-slate-200 text-slate-600" : "bg-slate-100 text-slate-300"}`}>{i + 1}</span>
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-5 py-7">
        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>{error} <button className="font-medium underline" onClick={loadSample}>Use sample data instead</button></span>
          </div>
        )}

        {parsing && (
          <div className="mb-5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">Parsing {parsing.name || "Apple Health export"}…</span>
              <span className="tabular-nums">{Math.round(parsing.progress * 100)}%</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-teal-100">
              <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${Math.round(parsing.progress * 100)}%` }} />
            </div>
            <div className="mt-1 text-xs text-teal-700/80">Large exports can take a minute. Everything stays on your device - nothing is uploaded.</div>
          </div>
        )}

        {/* Screen 0: Upload */}
        {screen === 0 && (
          <div>
            {/* Vision hero */}
            <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-teal-50/50 px-6 py-8 sm:px-9 sm:py-10">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-white/70 px-3 py-1 text-xs font-medium text-teal-700">
                <ShieldCheck size={13} /> Patient-approved | non-diagnostic | clinician-in-the-loop
              </div>
              <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-4xl">
                A patient's wearable data, turned into a brief their <span className="text-teal-700">own clinician</span> can actually read.
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
                Patients now walk in with months of Garmin and Apple Health data, and clinicians have minutes. VisitPulse
                compresses 30 days of it into a one-page pre-visit brief - contextual to <span className="font-medium text-slate-700">who they're seeing and why</span> - so the useful signal isn't lost and the noise isn't a liability.
              </p>

              <div className="mt-7 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Calculator size={18} /></div>
                  <div className="mt-3 font-semibold text-slate-800">No AI - auditable by design</div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">
                    The brief is deterministic templates and rules, <span className="font-medium text-slate-600">not a language model</span>. Every line traces back to a number a clinician can verify - no hallucinations, nothing to second-guess.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Unlock size={18} /></div>
                  <div className="mt-3 font-semibold text-slate-800">The open layer</div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">
                    Any wearable a patient owns, routed to the doctor they already see. Not a closed loop of one company's device and its own clinicians - <span className="font-medium text-slate-600">the patient's own data, their own physician</span>.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Clock size={18} /></div>
                  <div className="mt-3 font-semibold text-slate-800">Reads in 30 seconds - no new system</div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">
                    A one-page brief and portal-ready message that drop into the chart workflow a clinician already uses. <span className="font-medium text-slate-600">No extra dashboard, login, or integration</span> to adopt for their limited visit time.
                  </p>
                </div>
              </div>
            </section>

            <h2 className="mt-9 text-2xl font-semibold tracking-tight">Share your wearable data for an upcoming visit</h2>
            <p className="mt-2 max-w-2xl text-slate-500">This is a <span className="font-medium text-slate-700">patient-approved Apple Health export</span> flow. Your phone exports your own data (Settings &gt; Health &gt; Export), and you choose to share a summary with your clinician. Nothing is pulled from your record, and no data leaves this device in the demo.</p>

            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              <label className="group cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-white p-5 transition hover:border-teal-300 hover:bg-teal-50/40">
                <input type="file" accept=".xml" className="hidden" onChange={(e) => onFile(e, "xml")} />
                <FileCode className="mb-3 text-teal-600" size={26} />
                <div className="font-medium">Apple Health export.xml</div>
                <div className="mt-1 text-sm text-slate-500">Upload <span className="font-medium text-slate-600">export.xml</span> (not export_cda.xml) from your Health export.zip. Streamed in-browser - large multi-hundred-MB exports are fine.</div>
              </label>
              <label className="group cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-white p-5 transition hover:border-teal-300 hover:bg-teal-50/40">
                <input type="file" accept=".csv,.json" className="hidden" onChange={(e) => onFile(e, "auto")} />
                <FileSpreadsheet className="mb-3 text-teal-600" size={26} />
                <div className="font-medium">Upload CSV / JSON</div>
                <div className="mt-1 text-sm text-slate-500">Daily rows with the normalized fields. Most reliable upload path.</div>
              </label>
              <button onClick={loadSample} className="rounded-2xl border-2 border-teal-200 bg-teal-50 p-5 text-left transition hover:bg-teal-100/70">
                <Database className="mb-3 text-teal-700" size={26} />
                <div className="font-medium text-teal-800">Use sample Garmin data</div>
                <div className="mt-1 text-sm text-teal-700/80">30 days from a Garmin Fenix. Runs the full demo instantly.</div>
              </button>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              <span className="font-medium text-slate-700">Demo never breaks:</span> if a file will not parse, VisitPulse falls back to sample data so the flow always completes.
            </div>
          </div>
        )}

        {/* Screen 1: Data preview */}
        {screen === 1 && data && (
          <div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Parsed data preview</h1>
                <p className="mt-1 text-slate-500">Source: <span className="font-medium text-slate-700">{source}</span></p>
              </div>
              <div className="flex gap-2 text-center">
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
                  <div className="text-xl font-semibold text-teal-700">{coverage}</div><div className="text-xs text-slate-400">days</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
                  <div className="text-sm font-semibold text-teal-700">{data[0].date.slice(5)} to {lastDate.slice(5)}</div><div className="text-xs text-slate-400">window</div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SIGNALS.map((s) => {
                const w = windowAvg(data, s.key);
                const completeness = Math.round((w.n / data.length) * 100);
                const Icon = s.icon;
                return (
                  <div key={s.key} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><Icon size={16} style={{ color: SIGNAL_COLORS[s.key] }} />{s.label}</div>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${completeness >= 70 ? "bg-emerald-50 text-emerald-600" : completeness > 0 ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-400"}`}>{completeness}%</span>
                    </div>
                    <div className="mt-2"><Spark data={data} dataKey={s.key} color={SIGNAL_COLORS[s.key]} /></div>
                    <div className="mt-1 text-xs text-slate-400">avg {fmt(w.value, s.decimals)} {s.unit}</div>
                  </div>
                );
              })}
            </div>
            <NavRow onBack={() => setScreen(0)} backLabel="Upload" onNext={() => setScreen(2)} nextLabel="Analyze trends" />
          </div>
        )}

        {/* Screen 2: Trend analysis */}
        {screen === 2 && data && (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Trend analysis</h1>
            <p className="mt-1 text-slate-500">Last 7 days vs the previous 21. <span className="font-medium text-amber-600">{flaggedCount} signal{flaggedCount === 1 ? "" : "s"} flagged.</span> Shaded band = recent window.</p>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {SIGNALS.filter((s) => s.key !== "workouts").map((s) => (
                  <button key={s.key} onClick={() => setChartKey(s.key)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${chartKey === s.key ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{s.label}</button>
                ))}
              </div>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(d) => d.slice(5)} interval={4} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} domain={["auto", "auto"]} width={38} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e2e8f0" }} />
                    {recentStart && <ReferenceArea x1={recentStart} x2={lastDate} fill="#f59e0b" fillOpacity={0.09} />}
                    <Line type="monotone" dataKey={chartKey} stroke={SIGNAL_COLORS[chartKey]} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr><th className="px-4 py-2.5 font-medium">Signal</th><th className="px-4 py-2.5 font-medium">Baseline</th><th className="px-4 py-2.5 font-medium">Recent</th><th className="px-4 py-2.5 font-medium">Change</th><th className="px-4 py-2.5 font-medium">Strength</th><th className="px-4 py-2.5 font-medium">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trends.map((t) => {
                    const ds = dirStyle[t.direction] || dirStyle.stable;
                    const Icon = t.icon;
                    return (
                      <tr key={t.key} className={t.flagged ? "bg-amber-50/30" : ""}>
                        <td className="px-4 py-3"><div className="flex items-center gap-2 font-medium text-slate-700"><Icon size={15} style={{ color: SIGNAL_COLORS[t.key] }} />{t.label}</div></td>
                        <td className="px-4 py-3 text-slate-500">{fmt(t.baseline, t.decimals)} {t.unit}</td>
                        <td className="px-4 py-3 font-medium text-slate-700">{fmt(t.recent, t.decimals)} {t.unit}</td>
                        <td className="px-4 py-3">{t.pct === null ? <span className="text-slate-300">-</span> : <span className={t.direction === "concerning" ? "font-medium text-amber-600" : t.direction === "improving" ? "font-medium text-emerald-600" : "text-slate-400"}>{t.pct > 0 ? "+" : ""}{t.pct.toFixed(0)}%</span>}</td>
                        <td className="px-4 py-3"><span className="text-xs text-slate-400">{t.recent === null ? "-" : t.strength}</span></td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${ds.badge}`}>
                            <ds.Icon size={12} className={ds.iconCls} />
                            {t.flagged ? (t.direction === "missing" ? "Sparse" : "Flagged") : t.direction === "improving" ? "Improved" : "Stable"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <NavRow onBack={() => setScreen(1)} backLabel="Data" onNext={() => setScreen(3)} nextLabel="Add visit context" />
          </div>
        )}

        {/* Screen 3: Visit context */}
        {screen === 3 && data && (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Visit context</h1>
            <p className="mt-1 max-w-2xl text-slate-500">Tell us who you're seeing and why. The brief reorders to lead with the signals most relevant to this visit and suggests questions to ask. This selects relevance and questions only - it never interprets or diagnoses.</p>

            <div className="mt-6 grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <Stethoscope className="mt-6 shrink-0 text-teal-600" size={20} />
                <div className="flex-1"><Select label="Clinician you're seeing" value={visitContext.clinicianType} onChange={(v) => setCtx({ clinicianType: v })} options={CLINICIAN_OPTIONS} /></div>
              </div>
              <div className="flex items-start gap-3">
                <ClipboardList className="mt-6 shrink-0 text-teal-600" size={20} />
                <div className="flex-1"><Select label="Reason for this visit (chief complaint)" value={visitContext.chiefComplaint} onChange={(v) => setCtx({ chiefComplaint: v })} options={COMPLAINT_OPTIONS} /></div>
              </div>
              <div className="sm:col-span-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Anything else to pass along (optional - shared verbatim, not interpreted)</span>
                  <textarea value={visitContext.note} onChange={(e) => setCtx({ note: e.target.value })} rows={2}
                    placeholder="e.g. Symptoms started about two weeks ago, worse in the mornings."
                    className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-teal-400 focus:outline-none" />
                </label>
              </div>
            </div>

            {visitContext.chiefComplaint !== "general" && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
                <ShieldCheck size={16} className="mt-0.5 shrink-0" />
                <span>{CHIEF_COMPLAINTS[visitContext.chiefComplaint].why}</span>
              </div>
            )}

            <NavRow onBack={() => setScreen(2)} backLabel="Trends" onNext={() => setScreen(4)} nextLabel="Generate clinician brief" />
          </div>
        )}

        {/* Screen 4: Clinician brief (contextual) */}
        {screen === 4 && brief && (
          <div>
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold tracking-tight">Clinician brief</h1>
              <div className="flex items-center gap-2">
                <CopyBtn id="brief" copied={copied} onCopy={copy} text={briefPlainText(brief)} />
                <button onClick={handleDownloadPdf}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-700 transition hover:bg-teal-100">
                  <Download size={15} /> Download PDF
                </button>
              </div>
            </div>
            <p className="mt-1 text-slate-500">Contextual summary, generated from the trends by auditable rules. Switch the lens below to see the same data re-framed.</p>

            {/* Live lens switcher */}
            <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
              <div className="flex items-center gap-2"><Stethoscope size={16} className="shrink-0 text-teal-600" /><div className="flex-1"><Select compact value={visitContext.clinicianType} onChange={(v) => setCtx({ clinicianType: v })} options={CLINICIAN_OPTIONS} /></div></div>
              <div className="flex items-center gap-2"><ClipboardList size={16} className="shrink-0 text-teal-600" /><div className="flex-1"><Select compact value={visitContext.chiefComplaint} onChange={(v) => setCtx({ chiefComplaint: v })} options={COMPLAINT_OPTIONS} /></div></div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Pre-visit wearable summary | generated {TODAY}</span>
                <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-700">{brief.headerLabel}</span>
              </div>
              <div className="space-y-5 p-5">
                <Section title="Reason for sharing"><p>{brief.reason}</p></Section>

                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Most relevant to this visit</div>
                  {brief.why && <p className="mb-2 text-sm italic text-slate-500">{brief.why}</p>}
                  <ul className="space-y-1.5 text-sm leading-relaxed text-slate-600">
                    {brief.lead.map((t) => {
                      const ln = leadLine(t);
                      return (<li key={t.key} className="flex gap-2"><span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${toneCls[ln.tone]}`} />{ln.text}</li>);
                    })}
                  </ul>
                </div>

                {brief.otherFlagged.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-500">Also noted (flagged, outside the visit reason)</div>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-slate-600">
                      {brief.otherFlagged.map((t) => (<li key={t.key} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />{trendSentence(t)}</li>))}
                    </ul>
                  </div>
                )}

                {!brief.isGeneral && brief.otherStable.length > 0 && (
                  <p className="text-sm text-slate-400">Other tracked signals stable or limited this period: {brief.otherStable.map((t) => t.label.toLowerCase()).join(", ")}.</p>
                )}

                <Section title="Possible relevance"><p>{brief.relevance}</p></Section>

                <Section title="Suggested visit questions">
                  <ul className="space-y-1.5">{brief.questions.map((q, i) => (<li key={i} className="flex gap-2"><ChevronRight size={16} className="mt-0.5 shrink-0 text-teal-500" />{q}</li>))}</ul>
                </Section>

                <Section title="Data limitations">
                  <p>Readings are from a consumer wrist wearable, not FDA-cleared diagnostic equipment. Values can be affected by motion, fit, and skin contact; some days may be missing{brief.missing.length ? ` (limited this period: ${brief.missing.map((m) => m.label.toLowerCase()).join(", ")})` : ""}. Trends reflect a 7-day vs 21-day window and short-term variation is expected.</p>
                </Section>

                <div className="flex items-start gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0" />
                  <span>This is patient-generated wearable data and should be interpreted as <span className="font-semibold">context, not diagnosis</span>. VisitPulse supports the clinician's judgment and keeps a human in the loop - it does not interpret, triage, or make clinical recommendations.</span>
                </div>
              </div>

              {/* Feedback (flywheel) */}
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-3.5">
                {feedback ? (
                  <div className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} /> Thanks - logged as a usefulness signal. This feedback is what trains which summaries clinicians actually act on.</div>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600"><ThumbsUp size={15} className="text-teal-600" /> Was this brief useful?</span>
                    {[["acted", "Acted on it"], ["noted", "Noted"], ["not_relevant", "Not relevant"]].map(([v, lbl]) => (
                      <button key={v} onClick={() => onFeedback(v)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-teal-300 hover:bg-teal-50">{lbl}</button>
                    ))}
                  </>
                )}
              </div>
            </div>
            <NavRow onBack={() => setScreen(3)} backLabel="Visit context" onNext={() => setScreen(5)} nextLabel="Send to clinician" />
          </div>
        )}

        {/* Screen 5: Send */}
        {screen === 5 && brief && (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Send to clinician</h1>
            <p className="mt-1 text-slate-500">Paste into a patient-portal message, or hand over the brief. EHR-ready export is shown as a future integration.</p>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                  <div className="flex items-center gap-2 font-medium text-slate-700"><Send size={16} className="text-teal-600" /> Portal-ready message</div>
                  <CopyBtn id="portal" copied={copied} onCopy={copy} text={portalMsg} />
                </div>
                <pre className="whitespace-pre-wrap px-5 py-4 text-sm text-slate-600" style={{ fontFamily: "inherit" }}>{portalMsg}</pre>
              </div>

              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                    <div className="flex items-center gap-2 font-medium text-slate-700"><FileText size={16} className="text-teal-600" /> Clinician brief <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{brief.headerLabel}</span></div>
                    <CopyBtn id="brief2" copied={copied} onCopy={copy} text={briefPlainText(brief)} />
                  </div>
                  <div className="px-5 py-4 text-sm text-slate-500">One-page summary tailored to the visit, with suggested questions, limitations, and the non-diagnostic disclaimer. <button onClick={() => setScreen(4)} className="font-medium text-teal-700 underline">Review</button></div>
                </div>

                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60">
                  <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                    <div className="flex items-center gap-2 font-medium text-slate-600"><FileCode size={16} className="text-slate-400" /> EHR-ready export <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-normal text-slate-500">Future | illustrative</span></div>
                    <CopyBtn id="fhir" copied={copied} onCopy={copy} text={fhir} />
                  </div>
                  <pre className="max-h-52 overflow-auto px-5 py-4 text-xs text-slate-500">{fhir}</pre>
                  <div className="border-t border-slate-200 px-5 py-2.5 text-xs text-slate-400">FHIR-style preview only. VisitPulse does not connect to Epic/MyChart in this build - the patient-approved export is deliberately the integration path.</div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 size={16} /> Demo complete - 30 days of wearable noise compressed into a one-page, visit-specific brief.
            </div>
            <NavRow onBack={() => setScreen(4)} backLabel="Brief" onNext={() => { setData(null); setScreen(0); setError(null); setVisitContext({ clinicianType: "general", chiefComplaint: "general", note: "" }); setFeedback(null); }} nextLabel="Start over" />
          </div>
        )}
      </main>

      {/* Off-screen printable brief for Download PDF (current lens). */}
      <div className="visitpulse-print" aria-hidden="true">
        <PrintableBrief ref={printRef} brief={brief} />
      </div>

      <footer className="mx-auto max-w-5xl px-5 pb-8 pt-2 text-center text-xs text-slate-400">
        VisitPulse | signal compression before the visit | patient-approved | clinician-in-the-loop | not a diagnostic device
      </footer>
    </div>
  );
}
