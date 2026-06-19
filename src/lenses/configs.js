/* ------------------------------------------------------------------ */
/* lenses/configs.js — the condition lens config objects               */
/* ------------------------------------------------------------------ */
//
// Adding a condition = adding a config object here (no code forks). The 4
// non-default lenses are STUBS: presets + framing are populated, but their
// heroSignal computations are registered later (heroRegistry.js). See LENSES.md.

import { HERO_SIGNALS, DEFAULT_SECTION_ORDER } from "./schema.js";

const s = (id, label) => ({ id, label });

// The DEFAULT lens: empty presets, no featured signals, canonical section order.
// This guarantees the app behaves exactly as before when no condition is chosen.
export const generalLens = {
  id: "general",
  displayName: "General (no condition)",
  description: "Default behavior — no condition-specific presets or framing.",
  status: "default",
  symptomPresets: [],
  factorPresets: [],
  heroSignal: HERO_SIGNALS.NONE,
  featuredCorrelations: [],
  featuredSignals: [],
  briefFraming: { conditionLine: null, sectionOrder: DEFAULT_SECTION_ORDER, suggestedQuestions: [], trackFactors: [] },
  thresholds: {},
};

export const longCovidMecfsLens = {
  id: "long_covid_mecfs",
  displayName: "Long COVID / ME-CFS",
  description: "Focus on the relationship between exertion and recovery; post-exertional malaise (PEM) is central.",
  status: "stub",
  symptomPresets: [
    s("fatigue", "Fatigue"), s("pem", "Post-exertional malaise (PEM)"), s("brain_fog", "Brain fog"),
    s("unrefreshing_sleep", "Unrefreshing sleep"), s("palpitations", "Palpitations"),
    s("breathlessness", "Breathlessness"), s("dizziness", "Dizziness/lightheadedness"),
  ],
  factorPresets: [
    s("exertion", "Physical/cognitive exertion"), s("poor_sleep", "Poor sleep"), s("stress", "Stress"),
    s("illness", "Illness/infection"), s("heat", "Heat"), s("alcohol", "Alcohol"), s("menstrual", "Menstrual cycle"),
  ],
  heroSignal: HERO_SIGNALS.PEM_LOAD,
  featuredCorrelations: [
    { x: "exercise_minutes", y: "resting_hr", label: "Exertion vs next-day resting heart rate" },
    { x: "steps", y: "fatigue", label: "Activity vs reported fatigue" },
  ],
  featuredSignals: ["resting_hr", "sleep_hours", "steps", "exercise_minutes"],
  briefFraming: {
    conditionLine: "Framed for a long COVID / ME-CFS visit: the focus is the relationship between activity/exertion and recovery (resting heart rate, sleep), because post-exertional symptoms are central.",
    sectionOrder: DEFAULT_SECTION_ORDER,
    suggestedQuestions: [
      "Do symptoms reliably worsen 12-48 hours after exertion (post-exertional malaise)?",
      "Does resting heart rate stay elevated on the days after higher activity?",
    ],
    trackFactors: ["Exertion (physical and cognitive) and any symptom crash 1-2 days later", "Sleep quality / unrefreshing sleep", "Episodes of palpitations or breathlessness"],
  },
  thresholds: {},
};

export const potsDysautonomiaLens = {
  id: "pots_dysautonomia",
  displayName: "POTS / Dysautonomia",
  description: "Focus on heart-rate response to posture/activity and orthostatic intolerance.",
  status: "stub",
  symptomPresets: [
    s("lightheaded_standing", "Lightheadedness on standing"), s("palpitations", "Palpitations"),
    s("fatigue", "Fatigue"), s("brain_fog", "Brain fog"), s("nausea", "Nausea"), s("exercise_intolerance", "Exercise intolerance"),
  ],
  factorPresets: [
    s("standing", "Prolonged standing"), s("heat", "Heat"), s("dehydration", "Dehydration"),
    s("large_meals", "Large meals"), s("salt", "Salt intake"), s("deconditioning", "Deconditioning"),
  ],
  heroSignal: HERO_SIGNALS.ORTHOSTATIC_HR,
  featuredCorrelations: [
    { x: "avg_hr", y: "lightheaded_standing", label: "Heart rate vs lightheadedness" },
  ],
  featuredSignals: ["resting_hr", "avg_hr", "steps"],
  briefFraming: {
    conditionLine: "Framed for a POTS / dysautonomia visit: the focus is heart-rate behavior and orthostatic intolerance rather than a single resting value.",
    sectionOrder: DEFAULT_SECTION_ORDER,
    suggestedQuestions: [
      "How much does heart rate rise from lying/sitting to standing, and for how long?",
      "Do symptoms track with heat, dehydration, or time upright?",
    ],
    trackFactors: ["Position changes and time spent upright before symptoms", "Fluid and salt intake", "Heat exposure"],
  },
  thresholds: {},
};

export const migraineLens = {
  id: "migraine",
  displayName: "Migraine",
  description: "Focus on candidate triggers (sleep, stress, cycle) preceding headache days.",
  status: "stub",
  symptomPresets: [
    s("headache", "Headache"), s("aura", "Aura"), s("nausea", "Nausea"),
    s("light_sensitivity", "Light/sound sensitivity"), s("neck_pain", "Neck pain"),
  ],
  factorPresets: [
    s("poor_sleep", "Poor sleep"), s("stress", "Stress"), s("dehydration", "Dehydration"),
    s("caffeine", "Caffeine"), s("alcohol", "Alcohol"), s("screen_time", "Screen time"),
    s("weather", "Weather change"), s("menstrual", "Menstrual cycle"), s("skipped_meals", "Skipped meals"),
  ],
  heroSignal: HERO_SIGNALS.TRIGGER_CORRELATION,
  featuredCorrelations: [
    { x: "sleep_hours", y: "headache", label: "Sleep vs headache days" },
    { x: "resting_hr", y: "headache", label: "Resting heart rate vs headache days" },
  ],
  featuredSignals: ["sleep_hours", "resting_hr"],
  briefFraming: {
    conditionLine: "Framed for a migraine visit: the focus is candidate triggers in the day or two before headache days (sleep, schedule, stress).",
    sectionOrder: DEFAULT_SECTION_ORDER,
    suggestedQuestions: [
      "Do headaches follow nights of short or irregular sleep?",
      "Are there clusters around schedule changes, cycle, or skipped meals?",
    ],
    trackFactors: ["Sleep duration and timing the night before", "Hydration, caffeine, and meals", "Menstrual cycle phase"],
  },
  thresholds: {},
};

export const lymeLens = {
  id: "lyme",
  displayName: "Lyme / chronic Lyme",
  description: "Focus on relapsing-remitting symptom flares against activity and sleep.",
  status: "stub",
  symptomPresets: [
    s("fatigue", "Fatigue"), s("joint_pain", "Joint pain"), s("brain_fog", "Brain fog"),
    s("headache", "Headaches"), s("muscle_aches", "Muscle aches"), s("sleep_disturbance", "Sleep disturbance"),
  ],
  factorPresets: [
    s("exertion", "Exertion"), s("stress", "Stress"), s("poor_sleep", "Poor sleep"), s("weather", "Weather change"),
  ],
  heroSignal: HERO_SIGNALS.SYMPTOM_FLARE_LOAD,
  featuredCorrelations: [
    { x: "steps", y: "joint_pain", label: "Activity vs joint pain flares" },
  ],
  featuredSignals: ["resting_hr", "sleep_hours", "steps"],
  briefFraming: {
    conditionLine: "Framed for a Lyme visit: the focus is relapsing-remitting flares and how they line up with activity and sleep over time.",
    sectionOrder: DEFAULT_SECTION_ORDER,
    suggestedQuestions: [
      "Do flares follow periods of higher exertion or poor sleep?",
      "Is there a relapsing-remitting pattern over weeks?",
    ],
    trackFactors: ["Flare days and their severity", "Exertion in the preceding days", "Sleep quality"],
  },
  thresholds: {},
};

// Registry of all lenses (general first).
export const ALL_LENSES = [generalLens, longCovidMecfsLens, potsDysautonomiaLens, migraineLens, lymeLens];
// Conditions a user can pick (everything except the implicit default).
export const SELECTABLE_LENSES = ALL_LENSES.filter((l) => l.id !== "general");
