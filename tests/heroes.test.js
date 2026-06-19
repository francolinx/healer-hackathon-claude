import { describe, it, expect } from "vitest";
import { potsHero, migraineHero, lymeHero, pemHero } from "../src/lenses/heroes.js";
import { computeHero, getLens } from "../src/lenses/index.js";
import { HERO_SIGNALS } from "../src/lenses/schema.js";

const toUTC = (s) => new Date(s + "T00:00:00Z");
const dayStr = (d) => d.toISOString().slice(0, 10);
const END = "2026-06-13";
// Build `n` consecutive daily records ending at END. p(i) gets days-ago (0 = END).
function buildDays(n, p) {
  const e = toUTC(END);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push({ date: dayStr(new Date(e.getTime() - i * 86400000)), ...p(i) });
  return out;
}
const dateFor = (i) => dayStr(new Date(toUTC(END).getTime() - i * 86400000));
const rowVal = (facts, key) => (facts.rows.find((r) => r.key === key) || {}).value;

describe("POTS hero — HR patterns + activity tolerance + honest gap", () => {
  // SYNTHETIC POTS-like fixture: recent resting HR elevated + unstable; steps declining.
  const recs = buildDays(120, (i) => {
    const recent = i < 30;
    const resting = recent ? (i % 2 === 0 ? 60 : 82) : 58;     // recent instability + elevation
    const steps = recent ? 5000 : 9000;                        // declining tolerance
    return { resting_hr: resting, avg_hr: resting + 18, steps, sleep_hours: 7, exercise_minutes: recent ? 10 : 30 };
  });
  const facts = potsHero(recs, getLens("pots_dysautonomia"), { today: END });

  it("computes elevation, instability, coupling, tolerance", () => {
    expect(facts.ok).toBe(true);
    expect(facts.heroSignal).toBe(HERO_SIGNALS.ORTHOSTATIC_HR);
    expect(rowVal(facts, "hr_elevation")).toMatch(/^\+/);            // recent above baseline
    expect(facts.rows.some((r) => r.key === "hr_instability")).toBe(true);
    expect(facts.activityTolerance.direction).toBe("declining");
  });
  it("honestly flags the orthostatic standing-HR gap", () => {
    expect(facts.gaps.join(" ")).toMatch(/orthostatic|standing/i);
    expect(facts.disclaimer).toMatch(/context, not diagnosis/);
  });
  it("does not crash on sparse data; reports not-enough", () => {
    const sparse = buildDays(10, () => ({ resting_hr: null, steps: null }));
    expect(() => potsHero(sparse, getLens("pots_dysautonomia"), { today: END })).not.toThrow();
    expect(potsHero(sparse, getLens("pots_dysautonomia"), { today: END }).ok).toBe(false);
  });
});

describe("Migraine hero — lagged trigger correlation + attack patterns", () => {
  // SYNTHETIC migraine fixture: a short-sleep night -> attack the NEXT day (lag 1).
  // steps are unrelated (spurious-control). Trigger nights every 7 days.
  const triggerNight = (i) => i % 7 === 3;
  const recs = buildDays(120, (i) => ({
    sleep_hours: triggerNight(i) ? 4.5 : 7.6,
    resting_hr: 58 + (i % 5),
    steps: 6000 + ((i * 137) % 3000), // pseudo-random, unrelated to attacks
    bedtime_min: 640,
  }));
  // attack logged the morning AFTER a trigger night: night at days-ago i -> attack at i-1.
  const symptomLog = [];
  for (let i = 0; i < 120; i++) if (triggerNight(i) && i - 1 >= 0) symptomLog.push({ date: dateFor(i - 1), type: "migraine", severity: 2 + (i % 3) });
  const facts = migraineHero(recs, getLens("migraine"), { today: END, symptomLog });

  it("detects the planted sleep->attack association (strong, lag 1, negative)", () => {
    expect(facts.ok).toBe(true);
    const sleep = facts.associations.find((a) => a.trigger === "sleep_hours");
    expect(sleep).toBeTruthy();
    expect(sleep.lag).toBe(1);
    expect(Math.abs(sleep.r)).toBeGreaterThan(0.4);
    expect(sleep.r).toBeLessThan(0); // lower sleep -> more attacks
  });
  it("does not over-rank the spurious trigger (steps weaker than sleep)", () => {
    const sleep = facts.associations.find((a) => a.trigger === "sleep_hours");
    const steps = facts.associations.find((a) => a.trigger === "steps");
    expect(Math.abs(steps.r)).toBeLessThan(Math.abs(sleep.r));
    expect(facts.associations[0].trigger).toBe("sleep_hours"); // ranked #1
  });
  it("tracks attack frequency", () => {
    expect(facts.attacks.count).toBe(symptomLog.length);
    expect(facts.attacks.perMonth).toBeGreaterThan(0);
  });
  it("without an attack log, returns the honest 'log attacks' state (+ proxy patterns)", () => {
    const f = migraineHero(recs, getLens("migraine"), { today: END });
    expect(f.ok).toBe(false);
    expect(f.needsLog).toBe(true);
    expect(f.reason).toMatch(/log/i);
  });
});

describe("Lyme hero — flare correlation (reuses the engine)", () => {
  const flareDay = (i) => i % 6 === 2;
  const recs = buildDays(120, (i) => ({ steps: flareDay(i) ? 13000 : 6000, sleep_hours: 7, resting_hr: 58 }));
  const symptomLog = [];
  for (let i = 0; i < 120; i++) if (flareDay(i) && i - 1 >= 0) symptomLog.push({ date: dateFor(i - 1), type: "flare", severity: 3 });
  it("links higher exertion to next-day flares", () => {
    const facts = lymeHero(recs, getLens("lyme"), { today: END, symptomLog });
    expect(facts.ok).toBe(true);
    const steps = facts.associations.find((a) => a.trigger === "steps");
    expect(steps.lag).toBe(1);
    expect(steps.r).toBeGreaterThan(0.3); // more steps -> more flares next day
  });
});

describe("long COVID PEM hero — exertion -> next-day recovery", () => {
  // Higher exercise today -> higher resting HR tomorrow (planted lag-1 positive).
  const recs = buildDays(120, (i) => ({ exercise_minutes: i % 3 === 0 ? 60 : 10, steps: 7000, resting_hr: null }));
  // set next-day resting HR high after a high-exercise day
  for (let i = 0; i < recs.length; i++) {
    const prev = recs[i - 1];
    recs[i].resting_hr = prev && prev.exercise_minutes >= 60 ? 66 : 56;
  }
  it("surfaces a positive exertion->next-day resting HR association", () => {
    const facts = pemHero(recs, getLens("long_covid_mecfs"), { today: END });
    expect(facts.ok).toBe(true);
    expect(facts.pemIndicator.lag).toBe(1);
    expect(facts.pemIndicator.r).toBeGreaterThan(0.3);
  });
});

describe("registry wiring", () => {
  it("computeHero dispatches by the lens heroSignal", () => {
    const recs = buildDays(40, () => ({ resting_hr: 60, steps: 8000, avg_hr: 78 }));
    const facts = computeHero(getLens("pots_dysautonomia"), recs, { today: END });
    expect(facts.heroSignal).toBe(HERO_SIGNALS.ORTHOSTATIC_HR);
    expect(computeHero(getLens("general"), recs, {})).toBeNull(); // default has no hero
  });
});
