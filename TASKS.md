# VisitPulse - build tasks for Claude Code

Work top to bottom. Respect every guardrail in `CLAUDE.md` (no diagnosis, deterministic brief,
never suppress a flagged signal, client-side only, demo never breaks). Run `npm run build`
after each task to confirm it compiles.

## 1. Download-PDF button on the Clinician brief screen  (highest priority)
- Add `react-to-print` (`npm i react-to-print`).
- Add a "Download PDF" button beside the existing Copy button on the brief screen.
- The PDF must capture the brief for the CURRENT lens: visit-context label, reason for sharing,
  the "most relevant" section, any "also noted" flags, possible relevance, suggested questions,
  data limitations, and the non-diagnostic disclaimer.
- Pure client-side. No API, no keys.
- Acceptance: clicking prints/saves a clean one-page PDF; `npm run build` passes.

## 2. Compile Tailwind into the build (remove the runtime CDN)  (do before deploying)
- Install `tailwindcss postcss autoprefixer`; init config; add `src/index.css` with the three
  @tailwind directives; import it in `main.jsx`.
- Remove the `<script src="https://cdn.tailwindcss.com">` line from `index.html`.
- Acceptance: UI looks identical; `npm run build` passes; styling works fully offline (no runtime
  CDN). This removes the venue-wifi risk during the demo.

## 3. Deploy to Vercel + QR code
- Framework preset: Vite (build `npm run build`, output `dist`).
- Get the production URL; generate a QR code for the pitch slide.
- Note: the deploy runs under your Vercel account - you may need to authorize/run it from your
  local import rather than the browser sandbox.

## 4. (Optional) Make the feedback flywheel real
- Wire the brief's feedback buttons to write `{ ts, clinicianType, chiefComplaint, value }` to a
  Supabase table.
- Gate behind an env var; if unset, fall back to local state (never break the demo).
- Acceptance: a click inserts a row when configured; offline still works.

## Test fixture
- `samples/sample_garmin.csv` is a synthetic 30-day file (NOT real patient data). Use it to test
  the CSV upload path and to reproduce the sample-data demo via upload.
- `samples/sample_garmin_history.csv` is a synthetic ~2-year file for the Health Coach
  (generator: `tests/fixtures/genHistory.mjs`). Used by the coach demo loader and the unit tests.

## Strategic pivot — Health Coach (Historical-Best benchmarking)  [overnight build]
Status: DONE and build/test-verified. See NIGHT-LOG.md, DECISIONS.md, SCORING.md,
INTEGRATION-PLAN.md, MORNING-BRIEF.md.
- [x] Sleep-parsing fix (asleep-only, merge overlaps, attribute to wake date) + parse full history.
- [x] Deterministic Historical-Best engine (`src/healthEngine.js`) + `SCORING.md`.
- [x] Realistic-goal guardrails (recency-aware target, confound flags).
- [x] Coach UI: experience toggle, "Your Best Self", "This Week", template nudge. Clinical flow intact.
- [x] Communication-layer adapter (`src/coach.js`) template impl + LLM seam; `INTEGRATION-PLAN.md`.
- [x] Unit tests (vitest) for the engine + coach (`npm test`, 25 passing).

## Multi-source ingestion layer  [session 3 — DONE, build/test-verified]
Status: shipped + deployed (auto-deploys from this branch on Vercel). See
ADAPTERS.md, DECISIONS.md (D7–D10), NIGHT-LOG.md.
- [x] Canonical schema + pluggable adapter framework (`src/ingest/`).
- [x] Apple Health + generic CSV/JSON refactored into adapters (verified vs samples).
- [x] Format router: sniff + zip unpack (JSZip) + multi-file + dispatch.
- [x] Reconciliation: merge by date, source-priority per field, provenance,
      conflict + gap flags, missing-field safety.
- [x] Guided column-mapping fallback (any tabular file ingestible).
- [x] Adapters (best-effort, NEEDS VALIDATION): Health Connect, Google Fit,
      Samsung Health, Fitbit, Garmin — each with synthetic fixture + tests.
- [x] Ingestion summary UI (sources, counts, range, present/missing, conflicts).
- [x] Tests: 52 passing (engine, coach, ingest, adapters, zip).

### Ingestion — waiting on real exports (correct field maps per ADAPTERS.md)
- Validate Health Connect / Google Fit / Samsung / Fitbit / Garmin adapters
  against one real export each; flip status to ✅ and adjust `pick()` candidates.

## Condition "lens" architecture  [session 4 — DONE, build/test-verified]
Status: shipped. Config-driven lenses (no forks). See LENSES.md, DECISIONS.md (D11–D13).
- [x] `src/lenses/` schema + merge + getActiveLens + heroRegistry seam.
- [x] Default (general) lens reproduces baseline exactly; 4 condition stubs
      (long_covid_mecfs, pots_dysautonomia, migraine, lyme) with presets + framing.
- [x] Condition selector (single + multi-select), persisted to localStorage (ids only).
- [x] Lens-aware brief (framing line, suggested Qs, featured ordering, track-factors,
      section order), trends featured ★, visit-context preset chips.
- [x] Tests: lenses + lens-aware brief (67 total passing).

### Condition hero computations  [session 5 — DONE]
- [x] Lagged-Pearson correlation engine (`src/lenses/correlation.js`).
- [x] All four heroes registered (`src/lenses/heroes.js`): POTS (orthostatic_hr),
      migraine (trigger_correlation), Lyme (symptom_flare_load), long COVID (pem_load).
- [x] Surfaced in the brief "Condition focus" section (screen + copy + PDF).
- [x] Synthetic fixtures + tests (correlation 8, heroes; planted assoc detected,
      spurious avoided, missing-data safe). Suite 87 passing. LENSES.md all four "implemented".

### Lenses — next prompts
- Add a symptom/attack LOGGING UI so migraine/Lyme trigger correlation runs on real
  in-app data (today the engine reads `options.symptomLog`; live brief shows the
  honest "log attacks" state). Then those heroes show real associations in the demo.

### Waiting on the user (decisions I could not make)
- **Privacy posture (Phase 4 gate, the big one):** what — if anything — may leave the device for a
  future weekly LLM nudge backend (on-device vs server, consent, encryption, key management).
  Until decided, NO messaging/LLM/network is wired and "no health data leaves the device" stays true.
- Default experience is `clinical` (preserves the existing demo). Flip the `useState("clinical")`
  default in `src/App.jsx` to `"coach"` if you want the coach to lead.
- Deploy to Vercel + QR (carried over): see DEPLOY.md / MORNING-BRIEF.md.
