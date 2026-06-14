import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  metricSubScore, dailyScore, computeDailyScores, characterizeWindow,
  computeHistoricalBest, METRIC_SPECS, ENGINE_CONFIG,
} from "../src/healthEngine.js";

const spec = (key) => METRIC_SPECS.find((m) => m.key === key);

/* ---- helpers ---- */
const toUTC = (s) => new Date(s + "T00:00:00Z");
const dayStr = (d) => d.toISOString().slice(0, 10);
// Build consecutive daily rows ending at `end`. p(i) gets days-ago (0 = end).
function buildRows(days, end, p) {
  const e = toUTC(end);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(e.getTime() - i * 86400000);
    out.push({ date: dayStr(d), ...p(i) });
  }
  return out;
}

describe("metricSubScore", () => {
  it("higher-is-better clamps to [0,1]", () => {
    const s = spec("steps");
    expect(metricSubScore(s, 11000)).toBe(1);
    expect(metricSubScore(s, 2000)).toBe(0);
    expect(metricSubScore(s, 50000)).toBe(1); // clamp high
    expect(metricSubScore(s, 0)).toBe(0); // clamp low
    expect(metricSubScore(s, 6500)).toBeCloseTo((6500 - 2000) / (11000 - 2000), 5);
  });
  it("lower-is-better inverts", () => {
    const s = spec("resting_hr");
    expect(metricSubScore(s, 50)).toBe(1);
    expect(metricSubScore(s, 75)).toBe(0);
    expect(metricSubScore(s, 40)).toBe(1);
  });
  it("band scores 1 inside the target range, falls off outside", () => {
    const s = spec("sleep_hours");
    expect(metricSubScore(s, 8)).toBe(1);
    expect(metricSubScore(s, 7)).toBe(1);
    expect(metricSubScore(s, 5)).toBe(0); // floor
    expect(metricSubScore(s, 10)).toBe(0); // ceil
    expect(metricSubScore(s, 6)).toBeCloseTo((6 - 5) / (7 - 5), 5);
  });
  it("returns null for missing values", () => {
    expect(metricSubScore(spec("steps"), null)).toBeNull();
    expect(metricSubScore(spec("steps"), undefined)).toBeNull();
    expect(metricSubScore(spec("steps"), NaN)).toBeNull();
  });
});

describe("dailyScore (completeness weighting + missing data)", () => {
  it("scores a full row in [0,100] with completeness 1", () => {
    const row = { resting_hr: 50, sleep_hours: 8, steps: 11000, exercise_minutes: 45, active_energy: 700, spo2: 98, avg_hr: 65 };
    const r = dailyScore(row);
    expect(r.score).toBeCloseTo(100, 5);
    expect(r.completeness).toBeCloseTo(1, 5);
  });
  it("renormalizes over present metrics; absent ones are not zeros", () => {
    // Only steps present, and it's the best value -> score 100 but low completeness.
    const r = dailyScore({ steps: 11000 });
    expect(r.score).toBeCloseTo(100, 5);
    expect(r.completeness).toBeLessThan(0.3);
    expect(r.present).toEqual(["steps"]);
  });
  it("returns null score for an all-missing row", () => {
    const r = dailyScore({ foo: 1 });
    expect(r.score).toBeNull();
    expect(r.completeness).toBe(0);
  });
});

describe("characterizeWindow", () => {
  it("averages raw metrics and derives workouts/week", () => {
    const rows = [
      { resting_hr: 50, steps: 10000, workouts: 1, bedtime_min: 600, wake_min: 390 },
      { resting_hr: 54, steps: 12000, workouts: 0, bedtime_min: 620, wake_min: 400 },
    ];
    const p = characterizeWindow(rows);
    expect(p.resting_hr).toBe(52);
    expect(p.steps).toBe(11000);
    expect(p.workouts_per_week).toBe(3.5); // 1 workout over 2 days * 7
    expect(p.bedtime_min).toBe(610);
  });
});

describe("computeHistoricalBest", () => {
  const baseline = (i) => ({ resting_hr: 58, sleep_hours: 7.1, steps: 8000, exercise_minutes: 30, active_energy: 480, spo2: 97, avg_hr: 76, workouts: i % 2, bedtime_min: 648, wake_min: 405 });
  const great = { resting_hr: 51, sleep_hours: 8.0, steps: 12000, exercise_minutes: 50, active_energy: 720, spo2: 98, avg_hr: 68, workouts: 1, bedtime_min: 610, wake_min: 385 };
  const poor = { resting_hr: 65, sleep_hours: 6.1, steps: 5200, exercise_minutes: 12, active_energy: 290, spo2: 96, avg_hr: 84, workouts: 0, bedtime_min: 705, wake_min: 435 };

  it("flags too little history", () => {
    const rows = buildRows(10, "2026-06-13", baseline);
    const f = computeHistoricalBest(rows);
    expect(f.ok).toBe(false);
  });

  it("finds a recent-enough peak and computes % back + gaps", () => {
    // best block ~120 days ago, decline in the last 40 days.
    const rows = buildRows(220, "2026-06-13", (i) => {
      if (i <= 40) return poor;
      if (i >= 100 && i <= 140) return great;
      return baseline(i);
    });
    const f = computeHistoricalBest(rows);
    expect(f.ok).toBe(true);
    // best window should sit inside the planted great block
    expect(f.best.endDate >= "2026-01-01").toBe(true);
    expect(f.best.profile.steps).toBeGreaterThan(11000);
    expect(f.current.profile.steps).toBeLessThan(6000);
    expect(f.percentBack).toBeGreaterThan(0);
    expect(f.percentBack).toBeLessThan(100);
    expect(f.atOrAboveBest).toBe(false);
    expect(f.target.kind).toBe("peak"); // < 2yr old
    const steps = f.gaps.find((g) => g.key === "steps");
    expect(steps.delta).toBeLessThan(0); // current below best
    expect(steps.towardBest).toBe(false);
  });

  it("uses a realistic target + OLD_PEAK confound when the peak is ancient", () => {
    // best block > 730 days before end; decline recent; baseline in between.
    const rows = buildRows(820, "2026-06-13", (i) => {
      if (i <= 40) return poor;
      if (i >= 760 && i <= 800) return great;
      return baseline(i);
    });
    const f = computeHistoricalBest(rows);
    expect(f.ok).toBe(true);
    expect(f.best.ageDays).toBeGreaterThan(ENGINE_CONFIG.RECENCY_THRESHOLD_DAYS);
    expect(f.target.kind).toBe("realistic");
    // realistic target should sit between current and peak for steps
    const ts = f.target.profile.steps;
    expect(ts).toBeGreaterThan(f.current.profile.steps);
    expect(ts).toBeLessThan(f.best.profile.steps);
    expect(f.confounds.map((c) => c.code)).toContain("OLD_PEAK");
  });

  it("is robust to gaps and missing fields (never throws)", () => {
    const rows = buildRows(120, "2026-06-13", (i) => {
      if (i % 3 === 0) return {}; // whole-day gap (no metrics)
      if (i % 5 === 0) return { steps: 7000 }; // only one metric
      return baseline(i);
    }).filter((_, idx) => idx % 7 !== 0); // drop some days entirely
    expect(() => computeHistoricalBest(rows)).not.toThrow();
  });

  it("flags LOW_CURRENT_COVERAGE when recent data is sparse", () => {
    const rows = buildRows(220, "2026-06-13", (i) => {
      if (i <= 40 && i % 4 !== 0) return {}; // most recent days empty
      if (i >= 100 && i <= 140) return great;
      return baseline(i);
    });
    const f = computeHistoricalBest(rows);
    expect(f.ok).toBe(true);
    expect(f.confounds.map((c) => c.code)).toContain("LOW_CURRENT_COVERAGE");
  });
});

describe("synthetic fixture (samples/sample_garmin_history.csv)", () => {
  it("detects a ~14-month-old best and a real gap to now", () => {
    const path = fileURLToPath(new URL("../samples/sample_garmin_history.csv", import.meta.url));
    const lines = readFileSync(path, "utf8").trim().split("\n");
    const header = lines[0].split(",");
    const rows = lines.slice(1).map((l) => {
      const c = l.split(",");
      const o = {};
      header.forEach((h, i) => { o[h] = h === "date" ? c[i] : (c[i] === "" ? null : Number(c[i])); });
      return o;
    });
    const f = computeHistoricalBest(rows);
    expect(f.ok).toBe(true);
    expect(f.best.monthsAgo).toBeGreaterThanOrEqual(11);
    expect(f.best.monthsAgo).toBeLessThanOrEqual(17);
    expect(f.percentBack).toBeGreaterThan(25);
    expect(f.percentBack).toBeLessThan(75);
    expect(f.atOrAboveBest).toBe(false);
    expect(f.best.profile.steps).toBeGreaterThan(f.current.profile.steps);
  });
});
