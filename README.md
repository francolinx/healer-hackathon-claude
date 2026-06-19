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

## Health Coach (Historical-Best benchmarking)

VisitPulse also has a second experience — toggle **Health Coach** at the top. It scans the user's
**entire** history, finds the window when they were genuinely at their best, characterizes what they
were doing then, and shows **"% back to your best."** *"We find the best version of you that already
existed in your data, and show you the receipts."*

Demo: on the Upload screen click **Use sample 2-year history** (synthetic). You'll see:
- **Your Best Self** — the headline *% back to your best*, the best 5-week window on a daily-score
  timeline (best window + last 30 days shaded), a **then-vs-now** gap per signal, a peak-vs-realistic
  **target**, and confound caveats (seasonality, sparse recent data, old peak).
- **This Week** — last-7-day pattern (sleep, bedtime + consistency, steps, workouts) and a **template
  coach nudge** you can copy.

Architecture — **FACTS vs COMMUNICATION** (see `SCORING.md`, `INTEGRATION-PLAN.md`):
- **Facts** are deterministic and **LLM-free** (`src/healthEngine.js`): completeness-weighted daily
  score, best-window selection, behavioral profile, gap, "% back", realistic-goal guardrails.
- **Communication** (`src/coach.js`) is **template-based** today, with a documented seam so a future
  grounded LLM can phrase nudges — it may only ever rephrase the facts, never invent them. No LLM or
  network call runs in this build; coaching stays wellness-framed and carries the disclaimer.

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

## Condition lenses (one codebase, many communities)

Pick a **condition focus** (top bar) — long COVID/ME-CFS, POTS/dysautonomia, migraine,
Lyme, or several at once for comorbidity. A lens is **configuration, not a code fork**
(`src/lenses/`): it sets the symptom/factor presets, which signals are featured, and how
the pre-visit brief is framed. The deterministic engines are identical across conditions —
only the config changes, so adding a condition later is editing a config object. The
**General** default reproduces the app's original behavior exactly. See **LENSES.md**.

All four conditions are implemented with deterministic "hero" computations surfaced in the
brief's **Condition focus** section: **POTS** shows HR elevation/instability/coupling + activity
tolerance (and honestly flags that standing/orthostatic HR isn't in wearable exports);
**migraine** & **Lyme** show lagged trigger↔attack/flare associations (auditable r + lag + n)
from a logged attack list; **long COVID/ME-CFS** shows exertion → next-day resting-HR (a PEM
proxy). Built on a pure lagged-Pearson engine — non-diagnostic, associations not causes,
client-side. See SCORING.md §9.

## Multi-source ingestion (any platform, especially Android)

Upload **one or many files, or a `.zip`** from any platform — VisitPulse sniffs each file,
routes it to the right adapter, and **reconciles everything into the one canonical schema** the
rest of the app consumes. All client-side, deterministic, no PHI leaves the device.

Adapters (see **ADAPTERS.md** for assumed formats + validation status):
- ✅ **Apple Health** (`export.xml`), **generic CSV/JSON** — verified against samples.
- ⚠️ **Health Connect**, **Google Fit (Takeout)**, **Samsung Health**, **Fitbit**, **Garmin
  Connect** — best-effort against documented formats, marked *NEEDS VALIDATION* until checked
  against a real export.

How it works (`src/ingest/`): **router** (sniff + unzip via JSZip + multi-file) →
**adapters** (`detect`/`parse`) → **reconciliation** (merge by date, source-priority per field,
provenance, conflict + gap flags). Anything tabular we can't auto-map opens a **guided
column-mapping** UI (pick which column is which canonical field + date format) — so *any* tabular
export is ingestible. After upload, an **ingestion summary** shows detected sources, record
counts, date range, which signals are present vs missing, and any cross-source conflicts.

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
    App.jsx           # UI for both experiences (clinical brief + health coach)
    healthEngine.js   # FACTS layer: deterministic Historical-Best engine (LLM-free)
    coach.js          # COMMUNICATION layer: template coach messages (+ LLM seam)
    feedback.js       # optional Supabase feedback logger (no-op when unconfigured)
    ingest/           # multi-source ingestion: schema, adapters/, router, reconcile, mapping
    lenses/           # condition lenses: schema, configs, hero-registry seam (config not forks)
  samples/
    sample_garmin.csv          # 30-day clinical demo fixture
    sample_garmin_history.csv  # SYNTHETIC 2-year coach fixture
  tests/              # vitest: engine, coach, ingest, adapters; fixtures/ (synthetic exports)
  SCORING.md          # how the engine computes its facts
  ADAPTERS.md         # each ingestion source: format, fields, validation status
  LENSES.md           # condition lens schema + per-condition status
  INTEGRATION-PLAN.md # future messaging/LLM design + privacy gate
```

Run the tests with `npm test` (vitest).

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
