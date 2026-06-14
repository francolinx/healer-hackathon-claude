# SCORING.md — how the Historical-Best engine computes its facts

Everything in `src/healthEngine.js` is deterministic and auditable. This document
is the human-readable spec for the numbers. **No value here is diagnostic** — the
score exists only to compare windows of a person's own data against each other,
framed as general wellness/behavioral context.

## 1. Per-metric sub-score (`metricSubScore`)
Each metric maps to a wellness sub-score in `[0,1]`:
- **higher-is-better** (steps, exercise minutes, active energy, SpO₂):
  `clamp01((value − bad) / (good − bad))`
- **lower-is-better** (resting HR, average HR):
  `clamp01((bad − value) / (bad − good))`
- **target-band** (sleep duration): `1` inside `[lo, hi]`; linearly down to `0`
  at `floor` (below) or `ceil` (above).

Current ranges (`METRIC_SPECS`, tunable — not clinical thresholds):

| metric | dir | maps to 1.0 | maps to 0.0 | weight |
|---|---|---|---|---|
| resting_hr | lower | 50 bpm | 75 bpm | 0.22 |
| sleep_hours | band | 7–8.5 h | 5 h / 10 h | 0.22 |
| steps | higher | 11,000 | 2,000 | 0.20 |
| exercise_minutes | higher | 45 | 0 | 0.14 |
| active_energy | higher | 700 kcal | 150 kcal | 0.08 |
| spo2 | higher | 98% | 93% | 0.06 |
| avg_hr | lower | 65 bpm | 95 bpm | 0.08 |

## 2. Composite daily score (`dailyScore`)
Completeness-weighted over **present** metrics only:
```
score   = (Σ weightᵢ · subᵢ) / (Σ weightᵢ present) × 100      // 0..100
completeness = (Σ weightᵢ present) / (Σ all weights)          // 0..1
```
A day with only resting HR + steps still scores, but its `completeness` is low —
which discounts it later. Missing metrics never crash and never count as zero.

## 3. Window score (`windowStats`)
A window is a run of calendar days (gaps included as empty days). Its score is the
completeness-weighted mean of daily scores, blended with a bedtime-**consistency**
component when timing data exists:
```
meanScore   = Σ(completenessᵈ · scoreᵈ) / Σ completenessᵈ      // over scored days
consistency = clamp01(1 − bedtimeStd / 90min)                  // needs ≥3 bedtimes
windowScore = (1 − 0.1)·meanScore + 0.1·consistency·100        // if consistency exists
            = meanScore                                         // otherwise
coverage    = (# days with a score) / (window length in days)
```

## 4. Best-window selection (`searchBestWindow`)
Slide a `WINDOW_DAYS` (default **35**, ~5 weeks) window one calendar day at a time
across the full timeline. A window only qualifies if `coverage ≥ MIN_WINDOW_COVERAGE`
(default **0.6**) — so a single great day or a sparse fluke can't win. Pick the max
`windowScore`; ties break toward the **more recent** window.

## 5. Behavioral profile (`characterizeWindow`)
"What you were doing then": averages over the window of resting HR, sleep hours,
steps, exercise minutes, active energy, SpO₂, workouts/week, and average
bedtime/wake (+ bedtime std for consistency).

## 6. Current state, gap, and "% back to your best"
- **Current** = last `CURRENT_DAYS` (default 30) days, scored the same way.
- **Gap** = per-metric `current − best` with % change and a `towardBest` flag
  (already at/above best on that metric?).
- **Headline `percentBack`** = `round(currentScore / bestScore × 100)`, clamped to
  `[0,100]`. `atOrAboveBest` is true when you're at or above your proven best now.

## 7. Realistic-goal guardrails (Phase 2)
- If the best window is older than `RECENCY_THRESHOLD_DAYS` (default **730**), the
  engine also finds a **recent best** (within `RECENT_BEST_DAYS` ≈ 18 months) and
  returns a **realistic target** = `current + REALISTIC_BLEND·(peak − current)`
  (default blend **0.6**), clearly labeled *peak* vs *realistic target*.
- **Confound flags** (`confounds`):
  - `LOW_CURRENT_COVERAGE` — recent window <50% covered (comparison less certain).
  - `OLD_PEAK` — best window older than the recency threshold.
  - `SEASONAL` — best vs current fall in opposite seasons (summer⇄winter).
  - `SHORT_HISTORY` — total span < 2× window length (best may overlap now).

## 8. Reversibility
All thresholds live in `ENGINE_CONFIG` / `METRIC_SPECS` at the top of
`src/healthEngine.js`. Change them there; the unit tests in `tests/` pin the
behavior so regressions surface immediately.
