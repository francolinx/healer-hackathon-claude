/* ------------------------------------------------------------------ */
/* lenses/schema.js — condition "lens" schema + merge helpers          */
/* ------------------------------------------------------------------ */
//
// A LENS is configuration, not code. Each chronic-condition community is one
// config object; the deterministic engines never branch on condition. The brief,
// trends, and logging presets all read from the ACTIVE lens (one selected, or a
// merge of several for comorbidity). The "general" lens reproduces the app's
// default behavior exactly (empty presets, no featured signals, canonical order).
//
// Lens shape (see LENSES.md):
//   {
//     id, displayName, description, status: "default"|"stub"|"verified",
//     symptomPresets: [{ id, label }],   // suggested symptoms to log/mention
//     factorPresets:  [{ id, label }],   // suggested context/triggers
//     heroSignal: string,                // key into heroRegistry (deterministic fn)
//     featuredCorrelations: [{ x, y, label }], // signal/symptom pairs (forward-looking)
//     featuredSignals: [canonicalSignalKey], // trends to highlight (subset of SIGNALS)
//     briefFraming: {
//       conditionLine: string|null,      // non-diagnostic framing sentence
//       sectionOrder: [sectionKey],      // order of brief body sections
//       suggestedQuestions: [string],    // appended to the brief's questions
//       trackFactors: [string],          // "track / mention" list for the visit
//     },
//     thresholds: { ... },               // optional condition-specific knobs
//   }

// Canonical brief body section order (the general lens uses exactly this).
export const DEFAULT_SECTION_ORDER = [
  "reason", "conditionFraming", "why", "keyTrends", "relevance", "questions", "trackFactors", "limitations", "disclaimer",
];

// Hero-signal keys. "none" = no condition computation (general). The others are
// PLANNED keys that later prompts will register in heroRegistry.js.
export const HERO_SIGNALS = {
  NONE: "none",
  PEM_LOAD: "pem_load",                 // post-exertional malaise: exertion -> next-day recovery
  ORTHOSTATIC_HR: "orthostatic_hr",     // POTS: heart-rate response / orthostatic load
  TRIGGER_CORRELATION: "trigger_correlation", // migraine: sleep/HR vs headache days
  SYMPTOM_FLARE_LOAD: "symptom_flare_load",   // lyme: activity/sleep vs flare days
};

const uniqById = (arr) => {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
};
const uniqStr = (arr) => [...new Set(arr.filter(Boolean))];

// Fill in any missing optional fields so consumers never crash on a sparse config.
export function normalizeLens(lens) {
  const f = lens.briefFraming || {};
  return {
    id: lens.id,
    displayName: lens.displayName || lens.id,
    description: lens.description || "",
    status: lens.status || "stub",
    symptomPresets: lens.symptomPresets || [],
    factorPresets: lens.factorPresets || [],
    heroSignal: lens.heroSignal || HERO_SIGNALS.NONE,
    featuredCorrelations: lens.featuredCorrelations || [],
    featuredSignals: lens.featuredSignals || [],
    briefFraming: {
      conditionLine: f.conditionLine || null,
      sectionOrder: f.sectionOrder || DEFAULT_SECTION_ORDER,
      suggestedQuestions: f.suggestedQuestions || [],
      trackFactors: f.trackFactors || [],
    },
    thresholds: lens.thresholds || {},
    heroSignals: [lens.heroSignal || HERO_SIGNALS.NONE], // list form (merge-friendly)
  };
}

// Merge one-or-more lenses (comorbidity) into a single active lens. Order of
// `lenses` is the priority order for section ordering / conditionLine joining.
export function mergeLenses(lenses) {
  const list = lenses.map(normalizeLens);
  if (list.length === 1) return list[0];
  const conditionLines = uniqStr(list.map((l) => l.briefFraming.conditionLine));
  return {
    id: list.map((l) => l.id).join("+"),
    displayName: list.map((l) => l.displayName).join(" + "),
    description: "Combined lens: " + list.map((l) => l.displayName).join(", "),
    status: "merged",
    symptomPresets: uniqById(list.flatMap((l) => l.symptomPresets)),
    factorPresets: uniqById(list.flatMap((l) => l.factorPresets)),
    heroSignal: list[0].heroSignal,
    heroSignals: uniqStr(list.flatMap((l) => l.heroSignals)),
    featuredCorrelations: list.flatMap((l) => l.featuredCorrelations),
    featuredSignals: uniqStr(list.flatMap((l) => l.featuredSignals)),
    briefFraming: {
      conditionLine: conditionLines.length ? conditionLines.join(" ") : null,
      sectionOrder: list[0].briefFraming.sectionOrder, // first lens drives ordering
      suggestedQuestions: uniqStr(list.flatMap((l) => l.briefFraming.suggestedQuestions)),
      trackFactors: uniqStr(list.flatMap((l) => l.briefFraming.trackFactors)),
    },
    thresholds: Object.assign({}, ...list.map((l) => l.thresholds)),
  };
}
