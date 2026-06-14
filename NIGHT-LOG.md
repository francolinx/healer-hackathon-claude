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

**2026-06-14 07:20 UTC — Phase 1+2: Historical-Best engine**
- Added `src/healthEngine.js` (pure, LLM-free): completeness-weighted daily
  composite score, calendar-timeline rolling windows, best-window selection with
  a 60% coverage guard, behavioral profile, current state, per-metric gaps,
  "% back to your best", realistic-goal guardrails (recency-aware target +
  confound flags). Documented in SCORING.md.
- Added synthetic 2-year fixture generator (tests/fixtures/genHistory.mjs) and
  samples/sample_garmin_history.csv (665 rows, planted best window + decline).
- Smoke test: best window 2025-03-26..04-29 (score 95.5, 14mo ago) vs current
  45.8 -> 48% back; gaps correct; no spurious confounds.
- Build result: PASS.

**2026-06-14 07:18 UTC — Tests: deterministic engine**
- Added vitest (dev dep) + `npm test`/`npm run test:watch`.
- tests/healthEngine.test.js: 14 tests covering sub-score clamping, completeness
  weighting + missing data, window characterization, best-window detection,
  % back + gaps, realistic-target/OLD_PEAK path, gap/missing robustness,
  LOW_CURRENT_COVERAGE, and the synthetic fixture (~14mo best, real gap).
- Result: 14/14 PASS. Build: PASS (engine still pure module).

**2026-06-14 07:21 UTC — Phase 4: communication layer (template) + scaffold**
- Added src/coach.js: generateCoachMessage(facts, options) template impl with a
  documented LLM strategy seam + grounding contract; buildCoachParts (UI),
  weeklySummary, clock formatting. No LLM/network. Disclaimer verbatim.
- tests/coach.test.js: 11 tests incl a grounding check (every multi-digit number
  in the message traces to a fact), determinism, celebrate-at-best, LLM-seam
  throws. Suite now 25/25 PASS.
- Wrote INTEGRATION-PLAN.md (future messaging/LLM + privacy decisions gate).
- Build result: PASS.
