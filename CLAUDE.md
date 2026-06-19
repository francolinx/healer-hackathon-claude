# VisitPulse - project guide for Claude Code

VisitPulse turns a patient's own wearable data (Garmin/Apple Health export) into a
clinically *contextual*, **non-diagnostic** pre-visit brief for the patient's own clinician.
It is the step before EHR integration: compressing noisy patient-generated data into
something a clinician can read in 30 seconds. Built for the Hackers and Healers hackathon
(hosts: DxAngels / Credo Health).

## Stack
- React 18 + Vite 5 (single-page app)
- recharts (charts), papaparse (CSV parsing), lucide-react (icons)
- Tailwind CSS compiled via PostCSS (`tailwind.config.js`, `postcss.config.js`,
  `src/index.css`) - no runtime CDN, styling works fully offline
- react-to-print for the client-side "Download PDF" of the brief
- jszip for client-side unzip of multi-file health exports (Android zips)
- Optional: `@supabase/supabase-js` for the feedback flywheel (gated behind env vars)
- The app lives in `src/App.jsx`; `src/feedback.js` holds the optional Supabase logger

## Run
- `npm install`
- `npm run dev`    # local dev server
- `npm run build`  # production build into dist/
- `npm test`       # vitest unit tests for the deterministic engine

## Two experiences (top-level mode toggle; BOTH must always work)
1. **Pre-Visit Brief** (clinical, "act two") — the original 6-screen flow.
2. **Health Coach** (the hero) — Historical-Best benchmarking: find the user's
   best sustained window, characterize it, and show "% back to your best".

## Architecture: FACTS vs COMMUNICATION (the governing principle)
- **FACTS** = deterministic, auditable, LLM-free. `src/healthEngine.js`
  (composite daily score, best-window selection, profile, gap, "% back",
  realistic-goal guardrails — see SCORING.md) and the clinical trend/brief code.
- **COMMUNICATION** = `src/coach.js` `generateCoachMessage(facts, options)`,
  TEMPLATE-based today with a documented LLM seam. AI may only ever *rephrase*
  facts, never invent them (grounding contract in coach.js / INTEGRATION-PLAN.md).
  No LLM/network call at runtime.

## Multi-source ingestion (`src/ingest/`) — canonical schema + adapters
- One canonical daily record (`schema.js`) is the contract; downstream never changes.
- Pluggable adapters (`adapters/*`, each `detect`/`parse`): Apple Health, generic
  CSV/JSON (verified) + Health Connect, Google Fit, Samsung, Fitbit, Garmin
  (best-effort, marked NEEDS VALIDATION — see ADAPTERS.md).
- `router.js` sniffs files, unpacks zips (JSZip, client-side) + multi-file;
  `reconcile.js` merges by date with source-priority + provenance + conflict/gap
  flags; `mapping.jsx` is the guided column-mapping fallback (any tabular file).
- Entry point `ingestFiles(fileList)` -> `{ records, sources, provenance,
  conflicts, gapDays, completeness, unmapped, warnings }`. Deterministic, no LLM.

## Condition lenses (`src/lenses/`) — config, not forks
- A lens is a config object per condition (symptom/factor presets, heroSignal,
  featuredSignals, briefFraming). `getActiveLens(ids)` merges one-or-more selected
  conditions (comorbidity). `general` = default = today's behavior exactly.
- Engines/components READ the active lens; NEVER branch on condition
  (`if (condition === 'lyme')` is banned — add to the config instead).
- `heroRegistry.js` maps heroSignal keys -> deterministic fns (seam; only `none`
  today). Ships: general (default) + long_covid_mecfs/pots_dysautonomia/migraine/
  lyme STUBS. Selection persists in localStorage (ids only). See LENSES.md.

## Code map
- `src/App.jsx` — UI for both experiences; `data` = FULL history, `recentData` =
  last 30 days (clinical). Calls `ingestFiles`; `IngestionSummary` + `GuidedMapping`
  surface sources/fields/conflicts. `CoachView` renders the engine facts.
  `buildContextualBrief(trends, ctx, lens)` is lens-aware (exported for tests).
- `src/lenses/` — condition lens config + merge + hero-registry seam.
- `src/ingest/` — ingestion layer (schema, adapters, router, reconcile, mapping).
- `src/healthEngine.js` — the FACTS engine (pure, tested in tests/).
- `src/coach.js` — the COMMUNICATION layer (template; LLM seam).
- `src/feedback.js` — optional Supabase flywheel (gated by env).
- `samples/sample_garmin_history.csv` — SYNTHETIC 2-year coach fixture
  (generator: `tests/fixtures/genHistory.mjs`).
- Clinical: `computeTrends` (7d vs prior 21), `buildContextualBrief`
  (`CLINICIAN_PROFILES` + `CHIEF_COMPLAINTS`), live lens-switcher, feedback flywheel.

## Non-negotiables (do NOT drift from these)
- NOT diagnostic. Never generate a diagnosis, assessment, triage, or treatment recommendation.
  The brief surfaces relevance + suggested questions only.
- Deterministic. The brief is templates + rules, NOT an LLM. Do not add a model to brief
  generation - it must stay auditable and hallucination-free. (Any future LLM polish may only
  reword within the deterministic structure; it never decides content.)
- Relevance reorders; it NEVER suppresses a flagged signal. A flagged signal outside the visit
  reason must still appear (in the "Also noted" section).
- Client-side only. No PHI leaves the browser. No external API or keys required.
- No real Epic/MyChart or HealthKit integration. The patient-approved export plus the
  FHIR-style preview (illustrative) are the deliberate integration story.
- Required disclaimer, verbatim: "This is patient-generated wearable data and should be
  interpreted as context, not diagnosis."
- The demo must never break: if a file won't parse, fall back to sample data.
- Coach guardrails (same spirit): the FACTS engine is deterministic/LLM-free; coach output is
  wellness framing only (sleep timing, activity, consistency), never a medical claim; robust to
  missing/partial data (score on what's present, weight by completeness, never crash); the coach
  carries the verbatim disclaimer; ADDITIVE — never break the clinical brief flow.
- Privacy claim must stay TRUE: nothing sends health data anywhere. The messaging/LLM backend is
  a FUTURE task gated on a privacy decision (see INTEGRATION-PLAN.md); do not wire it without that.

## Positioning (keep language consistent)
- A pre-visit moment, NOT continuous monitoring. Clinician-in-the-loop.
- Moat = device-agnostic translation layer + clinician-feedback flywheel. We are the OPEN layer
  (any wearable, the patient's OWN doctor), vs closed competitors (Oura+Counsel, Verily Lightpath,
  Twin Health).

## Open tasks
- [x] Add a "Download PDF" button to the brief screen (react-to-print; client-side, no API/keys).
- [x] Compile Tailwind into the build so styling has zero runtime CDN dependency
      (removes the venue-wifi risk during the demo).
- [x] Optional: persist feedback events to Supabase to make the flywheel real
      (gated behind `VITE_SUPABASE_*` env vars; falls back to local state when unset).
- [ ] Deploy to Vercel and generate a QR code for the pitch slide.
