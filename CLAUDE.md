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
- Optional: `@supabase/supabase-js` for the feedback flywheel (gated behind env vars)
- The app lives in `src/App.jsx`; `src/feedback.js` holds the optional Supabase logger

## Run
- `npm install`
- `npm run dev`    # local dev server
- `npm run build`  # production build into dist/

## Architecture (all in src/App.jsx)
- 6-screen flow: Upload -> Data preview -> Trend analysis -> Visit context -> Clinician brief -> Send.
- Parsers: Apple Health `export.xml` (DOMParser, best-effort), CSV (papaparse), JSON, plus
  deterministic built-in sample data.
- Trend engine (`computeTrends`): last 7 days vs the prior 21, per-signal flags + signal strength
  + data completeness.
- Contextual brief: `CLINICIAN_PROFILES` (specialty -> signal priority + framing) and
  `CHIEF_COMPLAINTS` (complaint -> relevant signals + non-diagnostic "why" line + emphasized
  question) drive `buildContextualBrief()`, which reorders the brief to lead with relevant
  signals and surfaces complaint-specific questions.
- A live lens-switcher on the brief screen re-runs the recompose; feedback buttons capture a
  usefulness signal (the flywheel).

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
