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

### D7 — Ingestion layer lives in `src/ingest/` (adapters/router/reconcile)
- **Decision:** New `src/ingest/` package: `schema.js` (canonical contract),
  `adapters/*` (each with `detect`/`parse`), `adapters/registry.js`, `router.js`
  (sniff + dispatch + zip/multi-file), `reconcile.js` (merge by date with
  source-priority + provenance), `index.js` (`ingestFiles`). App.jsx imports it.
- **Why:** Keeps the single canonical contract, makes adapters independently
  testable, and keeps App.jsx UI-only. Additive — old parser behavior preserved
  by moving (not rewriting) Apple Health/CSV/JSON into the first adapters.
- **Reverse:** Re-inline the parsers into App.jsx; delete `src/ingest/`.

### D8 — Adapter interface: detect(input)->confidence, parse(input)->result
- **Decision:** `input = { name, ext, size, head, text, file }` (head = first
  ~64KB for signature sniffing without reading huge files; file = Blob for
  streaming; text = full text for small/zip-entry files). `parse` returns
  `{ records, provenance, completeness, warnings }`.
- **Why:** Lets the big Apple Health XML keep streaming from the Blob while
  text-based adapters work on strings (and stay pure/testable in Node).
- **Reverse:** Change the interface in `adapters/*` + `router.js` together.

### D9 — JSZip for client-side unzip (Android exports are zips)
- **Decision:** Add `jszip` (runtime dep) to unpack zip archives in the browser.
- **Why:** Health Connect / Google Fit (Takeout) / Samsung / Garmin all export
  zip/folder bundles; we must read many inner files client-side. JSZip is the
  de-facto lightweight, dependency-free, browser-safe option. No PHI leaves the
  device. Loaded only when a zip is uploaded.
- **Reverse:** `npm rm jszip`; the router falls back to treating zips as
  unrecognized (guided mapping / clear error).

### D10 — New-platform adapters are best-effort, marked NEEDS VALIDATION
- **Decision:** Health Connect / Google Fit / Samsung / Fitbit / Garmin adapters
  are implemented against documented/typical export structures with SYNTHETIC
  fixtures, and clearly marked "NEEDS VALIDATION AGAINST A REAL EXPORT" in code
  and ADAPTERS.md. The guided-mapping fallback covers whatever they miss.
- **Why:** Real exports are unavailable in this environment; shipping defensive
  adapters + a universal fallback beats blocking. Deterministic and safe.
- **Reverse:** Correct field mappings per ADAPTERS.md when a real export arrives.

### D11 — Condition lenses are config objects in `src/lenses/` (not code forks)
- **Decision:** Each condition is one config object (presets, heroSignal,
  featuredSignals, featuredCorrelations, briefFraming). `getActiveLens(ids)`
  merges one-or-more selected conditions (dedup presets, union featured + brief
  framing). A `heroRegistry` maps heroSignal keys -> deterministic fns (seam;
  empty today). Engines/components read the active lens — no `if(condition===…)`.
- **Why:** One codebase serves many communities; adding a condition later is
  editing a config object. Keeps engines deterministic + identical across conditions.
- **Reverse:** Delete `src/lenses/`; the brief/trends fall back to the general lens
  path (which equals today's behavior).

### D12 — Default lens reproduces current behavior exactly; 4 conditions are stubs
- **Decision:** `general` lens has empty presets / no featured signals / canonical
  section order, so brief + trends are byte-identical to before. long_covid_mecfs,
  pots_dysautonomia, migraine, lyme ship as well-structured STUBS (sensible
  presets + framing) with heroSignal keys that have no computation yet.
- **Why:** Non-breaking; later prompts fill in hero computations via the registry.
- **Reverse:** n/a (additive). Edit configs.js to evolve a condition.

### D13 — Persist selected conditions to localStorage (ids only)
- **Decision:** Selected condition ids persist in `localStorage` key
  `visitpulse.conditions` (a JSON array of ids). No health data is stored.
- **Why:** Prompt asks for persistence "consistent with how the app persists";
  ids are not PHI, so the privacy claim stays true.
- **Reverse:** Remove the load/save effect; selection becomes session-only state.
