import { describe, it, expect } from "vitest";
import { buildContextualBrief, briefPlainText } from "../src/App.jsx";
import { getActiveLens } from "../src/lenses/index.js";

// Minimal trend objects shaped like computeTrends() output (only fields the
// brief reads). None flagged -> keeps the test focused on lens framing.
const trend = (key, label) => ({ key, label, unit: "", decimals: 0, flagged: false, direction: "stable", recent: 50, baseline: 50, pct: 0, delta: 0, completeness: 1, strength: "Weak", q: "" });
const TRENDS = [trend("resting_hr", "Resting heart rate"), trend("sleep_hours", "Sleep duration"), trend("steps", "Daily steps"), trend("exercise_minutes", "Exercise minutes"), trend("active_energy", "Active energy"), trend("workouts", "Workouts"), trend("spo2", "Blood oxygen (SpO2)")];
const ctx = { clinicianType: "general", chiefComplaint: "general", note: "" };

describe("default lens reproduces baseline brief", () => {
  const brief = buildContextualBrief(TRENDS, ctx, getActiveLens([]));
  it("no condition framing / track factors / condition label", () => {
    expect(brief.conditionFraming).toBeNull();
    expect(brief.trackFactors).toEqual([]);
    expect(brief.headerLabel).not.toContain("·");
    expect(brief.lensId).toBe("general");
  });
  it("plain text omits condition sections", () => {
    const txt = briefPlainText(brief);
    expect(txt).not.toContain("CONDITION FRAMING");
    expect(txt).not.toContain("SYMPTOMS & FACTORS TO TRACK");
    expect(txt).toContain("REASON FOR SHARING");
    expect(txt).toContain("DISCLAIMER");
  });
});

describe("condition lens reframes the brief (config-driven)", () => {
  const lens = getActiveLens(["long_covid_mecfs"]);
  const brief = buildContextualBrief(TRENDS, ctx, lens);
  it("pulls framing line, suggested questions, and track factors from the lens", () => {
    expect(brief.conditionFraming).toBe(lens.briefFraming.conditionLine);
    expect(brief.trackFactors.length).toBeGreaterThan(0);
    for (const q of lens.briefFraming.suggestedQuestions) expect(brief.questions).toContain(q);
    expect(brief.headerLabel).toContain("Long COVID");
  });
  it("orders lens-featured signals first in 'most relevant'", () => {
    // featuredSignals for long COVID lead with resting_hr / sleep / steps / exercise
    const leadKeys = brief.lead.map((t) => t.key);
    const firstFour = new Set(leadKeys.slice(0, 4));
    for (const k of ["resting_hr", "sleep_hours", "steps", "exercise_minutes"]) expect(firstFour.has(k)).toBe(true);
  });
  it("plain text includes the condition sections", () => {
    const txt = briefPlainText(brief);
    expect(txt).toContain("CONDITION FRAMING");
    expect(txt).toContain("SYMPTOMS & FACTORS TO TRACK");
    expect(txt).toContain("This is patient-generated wearable data"); // disclaimer intact
  });
});

describe("multi-condition brief merges suggested questions", () => {
  const lens = getActiveLens(["long_covid_mecfs", "pots_dysautonomia"]);
  const brief = buildContextualBrief(TRENDS, ctx, lens);
  it("includes questions from both lenses and a combined header", () => {
    expect(brief.questions.length).toBeGreaterThanOrEqual(lens.briefFraming.suggestedQuestions.length);
    expect(brief.headerLabel).toContain("Long COVID");
    expect(brief.headerLabel).toContain("POTS");
    // no duplicate questions
    expect(new Set(brief.questions).size).toBe(brief.questions.length);
  });
});
