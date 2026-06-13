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
