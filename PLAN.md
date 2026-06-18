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
