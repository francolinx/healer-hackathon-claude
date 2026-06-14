# DECISIONS.md

Judgment calls made autonomously while the user was asleep. Each entry: the
decision, why, and how to reverse it if you disagree.

---

### D1 — Keep clinical flow on a derived `recentData`; parse full history into `data`
- **Decision:** Parsers now return the patient's **entire** history. The new
  coach/engine consumes the full array; the existing clinical screens (preview,
  trend table, brief) consume a derived `recentData = data.slice(-30)`.
- **Why:** The Historical-Best engine needs full history, but the clinical brief
  is explicitly a "last 30 days vs prior 21" artifact and its copy says "30
  days." Slicing keeps the clinical demo byte-for-byte identical to today while
  unlocking full history for the coach. Additive, low-risk.
- **Reverse:** Set `RECENT_WINDOW_DAYS` large, or pass `data` instead of
  `recentData` in screens 1–2 and the `trends`/`brief` memos in App.jsx.

### D2 — Sleep parsing: asleep-only, merge overlaps, attribute to wake date
- **Decision:** In the XML parser, sleep now counts only `Asleep*` category
  values (excludes `InBed`/`Awake`), merges overlapping intervals before summing
  (so multi-device or staged records don't double-count), and attributes a
  night's sleep to the **wake date** (the interval's end day).
- **Why:** Apple Health emits overlapping `InBed` + staged `Asleep` records;
  naive summation massively over-counts. Wake-date attribution matches how people
  think about "last night's sleep." This is the Phase-0 fix called for in the
  brief.
- **Reverse:** Revert `accumulateSleep`/the sleep post-processing block in
  `parseAppleHealthXML`.

### D3 — Synthetic multi-year fixture (no real long-history sample exists)
- **Decision:** Generated `samples/sample_garmin_history.csv` (clearly marked
  **SYNTHETIC**) — ~2 years of daily rows with a planted "best" 5-week stretch
  and a declined recent month — and a "Use sample 2-year history" loader for the
  coach demo. Also used as a test fixture.
- **Why:** Window detection needs multi-month/multi-year data; samples/ had only
  30 days. Synthetic + deterministic keeps the demo offline and reproducible.
- **Reverse:** Delete the file + loader; the engine still works on any upload.

### D4 — Composite score is wellness-relative, NOT diagnostic
- **Decision:** The daily composite score maps each metric to a 0–1 "wellness"
  sub-score via fixed piecewise-linear ranges (documented in SCORING.md),
  completeness-weighted, renormalized over available metrics.
- **Why:** Needed a single comparable number for "best window" and "% back."
  Ranges are general-wellness, framed as context, never as clinical thresholds or
  diagnosis. No metric implies a medical assessment.
- **Reverse:** Tune ranges/weights in `METRIC_SPECS` in `src/healthEngine.js`.

### D5 — Communication layer is template-only tonight (LLM seam documented)
- **Decision:** `generateCoachMessage(facts, options)` ships a deterministic
  template implementation. A clearly-marked seam allows a future LLM impl that
  may ONLY reference fields present in `facts` (grounding contract in comments).
  No LLM/network call at runtime.
- **Why:** Hard requirement: offline, zero external deps, no PHI leaves device.
- **Reverse:** Implement the documented `llm` strategy behind the same adapter
  once the privacy posture (Phase 4) is decided.

### D6 — Added `vitest` as the only new dev dependency
- **Decision:** Added `vitest` (dev-only) for the deterministic-engine unit
  tests; `npm test` runs it. No config file needed beyond defaults.
- **Why:** Lightweight, Vite-native, no runtime impact, no production bundle
  change. The brief explicitly permits a minimal runner.
- **Reverse:** `npm rm -D vitest`, delete `tests/`, drop the `test` script.
