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
