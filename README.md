# VisitPulse

**Wearable noise into a patient-approved pre-visit brief clinicians can actually read.**

VisitPulse takes a patient's own Garmin/Apple Health data (via the patient-approved Apple Health export), compresses 30 days of it into a 7-day-vs-21-day trend analysis, and generates a one-page, **non-diagnostic** clinician brief plus a portal-ready message. It is the step *before* EHR integration: turning patient-generated data into something a clinician can read in 30 seconds.

This is **not** a diagnostic device, **not** an AI doctor, and does **not** connect to Epic/MyChart or HealthKit. The patient-approved export is deliberately the integration path.

---

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

> Tailwind CSS is compiled via PostCSS at build time (`tailwind.config.js` / `postcss.config.js` / `src/index.css`), so styling works fully offline - no runtime CDN, no venue-wifi risk during the demo.

### Build for a deploy
```bash
npm run build && npm run preview
```

---

## Demo path (the one to show judges)

1. **Upload** screen -> click **Use sample Garmin data**. (Bulletproof: never breaks.)
2. **Data preview** -> 30-day coverage, per-signal completeness, sparklines.
3. **Trend analysis** -> last 7 days vs prior 21; flagged changes with % change and signal strength; switch the chart between signals; shaded band = recent window.
4. **Clinician brief** -> reason for sharing, key trends, possible relevance, suggested visit questions, data limitations, and the non-diagnostic disclaimer. Flip the lens (clinician/complaint) to re-frame the same data live, **Download PDF** for a clean one-page handout, and use the feedback buttons (the flywheel).
5. **Send to clinician** -> copy the portal-ready message, copy the brief, and view the illustrative FHIR-style export (clearly labeled "future").

The sample data has a planted clinical arc (resting HR up, sleep/steps/exercise down, SpO2 sparse) so the trend engine and brief have something real to surface.

---

## Upload formats

**CSV / JSON** is the most reliable upload path. One row per day, normalized to:

```json
{
  "date": "2026-06-13",
  "resting_hr": 68,
  "avg_hr": 82,
  "steps": 6420,
  "exercise_minutes": 24,
  "active_energy": 410,
  "spo2": 97,
  "sleep_hours": 6.2,
  "workouts": 1
}
```

CSV uses the same field names as headers. Missing fields/days are handled and shown as reduced completeness.

**Apple Health `export.xml`** is parsed best-effort (resting HR, heart rate, steps, exercise minutes, active energy, SpO2, sleep analysis, workouts). Real exports can be hundreds of MB; for a live demo, prefer the sample data or a CSV. If a file fails to parse, the app falls back to sample data so the flow always completes.

---

## Drop into an existing Vite repo

Everything lives in `src/App.jsx` (single file, default export). To reuse it:

```bash
npm install recharts papaparse lucide-react
```

Copy `src/App.jsx` (plus `src/feedback.js`), render `<VisitPulse />`, and make sure Tailwind is configured in the host repo. For the PDF button also `npm install react-to-print`.

---

## Project structure

```
visitpulse/
  index.html          # mounts #root
  package.json
  vite.config.js
  tailwind.config.js  # Tailwind compiled at build time (no runtime CDN)
  postcss.config.js
  .env.example        # optional Supabase vars for the feedback flywheel
  src/
    main.jsx          # React entry (imports index.css)
    index.css         # @tailwind directives + print styles
    App.jsx           # the VisitPulse app (6 screens, parsers, trend engine, brief, PDF)
    feedback.js       # optional Supabase feedback logger (no-op when unconfigured)
```

---

## Optional: feedback flywheel persistence

The brief's feedback buttons ("Acted on it" / "Noted" / "Not relevant") write a row to
Supabase **only if** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set (see
`.env.example`). If they are unset, feedback stays in local state and the demo runs fully
offline - it never breaks. Only the visit-context labels and the usefulness signal are
persisted; no wearable data leaves the browser.

---

## What it deliberately does NOT do

- No native HealthKit integration (patient-approved export instead).
- No Epic/MyChart write-back (FHIR preview is illustrative only).
- No diagnosis, triage, or clinical recommendations.
- No AI doctor chatbot.

> "We are not trying to integrate another dashboard into Epic today. We are solving the step before that: converting noisy patient-generated data into a clinician-readable pre-visit brief."
