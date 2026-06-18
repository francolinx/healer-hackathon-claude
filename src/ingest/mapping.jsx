/* ------------------------------------------------------------------ */
/* ingest/mapping.jsx — guided column-mapping fallback (universal net)  */
/* ------------------------------------------------------------------ */
//
// When the router can't confidently map a tabular file, we show the user its
// columns and let them map each to a canonical field + pick a date format. This
// makes ANY tabular export ingestible. The transform (`applyMapping`/`toISODate`)
// is pure + deterministic and unit-tested; the component is thin UI around it.

import React, { useMemo, useState } from "react";
import { NUMERIC_FIELDS, FIELD_LABELS, normalizeRecords, parseCsvText, isNum } from "./schema.js";

export const DATE_FORMATS = [
  { value: "auto", label: "Auto-detect" },
  { value: "iso", label: "YYYY-MM-DD (ISO)" },
  { value: "mdy", label: "MM/DD/YYYY (US)" },
  { value: "dmy", label: "DD/MM/YYYY (EU)" },
  { value: "ymd", label: "YYYY/MM/DD" },
  { value: "epoch_ms", label: "Unix epoch (ms)" },
  { value: "epoch_s", label: "Unix epoch (s)" },
];

// Convert one cell to an ISO date string (YYYY-MM-DD) per the chosen format.
export function toISODate(value, fmt = "auto") {
  if (value === null || value === undefined || value === "") return null;
  let s = String(value).trim();
  if ((fmt === "epoch_ms" || (fmt === "auto" && /^\d{12,}$/.test(s))) && /^\d+$/.test(s)) {
    const d = new Date(Number(s)); return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  if (fmt === "epoch_s" && /^\d+$/.test(s)) {
    const d = new Date(Number(s) * 1000); return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  s = s.split(/[ T]/)[0]; // drop any time component
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (fmt === "iso" || (fmt === "auto" && iso)) return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
  const parts = s.split(/[/\-.]/).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 3) return iso ? s : null;
  let y, mo, d;
  if (fmt === "mdy") [mo, d, y] = parts;
  else if (fmt === "dmy") [d, mo, y] = parts;
  else if (fmt === "ymd") [y, mo, d] = parts;
  else { // auto: 4-digit-first => Y/M/D, else assume M/D/Y
    if (parts[0].length === 4) [y, mo, d] = parts; else [mo, d, y] = parts;
  }
  if (!y || !mo || !d) return null;
  if (y.length === 2) y = "20" + y;
  const pad = (x) => String(x).padStart(2, "0");
  if (Number(mo) > 12 || Number(d) > 31) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

// Pure transform: rows + {canonicalField: columnName} + dateFormat -> canonical records.
export function applyMapping(rows, map, dateFmt = "auto") {
  const dateCol = map.date;
  if (!dateCol) return [];
  const out = [];
  for (const r of rows || []) {
    const iso = toISODate(r[dateCol], dateFmt);
    if (!iso) continue;
    const rec = { date: iso };
    for (const f of NUMERIC_FIELDS) {
      const col = map[f];
      const v = col ? r[col] : undefined;
      rec[f] = v === "" || v === undefined || v === null ? null : Number(v);
      if (Number.isNaN(rec[f])) rec[f] = null;
    }
    out.push(rec);
  }
  return normalizeRecords(out);
}

// Best-effort auto-guess of column->field by fuzzy header name match.
function autoGuess(columns) {
  const map = {};
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const cols = columns.map((c) => ({ raw: c, n: norm(c) }));
  const want = {
    date: ["date", "day", "calendardate", "datetime", "time"],
    resting_hr: ["restinghr", "restingheartrate", "rhr"],
    avg_hr: ["avghr", "averageheartrate", "heartrate", "hr"],
    steps: ["steps", "stepcount", "stepcount"],
    exercise_minutes: ["exerciseminutes", "moveminutes", "activeminutes", "exercise"],
    active_energy: ["activeenergy", "calories", "kcal", "energy"],
    spo2: ["spo2", "oxygensaturation", "bloodoxygen", "oxygen"],
    sleep_hours: ["sleephours", "sleep", "minutesasleep", "asleep"],
    workouts: ["workouts", "workout", "exercisesessions", "activities"],
    bedtime_min: ["bedtime", "sleepstart"],
    wake_min: ["waketime", "wake", "sleepend"],
  };
  for (const [field, keys] of Object.entries(want)) {
    const hit = cols.find((c) => keys.some((k) => c.n === k)) || cols.find((c) => keys.some((k) => c.n.includes(k)));
    if (hit) map[field] = hit.raw;
  }
  return map;
}

const MAP_FIELDS = ["date", ...NUMERIC_FIELDS];

export function GuidedMapping({ input, onComplete, onCancel }) {
  const parsed = useMemo(() => parseCsvText(input.text), [input]);
  const columns = parsed.meta && parsed.meta.fields ? parsed.meta.fields.filter(Boolean) : [];
  const rows = parsed.data || [];
  const [map, setMap] = useState(() => autoGuess(columns));
  const [dateFmt, setDateFmt] = useState("auto");

  const preview = useMemo(() => applyMapping(rows.slice(0, 8), map, dateFmt), [rows, map, dateFmt]);
  const allMapped = applyMapping(rows, map, dateFmt);
  const setField = (field, col) => setMap((m) => ({ ...m, [field]: col || undefined }));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 text-lg font-semibold text-slate-800">
        <ColumnsIcon /> Map your columns
      </div>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        We couldn't auto-recognize <span className="font-medium text-slate-700">{input.name}</span>, so map its columns to
        the fields VisitPulse understands. Only <span className="font-medium">Date</span> is required; leave the rest blank if absent.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {MAP_FIELDS.map((f) => (
          <label key={f} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <span className="text-sm font-medium text-slate-600">{FIELD_LABELS[f] || f}{f === "date" && <span className="text-amber-500"> *</span>}</span>
            <select value={map[f] || ""} onChange={(e) => setField(f, e.target.value)}
              className="max-w-[55%] rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 focus:border-teal-400 focus:outline-none">
              <option value="">— none —</option>
              {columns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        ))}
        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
          <span className="text-sm font-medium text-slate-600">Date format</span>
          <select value={dateFmt} onChange={(e) => setDateFmt(e.target.value)}
            className="max-w-[55%] rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 focus:border-teal-400 focus:outline-none">
            {DATE_FORMATS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Preview ({allMapped.length} dated rows)</div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-slate-400">
              <tr>{["date", ...NUMERIC_FIELDS].filter((f) => f === "date" || map[f]).map((f) => <th key={f} className="px-2 py-1.5 font-medium">{FIELD_LABELS[f] || f}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.slice(0, 5).map((r, i) => (
                <tr key={i}>{["date", ...NUMERIC_FIELDS].filter((f) => f === "date" || map[f]).map((f) => <td key={f} className="px-2 py-1.5 text-slate-600">{isNum(r[f]) || f === "date" ? String(r[f] ?? "-") : "-"}</td>)}</tr>
              ))}
              {preview.length === 0 && <tr><td className="px-2 py-2 text-slate-400">No rows mapped yet — check the Date column / format.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button onClick={onCancel} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">Cancel</button>
        <button onClick={() => onComplete(allMapped, input.name)} disabled={!map.date || allMapped.length === 0}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40">
          Use these {allMapped.length} rows
        </button>
      </div>
    </div>
  );
}

function ColumnsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-teal-600" aria-hidden>
      <rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="18" rx="1" />
    </svg>
  );
}
