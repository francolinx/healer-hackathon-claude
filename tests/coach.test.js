import { describe, it, expect } from "vitest";
import { computeHistoricalBest } from "../src/healthEngine.js";
import { generateCoachMessage, buildCoachParts, weeklySummary, COACH_DISCLAIMER, bedtimeClock, wakeClock } from "../src/coach.js";

const toUTC = (s) => new Date(s + "T00:00:00Z");
const dayStr = (d) => d.toISOString().slice(0, 10);
function buildRows(days, end, p) {
  const e = toUTC(end);
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push({ date: dayStr(new Date(e.getTime() - i * 86400000)), ...p(i) });
  return out;
}
const baseline = (i) => ({ resting_hr: 58, sleep_hours: 7.1, steps: 8000, exercise_minutes: 30, active_energy: 480, spo2: 97, avg_hr: 76, workouts: i % 2, bedtime_min: 648, wake_min: 405 });
const great = { resting_hr: 51, sleep_hours: 8.0, steps: 12000, exercise_minutes: 50, active_energy: 720, spo2: 98, avg_hr: 68, workouts: 1, bedtime_min: 610, wake_min: 385 };
const poor = { resting_hr: 65, sleep_hours: 6.1, steps: 5200, exercise_minutes: 12, active_energy: 290, spo2: 96, avg_hr: 84, workouts: 0, bedtime_min: 705, wake_min: 435 };

const declinedFacts = () => computeHistoricalBest(buildRows(220, "2026-06-13", (i) => (i <= 40 ? poor : i >= 100 && i <= 140 ? great : baseline(i))));

describe("clock formatting", () => {
  it("bedtime minutes-after-noon -> 12h clock", () => {
    expect(bedtimeClock(610)).toBe("10:10 PM"); // 720+610=1330 = 22:10
    expect(bedtimeClock(700)).toBe("11:40 PM");
    expect(bedtimeClock(750)).toBe("12:30 AM"); // past midnight
  });
  it("wake minutes-after-midnight -> 12h clock", () => {
    expect(wakeClock(390)).toBe("6:30 AM");
    expect(wakeClock(0)).toBe("12:00 AM");
  });
});

describe("buildCoachParts / generateCoachMessage", () => {
  it("leads with % back and includes the proven-best framing", () => {
    const f = declinedFacts();
    const parts = buildCoachParts(f);
    expect(parts.headline).toContain(`${f.percentBack}%`);
    expect(parts.disclaimer).toBe(COACH_DISCLAIMER);
    const msg = generateCoachMessage(f);
    expect(msg).toContain(`${f.percentBack}%`);
    expect(msg).toContain(COACH_DISCLAIMER);
    expect(msg).toContain(String(f.best.score));
    expect(msg).toContain(String(f.current.score));
  });

  it("produces a specific, grounded behavioral nudge", () => {
    const f = declinedFacts();
    const parts = buildCoachParts(f);
    expect(parts.nudge).toBeTruthy();
    // nudge must concern a movable behavior, never resting HR directly
    expect(parts.nudge.toLowerCase()).not.toContain("resting heart");
    // it should mention at least one grounded target metric
    expect(/step|sleep|bed|workout|active|min/i.test(parts.nudge)).toBe(true);
  });

  it("is deterministic (same facts -> identical message)", () => {
    const f = declinedFacts();
    expect(generateCoachMessage(f)).toBe(generateCoachMessage(f));
  });

  it("celebrates when at/above best instead of nudging", () => {
    // flat-good history: current is the best.
    const f = computeHistoricalBest(buildRows(120, "2026-06-13", () => great));
    expect(f.ok).toBe(true);
    const parts = buildCoachParts(f);
    expect(f.atOrAboveBest).toBe(true);
    expect(parts.headline.toLowerCase()).toContain("best");
  });

  it("omits the disclaimer only when explicitly asked", () => {
    const f = declinedFacts();
    expect(generateCoachMessage(f, { includeDisclaimer: false })).not.toContain(COACH_DISCLAIMER);
  });

  it("rejects a non-template strategy in this client-side build (LLM seam)", () => {
    const f = declinedFacts();
    expect(() => generateCoachMessage(f, { strategy: "llm" })).toThrow();
  });

  it("handles not-ok facts without throwing", () => {
    const f = computeHistoricalBest(buildRows(5, "2026-06-13", baseline));
    expect(f.ok).toBe(false);
    expect(() => generateCoachMessage(f)).not.toThrow();
    expect(buildCoachParts(f).disclaimer).toBe(COACH_DISCLAIMER);
  });
});

describe("grounding: message references only numbers present in facts", () => {
  it("every multi-digit number in the body/nudge traces to a fact", () => {
    const f = declinedFacts();
    const parts = buildCoachParts(f);
    const text = [parts.headline, parts.body, parts.nudge].join(" ");
    // Allowed numbers: percentBack, scores, config windows, monthsAgo, and every
    // gap's best/current/|delta| plus target profile values (rounded forms).
    const allowed = new Set();
    const add = (v) => { if (v === null || v === undefined) return; allowed.add(Math.round(Number(v))); };
    add(f.percentBack); add(f.best.score); add(f.current.score);
    add(f.config.WINDOW_DAYS); add(f.config.CURRENT_DAYS); add(f.best.monthsAgo);
    Math.round(f.best.score) !== f.best.score && add(Math.floor(f.best.score));
    for (const g of f.gaps) { add(g.best); add(g.current); add(Math.abs(g.delta)); }
    for (const k of Object.keys(f.target.profile)) add(f.target.profile[k]);
    // numbers appearing in formatted thousands (e.g. "12,000") -> strip commas
    const nums = (text.replace(/,/g, "").match(/\d+(\.\d+)?/g) || []).map(Number);
    for (const n of nums) {
      if (n < 10) continue; // ignore small counts like "3 nights", clock parts
      // clock minutes (e.g., 10, 40) are < 60; allow any 2-digit <= 59 (times)
      if (n <= 59) continue;
      expect(allowed.has(Math.round(n))).toBe(true);
    }
  });
});

describe("weeklySummary", () => {
  it("summarizes the last 7 days deterministically", () => {
    const rows = buildRows(30, "2026-06-13", () => ({ sleep_hours: 6.5, steps: 6000, exercise_minutes: 15, workouts: 0, bedtime_min: 700, wake_min: 430 }));
    const w = weeklySummary(rows, great);
    expect(w.days).toBe(7);
    expect(w.sleep).toBe(6.5);
    expect(w.steps).toBe(6000);
    expect(w.consistency).toBe("steady"); // all identical -> std 0
    expect(w.vsBest.steps).toBe(6000 - great.steps);
  });
});
