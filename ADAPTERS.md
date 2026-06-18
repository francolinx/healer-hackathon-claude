# ADAPTERS.md — multi-source ingestion

VisitPulse normalizes any platform's health export into one **canonical daily
record** and feeds the same downstream (trends / brief / coach). This documents
each adapter: assumed format, fields extracted, validation status, and how to
correct it when a real export arrives.

## Canonical schema (`src/ingest/schema.js`)
`{ date, resting_hr, avg_hr, steps, exercise_minutes, active_energy, spo2,
sleep_hours, workouts, bedtime_min?, wake_min? }` — missing signals are `null`
(never 0). `date` is `YYYY-MM-DD`.

## How ingestion works
1. **Router** (`router.js`) sniffs each file (and unpacks `.zip` via JSZip,
   client-side), builds an `input { name, ext, size, head, text, file }`.
2. Each **adapter** scores `detect(input)`; the highest-confidence adapter
   (≥ 0.4) parses it. Unrecognized **tabular** files go to **guided mapping**
   (`mapping.jsx`) so anything is still ingestible.
3. **Reconciliation** (`reconcile.js`) merges records across files/sources by
   date, keeping the highest-priority source per field, tagging provenance, and
   flagging conflicts + gaps.

Source priority (default, highest first):
`appleHealth → healthConnect → garmin → fitbit → samsungHealth → googleFit →
genericJson → genericCsv → guidedMapping`. Configurable via `reconcile` opts.

## Adapters

### Apple Health — `appleHealth.js` — ✅ VERIFIED (against samples)
- **Format:** `export.xml` (HealthKit). Streamed in 8MB slices (handles 100s of MB).
- **Fields:** resting_hr, avg_hr, steps, exercise_minutes, active_energy, spo2,
  sleep_hours (Asleep-only, merged intervals, attributed to wake date) + bedtime/wake, workouts.
- **Notes:** `export_cda.xml` is rejected with a helpful message (different format).

### Generic CSV — `genericCsv.js` — ✅ VERIFIED
- **Format:** tabular with canonical headers (`date,resting_hr,steps,...`).
- **Notes:** lowest-priority tabular adapter; non-canonical CSVs fall to guided mapping.

### Generic JSON — `genericJson.js` — ✅ VERIFIED
- **Format:** array of canonical records, or `{records:[...]}` / `{data:[...]}`.

### Health Connect (Android) — `healthConnect.js` — ⚠️ NEEDS REAL-EXPORT VALIDATION
- **Assumed format:** JSON array (or `{records:[...]}`) of records with
  `recordType`/`dataType`, `startTime`/`time` (+ `endTime`), and type-specific values.
- **Mapped:** Steps→steps (sum); RestingHeartRate→resting_hr; HeartRate(samples)→avg_hr;
  OxygenSaturation→spo2; ActiveCaloriesBurned(`energy.inKilocalories`)→active_energy;
  SleepSession(start→end)→sleep_hours (wake date); ExerciseSession→exercise_minutes + workouts.
- **To correct:** Health Connect's real on-device export may be an encrypted backup
  rather than JSON. If your exporter uses different `recordType` strings or value
  keys, adjust the `type` regexes / `pick()` candidate lists in `parse()`. Until
  validated, the guided-mapping fallback covers it.

### Google Fit via Takeout — `googleFit.js` — ⚠️ NEEDS REAL-EXPORT VALIDATION
- **Assumed format:** `Takeout/Fit/Daily activity metrics/*.csv` — either an
  aggregate with a `Date` column or one file per day (date from the filename).
- **Mapped:** Step count→steps; Calories (kcal)→active_energy; Move Minutes count→
  exercise_minutes; Average heart rate (bpm)→avg_hr; Min heart rate (bpm)→resting_hr (approx).
- **To correct:** column titles are locale/version-dependent; extend the candidate
  lists in `parse()`. The All-Data JSON is intentionally ignored in favor of daily aggregates.

### Samsung Health — `samsungHealth.js` — ⚠️ NEEDS REAL-EXPORT VALIDATION
- **Assumed format:** zip of `com.samsung.(s)health.*.csv`. Each CSV's **first line
  is metadata**; the real header is line 2 (we strip line 1). Signal inferred from filename.
- **Mapped:** step_count/step_daily_trend→steps; heart_rate→avg_hr; sleep
  (`sleep_duration` mins or start→end)→sleep_hours (wake date); exercise (`duration` ms)→
  exercise_minutes + workouts (+calories→active_energy).
- **To correct:** Samsung's column names (e.g. `com.samsung.health.step_count.count`,
  `day_time` epoch ms) shift across app versions; adjust `pick()` candidates and the
  filename→signal mapping.

### Fitbit — `fitbit.js` — ⚠️ NEEDS REAL-EXPORT VALIDATION
- **Assumed format:** dated JSON files (Takeout/Fitbit export). Branches on filename.
- **Mapped:** `resting_heart_rate-*`→resting_hr (`value.value`); `sleep-*`
  (`minutesAsleep`→hours, startTime/endTime→bedtime/wake); `steps-*`/`calories-*`
  (intraday→sum/day); `heart_rate-*`→avg_hr; `*active_minutes*`→exercise_minutes.
- **To correct:** Fitbit has multiple export shapes (Takeout vs account export, intraday
  vs daily). If your files differ, adjust the `kind` detection + per-kind value reads.

### Garmin Connect — `garmin.js` — ⚠️ NEEDS REAL-EXPORT VALIDATION
- **Assumed format:** `DI_CONNECT` zip of JSON; daily-summary arrays keyed by
  `calendarDate`.
- **Mapped:** totalSteps→steps; restingHeartRate→resting_hr; averageHeartRate→avg_hr;
  activeKilocalories→active_energy; moderate+vigorousIntensityMinutes→exercise_minutes;
  sleepTimeSeconds→sleep_hours.
- **To correct:** Garmin spreads fields across many files with inconsistent names;
  extend the `pick()` candidate lists and add file-specific handling as needed.

## Adding / fixing an adapter
1. Drop a real export's representative file into `tests/fixtures/sources/`.
2. Update the adapter's `detect()` (filename/header signatures) and `parse()`
   (field name candidates) to match.
3. Add/adjust a test in `tests/adapters.test.js` asserting canonical output.
4. `npm test` + `npx vite build` must pass. Flip the status here to ✅ VERIFIED.
