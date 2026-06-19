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

**2026-06-14 07:26 UTC — Phase 3: Coach UI (additive)**
- Added a top-level experience toggle (Health Coach | Pre-Visit Brief). Clinical
  flow gated behind experience==="clinical"; unchanged behaviourally.
- Added CoachView: "Your Best Self" (% back headline + progress, best-window
  score timeline with best/current shading, then-vs-now gap rows, peak/realistic
  target, confound caveats, disclaimer) and "This Week" (weekly cards + template
  coach-message preview with Copy + disclaimer + "template, not AI" note).
- Added "Use sample 2-year history" loader (bundles samples/sample_garmin_history.csv
  via Vite ?raw) that opens the coach. 30-day sample still drives the clinical demo.
- Build PASS; tests 25/25 PASS; preview serves 200; history CSV confirmed bundled.

**2026-06-14 07:29 UTC — Phase 5: docs + housekeeping**
- Updated CLAUDE.md (two experiences, FACTS/COMMUNICATION principle, code map,
  coach guardrails + privacy gate), README.md (Health Coach section + structure),
  TASKS.md (pivot status + awake-decisions). Wrote MORNING-BRIEF.md.
- Build PASS; tests 25/25 PASS.
- Deploy: NOT possible from this sandbox (no Vercel CLI/token). Repo is
  deploy-ready; documented the import + QR steps for the user in MORNING-BRIEF.md.

**2026-06-14 07:31 UTC — Polish: coach chart shading + cleanup**
- Snap best/current ReferenceArea bounds to real chart categories so the
  best-window and recent-window shading always render (gap days could otherwise
  miss the categorical X axis). Removed an unused import.
- Build PASS; tests 25/25 PASS.

**2026-06-14 20:15 UTC — Session 3 Phase A+C: ingestion framework + guided mapping**
- New src/ingest/: schema.js (canonical contract), router.js (sniff/zip/multi-file
  dispatch), reconcile.js (merge by date w/ source-priority + provenance +
  conflicts + gaps), index.js (ingestFiles/ingestInputs), adapters/{appleHealth,
  genericCsv,genericJson}.js + registry, mapping.jsx (guided column mapping +
  pure applyMapping/toISODate).
- Refactored App.onFile to ingestFiles (multi-file + zip ready); upload inputs now
  accept xml/csv/tsv/json/zip + multiple; unmapped tabular -> GuidedMapping UI.
  Removed in-App parsers (moved to ingest); kept avg helper. Downstream unchanged.
- tests/ingest.test.js: 16 tests (schema, appleHealth/csv/json adapters on real
  samples, router detection, reconcile priority/provenance/conflict/gap/missing,
  ingestInputs merge, mapping transform). Suite 42/42 PASS. Build PASS.

**2026-06-14 20:16 UTC — Session 3 Phase B: zip + multi-file**
- Router unzip now reads an ArrayBuffer (robust in browser + Node). tests/ingestZip.test.js:
  zip of canonical CSVs reconciled; multiple top-level files; unknown-in-zip -> unmapped.
- Suite 45/45 PASS. Build PASS.

**2026-06-14 20:23 UTC — Session 3 Phase D: platform adapters**
- Added adapters (each defensive, marked NEEDS VALIDATION): Health Connect,
  Google Fit (Takeout), Samsung Health, Fitbit, Garmin + shared _util.js
  (isoDay/pick/dayAgg). Registered all in registry.js.
- Synthetic fixtures under tests/fixtures/sources/ + tests/adapters.test.js
  (7 tests: detection + canonical mapping per source). Suite 52/52 PASS. Build PASS.

**2026-06-14 20:25 UTC — Session 3 Phase E: ingestion summary UI**
- Added IngestionSummary component: detected sources + per-source day counts,
  date range + gap days, signals present vs missing, cross-source conflicts
  (higher-priority kept), and best-effort/validation notes. Rendered above the
  clinical preview and the coach view after any real upload. Build PASS.

**2026-06-14 20:27 UTC — Session 3 Phase F: docs**
- Wrote ADAPTERS.md (per-source format, fields, validation status, how to fix).
- Updated CLAUDE.md (ingestion section + code map + jszip), README.md (multi-source
  section + structure), TASKS.md (ingestion status + real-export follow-ups),
  MORNING-BRIEF.md (live deploy URL + session-3 summary).
- Confirmed Vercel is connected + auto-deploys this branch; pushed session-3 work
  so the ingestion layer goes live. Build PASS; tests 52/52.

**2026-06-15 00:13 UTC — Session 4 Phase A: condition lens module**
- New src/lenses/: schema.js (lens shape + normalizeLens + mergeLenses + default
  section order + HERO_SIGNALS), configs.js (general default + 4 stubs:
  long_covid_mecfs, pots_dysautonomia, migraine, lyme), heroRegistry.js (seam;
  only "none" registered), index.js (getLens/getActiveLens/LENS_OPTIONS).
- tests/lenses.test.js: 9 tests (load, default reproduces baseline, single +
  multi-select dedup merge, hero registry seam). Suite 61/61 PASS. Build PASS.

**2026-06-15 00:20 UTC — Session 4 Phase B/C/D: lens wired into UI**
- Condition selector bar (General + 4 chips, single/multi-select) under the mode
  toggle; selection persisted to localStorage (ids only). activeLens = getActiveLens.
- Brief is lens-aware: buildContextualBrief(trends, ctx, lens) adds condition
  framing line, lens suggested questions, featured-signal ordering, track-factors
  section, and a "· <condition>" header; briefPlainText is section-order-driven
  (BRIEF_SECTIONS). DEFAULT lens = byte-identical to before.
- Trends: lens-featured signals get a star + a subtitle note. Visit context shows
  condition symptom/factor preset chips that quick-add to the free-text note.
- Exported buildContextualBrief/briefPlainText; tests/brief.lens.test.js (default
  baseline, condition reframe, multi-condition merge). Suite 67/67 PASS. Build PASS.

**2026-06-15 00:22 UTC — Session 4 Phase E: docs**
- Wrote LENSES.md (schema, selection/merge, hero seam, per-condition status,
  how-to-add). Updated CLAUDE.md (lens section + code map + "config not forks"
  rule), README.md (condition lenses section + structure), TASKS.md (lens status +
  next-prompt hero registrations).
- Build PASS; tests 67/67.

**2026-06-15 00:32 UTC — Session 5 Phase A+B: correlation engine + hero computations**
- src/lenses/correlation.js: pure lagged Pearson engine (toSeries, eventSeries,
  pearson, stdDev, alignedPairs, laggedCorrelation, strengthLabel). Tests (8).
- src/lenses/heroes.js: registers all four heroes via the registry:
  pots(orthostatic_hr) HR elevation/instability/coupling + activity tolerance +
  honest standing-HR gap; migraine(trigger_correlation) lagged triggers vs attack
  log + attack stats (+ honest "log attacks" path with wearable proxy patterns);
  lyme(symptom_flare_load) reuses the trigger engine; long_covid(pem_load)
  exertion->next-day resting HR. Imported for side-effect registration in index.js.
- Synthetic fixtures + tests/heroes.test.js: POTS patterns + gap, migraine planted
  sleep->attack (detected, lag1, ranked #1) vs spurious steps (weaker), lyme flare,
  PEM, missing-data safety, registry dispatch. Updated lenses.test seam test.
- Suite 85/85 PASS. Build PASS.

**2026-06-15 00:35 UTC — Session 5 Phase C: hero facts in the brief**
- Wired computeHero into App: heroFactsList (one per selected condition's heroSignal;
  comorbidity shows each; general -> none), from full history.
- HeroFocus component renders a deterministic "Condition focus" section in the brief
  (rows, proxy patterns, notes, honest gaps). briefPlainText(brief, heroList) folds it
  into copy/PDF after the condition framing; PrintableBrief shows it too.
- tests/brief.lens.test.js: hero text folded in / omitted. Suite 87/87 PASS. Build PASS.

**2026-06-15 00:38 UTC — Session 5 Phase D: docs**
- SCORING.md §9 (correlation engine + all four hero computations math).
- LENSES.md: all four conditions -> "implemented"; symptom-log note.
- CLAUDE.md (heroes/correlation in lens section + code map), README.md (condition
  heroes paragraph), TASKS.md (heroes done; next = symptom-logging UI).
- Build PASS; tests 87/87.
