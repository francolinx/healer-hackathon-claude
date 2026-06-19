import { describe, it, expect } from "vitest";
import { toSeries, eventSeries, pearson, stdDev, alignedPairs, laggedCorrelation, addDays } from "../src/lenses/correlation.js";

describe("pearson", () => {
  it("is +1 / -1 for perfectly (anti)correlated data, null without variance", () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6);
    expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 6);
    expect(pearson([5, 5, 5], [1, 2, 3])).toBeNull();
    expect(pearson([1], [1])).toBeNull();
  });
});

describe("stdDev", () => {
  it("computes population SD; null for <2", () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 6);
    expect(stdDev([3])).toBeNull();
  });
});

describe("series + aligned pairs", () => {
  it("toSeries skips missing values", () => {
    const m = toSeries([{ date: "2026-01-01", steps: 100 }, { date: "2026-01-02", steps: null }, { date: "2026-01-03", steps: 300 }], "steps");
    expect(m.size).toBe(2);
    expect(m.get("2026-01-03")).toBe(300);
  });
  it("alignedPairs shifts y by the lag", () => {
    const x = new Map([["2026-01-01", 1], ["2026-01-02", 2], ["2026-01-03", 3]]);
    const y = new Map([["2026-01-02", 10], ["2026-01-03", 20], ["2026-01-04", 30]]);
    const { xs, ys } = alignedPairs(x, y, 1);
    expect(xs).toEqual([1, 2, 3]);
    expect(ys).toEqual([10, 20, 30]);
  });
  it("eventSeries fills zeros across the span", () => {
    const s = eventSeries([{ date: "2026-01-02" }], { first: "2026-01-01", last: "2026-01-03" });
    expect(s.get("2026-01-01")).toBe(0);
    expect(s.get("2026-01-02")).toBe(1);
    expect(s.size).toBe(3);
  });
});

describe("laggedCorrelation", () => {
  it("finds the lag with the strongest association and respects minPairs", () => {
    // y[d+1] = x[d]  -> perfect correlation at lag 1
    const x = new Map(), y = new Map();
    let d = "2026-01-01";
    for (let i = 0; i < 20; i++) { const v = (i * 7) % 11; x.set(d, v); y.set(addDays(d, 1), v); d = addDays(d, 1); }
    const { best, all } = laggedCorrelation(x, y, { lags: [0, 1, 2], minPairs: 8 });
    expect(best.lag).toBe(1);
    expect(best.r).toBeCloseTo(1, 6);
    // lag 0 has variance but weak/!=1
    expect(Math.abs(all.find((a) => a.lag === 0).r)).toBeLessThan(1);
  });
  it("returns null best when below minPairs", () => {
    const x = new Map([["2026-01-01", 1], ["2026-01-02", 2]]);
    const y = new Map([["2026-01-01", 1], ["2026-01-02", 2]]);
    expect(laggedCorrelation(x, y, { lags: [0], minPairs: 8 }).best).toBeNull();
  });
});
