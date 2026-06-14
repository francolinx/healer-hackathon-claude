# NIGHT-LOG

Append-only log of the autonomous overnight session. Newest entries at the bottom.

---

**2026-06-14 07:07 UTC — Phase 0a: planning + baseline**
- Read CLAUDE.md, TASKS.md, README.md, PITCH.md, samples/, and src/App.jsx end to end.
- Confirmed `npx vite build` is clean on the existing app (PDF export, compiled
  Tailwind, streaming XML parser, vision hero all present from earlier work).
- Noted samples/ contains only `sample_garmin.csv` (30 days). No Raymond/COPD or
  long-history fixture exists — will generate a synthetic multi-year fixture for
  the engine tests and a coach demo loader (see DECISIONS.md).
- Wrote PLAN.md (phase sequence), DECISIONS.md, this log.
- Build result: PASS.

**2026-06-14 07:12 UTC — Phase 0b/0c: sleep fix + full history**
- Rewrote `parseAppleHealthXML` sleep handling: counts only `Asleep*` stages
  (InBed/Awake excluded, InBed used only as fallback when no Asleep records
  exist), merges overlapping/contiguous intervals, attributes each night to its
  WAKE date, and extracts bedtime (mins-after-noon) + wake (mins-after-midnight).
- Parser now returns FULL history (removed `slice(-30)`). Added optional
  `bedtime_min`/`wake_min` to FIELDS so CSV/JSON carry timing too.
- Clinical flow unchanged behaviourally: added `recentData = data.slice(-30)` and
  pointed preview/trends/brief at it (D1).
- Validated merge logic in Node: 3 overlapping asleep segments -> 7.5h single
  night on the wake day; bedtime/wake correct.
- Build result: PASS.
