# PLAN.md — Overnight build: Historical-Best Benchmarking + Coach

Goal: extend VisitPulse from a one-time clinical brief into a personal health
accountability coach, **additively** (the clinical pre-visit brief stays fully
working). New hero feature: **Historical-Best Benchmarking** — find the window
when the user was genuinely at their best, characterize it, and coach them back.

Architecture principle: split **FACTS** (deterministic, auditable, LLM-free)
from **COMMUNICATION** (template-based tonight; LLM-swappable later, no runtime
LLM). Client-side only; no PHI leaves the browser.

## Sequence (small, build-verified commits)

- [x] Phase 0a — Planning docs + clean baseline (this commit).
- [x] Phase 0b — Sleep-parsing fix in the XML parser: count only "Asleep"
      stages, merge overlapping intervals, attribute to the wake date.
- [x] Phase 0c — Parse FULL history (lift the 30-day cap) while keeping the
      clinical flow focused on the recent window via a derived `recentData`.
- [x] Phase 1 — `src/healthEngine.js`: completeness-weighted composite daily
      score; rolling-window aggregation; best-window selection w/ min
      completeness; behavioral profile; current state; per-metric gap;
      "% back to your best". Documented in `SCORING.md`.
- [x] Phase 2 — Realistic-goal guardrails: recency-aware target (peak vs
      realistic blend), confound flags (seasonality, low current completeness).
- [x] Phase 3 — Coach UI: experience toggle (Coach ⇄ Pre-Visit Brief),
      "Your Best Self" + "This Week" views, recharts then-vs-now, template
      coach-message preview. Disclaimer on coach output.
- [x] Phase 4 — `src/coach.js` communication-layer adapter
      `generateCoachMessage(facts, options)` (template impl + LLM seam +
      grounding contract). `INTEGRATION-PLAN.md` for future messaging/LLM.
- [x] Phase 5 — Tests (vitest) for the engine + synthetic multi-year fixture;
      docs (README/CLAUDE/TASKS), MORNING-BRIEF.md; deploy attempt.

## Guardrails (carried verbatim from the brief)
Deterministic facts only · non-diagnostic (wellness framing) · client-side only ·
privacy claim stays true · robust to missing data · disclaimer verbatim ·
sample-data fallback always works · additive only.

---

# PLAN (session 3) — Multi-source ingestion layer

Build a pluggable, client-side, deterministic ingestion layer that normalizes
ANY platform's health export into the existing canonical daily schema. Downstream
(trends/brief/coach) keeps consuming the same `data` array unchanged.

Order (durable framework + safety net FIRST, then adapters):
- [ ] A. `src/ingest/`: canonical schema module; adapter interface; refactor
      Apple Health + generic CSV + JSON into adapters; registry; router (single
      file); reconciliation engine; `ingestFiles()` orchestrator. Wire into
      App.onFile WITHOUT changing downstream. Tests. (non-breaking)
- [ ] B. Zip + multi-file support (JSZip): unpack client-side, parse all relevant
      entries, reconcile. Tests with a synthetic zip.
- [ ] C. Guided column-mapping fallback UI for unrecognized tabular files
      (preview columns -> map to canonical + date format). Safety net.
- [ ] D. Source adapters w/ synthetic fixtures + tests, in order:
      Health Connect, Google Fit (Takeout), Samsung Health, Fitbit, Garmin.
- [ ] E. Ingestion summary UI: detected sources, counts, date range, per-source
      field present/missing, provenance.
- [ ] F. Docs: ADAPTERS.md + update NIGHT-LOG/DECISIONS/CLAUDE/README/TASKS.

Guardrails: additive/non-breaking, client-side only, deterministic (no LLM),
demo-never-breaks (sample fallback + graceful degrade to guided mapping).

---

# PLAN (session 4) — Condition "Lens" architecture (config, not forks)

A lens = a config object per condition (presets, hero signal, featured signals,
brief framing). Deterministic engines unchanged; only config varies. Default lens
reproduces today's behavior exactly.

- [ ] A. `src/lenses/`: schema + merge/getActiveLens, default (general) + 4 stubs
      (long_covid_mecfs, pots_dysautonomia, migraine, lyme), heroRegistry seam.
      Unit tests (load, default presets, multi-select dedup merge). LENSES.md.
- [ ] B. Condition selector UI (single + multi-select) under the mode toggle,
      persisted to localStorage (condition ids only — no PHI).
- [ ] C. Condition-aware brief: buildContextualBrief(trends, ctx, lens) — featured
      signal ordering, condition framing line, condition suggested questions,
      track-factors section, section order via lens. Default = byte-identical.
- [ ] D. Condition-aware trends (featured-signal badge) + visit-context preset
      chips (quick-add to note). Default = unchanged.
- [ ] E. Docs: LENSES.md + NIGHT-LOG/DECISIONS/CLAUDE/README/TASKS.

Guardrails: config not forks, additive, deterministic, client-side, demo-never-breaks.

---

# PLAN (session 5) — POTS + Migraine lenses (hero computations)

NOTE: prior session shipped all 4 condition lenses as STUBS (no registered heroes)
and there is NO correlation engine yet. So this session first establishes the
reusable deterministic primitives, then implements the heroes (and fills all four
so "all conditions live" is honest).

- [ ] A. `src/lenses/correlation.js` — pure lagged Pearson correlation engine
      (series build, aligned pairs at lag, variance/min-pairs guards). Tests.
- [ ] B. `src/lenses/heroes.js` — register hero computations via the registry:
      pots(orthostatic_hr) HR patterns + activity tolerance + honest gap flag;
      migraine(trigger_correlation) lagged triggers vs attack log + attack stats;
      also long_covid(pem_load) + lyme(symptom_flare_load) reusing the primitives.
      Synthetic fixtures + tests (detect planted assoc, avoid spurious, missing data).
- [ ] C. Wire computeHero(activeLens, records, opts) into App; render a deterministic
      "Condition focus" hero section in the brief (disclaimer kept). Default/others
      unaffected (no registered hero -> nothing renders).
- [ ] D. Docs: SCORING.md (hero math), LENSES.md (statuses -> implemented),
      NIGHT-LOG/DECISIONS/CLAUDE/README/TASKS.

Guardrails: deterministic, non-diagnostic, honest about wearable limits (POTS
orthostatic gap), robust to nulls, additive, client-side.
