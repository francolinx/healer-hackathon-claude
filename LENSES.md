# LENSES.md — condition "lens" architecture

A **lens** lets VisitPulse serve multiple chronic-illness communities from ONE
codebase. A lens is **configuration, not a code fork**: a data object that defines,
per condition, what to log, which signals matter, and how the pre-visit brief is
framed. The deterministic engines (ingestion, trends, best-self, brief) are
identical across conditions — only the config changes. There is **no
`if (condition === 'lyme')`** anywhere in the components; conditions are data.

Code: `src/lenses/` — `schema.js` (shape + merge), `configs.js` (the lenses),
`heroRegistry.js` (seam for hero computations), `index.js` (public API).

## Schema (`normalizeLens` fills any missing field)
```
{
  id: string,                       // stable key, e.g. "pots_dysautonomia"
  displayName: string,
  description: string,
  status: "default" | "stub" | "verified" | "merged",
  symptomPresets: [{ id, label }],  // suggested symptoms to log / mention
  factorPresets:  [{ id, label }],  // suggested context / triggers
  heroSignal: string,               // key into heroRegistry (deterministic fn)
  featuredCorrelations: [{ x, y, label }],  // signal/symptom pairs (forward-looking)
  featuredSignals: [canonicalSignalKey],    // trends to highlight (subset of SIGNALS)
  briefFraming: {
    conditionLine: string | null,   // non-diagnostic framing sentence in the brief
    sectionOrder: [sectionKey],     // order of brief body sections
    suggestedQuestions: [string],   // appended to the brief's questions
    trackFactors: [string],         // "symptoms & factors to track" list
  },
  thresholds: { ... },              // optional condition-specific knobs
}
```
`canonicalSignalKey` ∈ the canonical schema signals (resting_hr, avg_hr, steps,
exercise_minutes, active_energy, spo2, sleep_hours, workouts). Brief section keys:
`reason, conditionFraming, why, keyTrends, relevance, questions, trackFactors,
limitations, disclaimer` (see `DEFAULT_SECTION_ORDER`).

## Selection & merging
- `getActiveLens(ids)` → the active lens. No/invalid/only `general` → the default
  lens (today's behavior). One id → that lens. Several ids → **merged** lens for
  comorbidity (e.g. long COVID + POTS): symptom/factor presets unioned + deduped
  by id, `featuredSignals` unioned, every `heroSignal` carried in `heroSignals`,
  `suggestedQuestions`/`trackFactors` unioned, `conditionLine`s joined. The first
  selected id drives `sectionOrder`.
- The UI persists selected ids in `localStorage` (`visitpulse.conditions`) — ids
  only, never health data.

## Hero-computation seam (`heroRegistry.js`)
`heroSignal` is a key, not a function. A later prompt registers the deterministic
computation without touching the selector or schema:
```js
import { registerHero } from "./lenses/heroRegistry.js";
registerHero("pem_load", (records, lens, opts) => ({ /* deterministic facts */ }));
```
`computeHero(lens, records, opts)` runs it if registered, else returns `null`.
Today only `none` is registered (the general lens has no hero metric).

## How the app reads the active lens (no forks)
- **Brief** (`buildContextualBrief(trends, ctx, lens)`): adds the condition framing
  line, appends the lens's suggested questions, orders lens-`featuredSignals` first
  in "most relevant", adds a "symptoms & factors to track" section, and renders
  body sections in the lens's `sectionOrder`. The general lens changes nothing.
- **Trends**: `featuredSignals` get a ★ and a subtitle note.
- **Visit context**: `symptomPresets`/`factorPresets` render as tap-to-add chips
  that append to the free-text note (shared verbatim, never interpreted).

## Per-condition status
| id | display | status | hero signal (planned) | notes |
|----|---------|--------|-----------------------|-------|
| `general` | General (no condition) | **default** | none | Reproduces today's behavior exactly. |
| `long_covid_mecfs` | Long COVID / ME-CFS | **stub** | `pem_load` | PEM: exertion → next-day recovery. Presets + framing populated; hero TBD. |
| `pots_dysautonomia` | POTS / Dysautonomia | **stub** | `orthostatic_hr` | HR response to posture/activity. |
| `migraine` | Migraine | **stub** | `trigger_correlation` | Sleep/schedule triggers before headache days. |
| `lyme` | Lyme / chronic Lyme | **stub** | `symptom_flare_load` | Relapsing-remitting flares vs activity/sleep. |

**Stub** = presets + brief framing are populated and usable today; the hero
computation is registered by a later prompt. Nothing about a stub breaks the app.

## Adding or evolving a condition
1. Add/edit a config object in `src/lenses/configs.js` (and to `ALL_LENSES`).
2. When ready, `registerHero(heroSignal, fn)` with a pure deterministic function.
3. Add a test in `tests/lenses.test.js` / `tests/brief.lens.test.js`.
4. `npm test` + `npx vite build` must pass. Flip status to `verified` here.

Guardrails: config not forks · deterministic (no LLM) · client-side only ·
additive (default lens reproduces baseline) · disclaimer stays on brief output.
