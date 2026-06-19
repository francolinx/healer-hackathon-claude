import { describe, it, expect } from "vitest";
import { getLens, getActiveLens, LENS_OPTIONS, mergeLenses } from "../src/lenses/index.js";
import { DEFAULT_SECTION_ORDER, HERO_SIGNALS } from "../src/lenses/schema.js";
import { computeHero, registerHero, hasHero } from "../src/lenses/heroRegistry.js";

describe("lens configs load", () => {
  it("exposes 4 selectable conditions + a default", () => {
    expect(LENS_OPTIONS.map((o) => o.id).sort()).toEqual(["long_covid_mecfs", "lyme", "migraine", "pots_dysautonomia"]);
    expect(getLens("general").status).toBe("default");
    for (const o of LENS_OPTIONS) expect(getLens(o.id).status).toBe("stub");
  });
  it("every lens normalizes to the full shape", () => {
    const l = getLens("migraine");
    expect(Array.isArray(l.symptomPresets)).toBe(true);
    expect(Array.isArray(l.factorPresets)).toBe(true);
    expect(l.briefFraming.sectionOrder.length).toBeGreaterThan(0);
    expect(typeof l.heroSignal).toBe("string");
  });
});

describe("default lens reproduces baseline", () => {
  it("general lens has empty presets, no featured signals, canonical order", () => {
    const g = getActiveLens([]);
    expect(g.id).toBe("general");
    expect(g.symptomPresets).toEqual([]);
    expect(g.featuredSignals).toEqual([]);
    expect(g.briefFraming.conditionLine).toBeNull();
    expect(g.briefFraming.suggestedQuestions).toEqual([]);
    expect(g.briefFraming.sectionOrder).toEqual(DEFAULT_SECTION_ORDER);
  });
  it("unknown ids and explicit 'general' fall back to default", () => {
    expect(getActiveLens(["nope"]).id).toBe("general");
    expect(getActiveLens(["general"]).id).toBe("general");
  });
});

describe("single + multi condition selection", () => {
  it("single condition returns that lens", () => {
    const l = getActiveLens(["pots_dysautonomia"]);
    expect(l.id).toBe("pots_dysautonomia");
    expect(l.featuredSignals).toContain("avg_hr");
  });
  it("multi-select merges + dedups presets and unions featured signals", () => {
    const merged = getActiveLens(["long_covid_mecfs", "pots_dysautonomia"]);
    expect(merged.id).toBe("long_covid_mecfs+pots_dysautonomia");
    // both lenses include a "fatigue" symptom + "palpitations" -> deduped once each
    const symptomIds = merged.symptomPresets.map((p) => p.id);
    expect(symptomIds.filter((x) => x === "fatigue").length).toBe(1);
    expect(symptomIds.filter((x) => x === "palpitations").length).toBe(1);
    // featured signals are the union
    expect(merged.featuredSignals).toEqual(expect.arrayContaining(["resting_hr", "avg_hr", "steps", "exercise_minutes", "sleep_hours"]));
    // both hero signals are carried for showing each hero
    expect(merged.heroSignals).toEqual(expect.arrayContaining([HERO_SIGNALS.PEM_LOAD, HERO_SIGNALS.ORTHOSTATIC_HR]));
    // suggested questions are unioned (no dupes)
    expect(new Set(merged.briefFraming.suggestedQuestions).size).toBe(merged.briefFraming.suggestedQuestions.length);
  });
  it("merge factor presets dedup across three conditions", () => {
    const merged = getActiveLens(["long_covid_mecfs", "migraine", "lyme"]);
    const factorIds = merged.factorPresets.map((p) => p.id);
    expect(factorIds.filter((x) => x === "stress").length).toBe(1); // present in all three
    expect(factorIds.filter((x) => x === "poor_sleep").length).toBe(1);
  });
});

describe("hero registry seam", () => {
  it("the general lens has no hero computation", () => {
    expect(computeHero(getLens("general"), [], {})).toBeNull();
  });
  it("all four condition heroes are registered and dispatch by heroSignal", () => {
    for (const id of ["long_covid_mecfs", "pots_dysautonomia", "migraine", "lyme"]) {
      const lens = getLens(id);
      expect(hasHero(lens.heroSignal)).toBe(true);
      const facts = computeHero(lens, [], {});
      expect(facts).not.toBeNull();
      expect(facts.heroSignal).toBe(lens.heroSignal); // returns a facts envelope (ok:false on empty data)
    }
  });
  it("a later prompt can override a hero without touching configs", () => {
    registerHero(HERO_SIGNALS.PEM_LOAD, (records) => ({ heroSignal: HERO_SIGNALS.PEM_LOAD, count: records.length }));
    expect(computeHero(getLens("long_covid_mecfs"), [1, 2, 3], {})).toEqual({ heroSignal: HERO_SIGNALS.PEM_LOAD, count: 3 });
  });
});
