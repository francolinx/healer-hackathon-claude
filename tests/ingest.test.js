import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeRecords, completenessOf, fieldPresence } from "../src/ingest/schema.js";
import { appleHealthAdapter } from "../src/ingest/adapters/appleHealth.js";
import { genericCsvAdapter } from "../src/ingest/adapters/genericCsv.js";
import { genericJsonAdapter } from "../src/ingest/adapters/genericJson.js";
import { route, inputFromText, looksTabular } from "../src/ingest/router.js";
import { reconcile, DEFAULT_PRIORITY } from "../src/ingest/reconcile.js";
import { ingestInputs } from "../src/ingest/index.js";
import { ADAPTERS } from "../src/ingest/adapters/registry.js";
import { toISODate, applyMapping } from "../src/ingest/mapping.jsx";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("schema", () => {
  it("normalizes loose rows, drops undated, sorts, nulls blanks (not zeros)", () => {
    const recs = normalizeRecords([
      { date: "2026-02-02", steps: "5000", spo2: "" },
      { foo: 1 },
      { Date: "2026-02-01", steps: 6000, resting_hr: "60" },
    ]);
    expect(recs.map((r) => r.date)).toEqual(["2026-02-01", "2026-02-02"]);
    expect(recs[1].steps).toBe(5000);
    expect(recs[1].spo2).toBeNull(); // blank -> null
    expect(recs[0].resting_hr).toBe(60);
  });
  it("completeness + presence reflect missing fields", () => {
    const recs = normalizeRecords([{ date: "2026-01-01", steps: 100 }, { date: "2026-01-02", steps: 200 }]);
    const c = completenessOf(recs);
    expect(c.steps).toBe(1);
    expect(c.resting_hr).toBe(0);
    expect(fieldPresence(recs).missing).toContain("resting_hr");
  });
});

const APPLE_XML = `<?xml version="1.0"?>
<HealthData>
  <Record type="HKQuantityTypeIdentifierStepCount" startDate="2026-03-01 09:00:00 -0800" endDate="2026-03-01 09:10:00 -0800" value="1200"/>
  <Record type="HKQuantityTypeIdentifierStepCount" startDate="2026-03-01 18:00:00 -0800" endDate="2026-03-01 18:10:00 -0800" value="800"/>
  <Record type="HKQuantityTypeIdentifierRestingHeartRate" startDate="2026-03-01 07:00:00 -0800" endDate="2026-03-01 07:01:00 -0800" value="58"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="2026-02-28 23:00:00 -0800" endDate="2026-03-01 03:00:00 -0800" value="HKCategoryValueSleepAnalysisAsleepCore"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="2026-03-01 02:50:00 -0800" endDate="2026-03-01 06:30:00 -0800" value="HKCategoryValueSleepAnalysisAsleepREM"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="2026-02-28 22:30:00 -0800" endDate="2026-03-01 06:30:00 -0800" value="HKCategoryValueSleepAnalysisInBed"/>
  <Workout workoutActivityType="HKWorkoutActivityTypeRunning" startDate="2026-03-01 17:00:00 -0800" duration="30"/>
</HealthData>`;

describe("appleHealth adapter", () => {
  it("detects HealthKit XML and ignores CDA", () => {
    expect(appleHealthAdapter.detect(inputFromText("export.xml", APPLE_XML))).toBeGreaterThan(0.9);
    expect(appleHealthAdapter.detect(inputFromText("export_cda.xml", "<ClinicalDocument/>"))).toBe(0);
  });
  it("parses steps (summed), resting HR, merged asleep sleep (wake date)", async () => {
    const { records } = await appleHealthAdapter.parse(inputFromText("export.xml", APPLE_XML));
    const day = records.find((r) => r.date === "2026-03-01");
    expect(day.steps).toBe(2000); // 1200 + 800
    expect(day.resting_hr).toBe(58);
    expect(day.workouts).toBe(1);
    // asleep 22:?->06:30 merged from Core(23:00-03:00)+REM(02:50-06:30); InBed ignored.
    // wake date = 2026-03-01; merged span 23:00->06:30 = 7.5h
    expect(day.sleep_hours).toBe(7.5);
  });
});

describe("generic CSV + JSON adapters on existing samples", () => {
  it("generic CSV detects + parses the 30-day sample", async () => {
    const csv = read("../samples/sample_garmin.csv");
    const input = inputFromText("sample_garmin.csv", csv);
    expect(genericCsvAdapter.detect(input)).toBeGreaterThan(0.6);
    const { records, completeness } = await genericCsvAdapter.parse(input);
    expect(records.length).toBe(30);
    expect(completeness.steps).toBe(1);
  });
  it("generic JSON detects + parses canonical records", async () => {
    const json = JSON.stringify([{ date: "2026-01-01", steps: 5000, resting_hr: 60 }, { date: "2026-01-02", steps: 6000, resting_hr: 61 }]);
    const input = inputFromText("data.json", json);
    expect(genericJsonAdapter.detect(input)).toBeGreaterThan(0.5);
    const { records } = await genericJsonAdapter.parse(input);
    expect(records.length).toBe(2);
    expect(records[0].steps).toBe(5000);
  });
});

describe("router", () => {
  it("routes XML->appleHealth, canonical CSV->genericCsv, unknown tabular->unmapped", () => {
    const inputs = [
      inputFromText("export.xml", APPLE_XML),
      inputFromText("mine.csv", "date,steps,resting_hr\n2026-01-01,5000,60\n"),
      inputFromText("weird.csv", "when,foo,bar\n2026-01-01,1,2\n"),
    ];
    const { routed, unmapped } = route(inputs, ADAPTERS);
    const byName = Object.fromEntries(routed.map((r) => [r.input.name, r.adapter.id]));
    expect(byName["export.xml"]).toBe("appleHealth");
    expect(byName["mine.csv"]).toBe("genericCsv");
    expect(unmapped.map((u) => u.name)).toContain("weird.csv");
  });
  it("looksTabular detects delimited files", () => {
    expect(looksTabular(inputFromText("x.csv", "a,b\n1,2\n"))).toBe(true);
    expect(looksTabular(inputFromText("x.json", "{}"))).toBe(false);
  });
});

describe("reconcile", () => {
  const setA = { source: "appleHealth", label: "Apple", fileName: "a", completeness: { steps: 1, resting_hr: 1 },
    records: [{ date: "2026-01-01", steps: 5000, resting_hr: 60 }, { date: "2026-01-03", steps: 7000, resting_hr: null }] };
  const setB = { source: "googleFit", label: "Google Fit", fileName: "b", completeness: { steps: 1, sleep_hours: 1 },
    records: [{ date: "2026-01-01", steps: 9999, sleep_hours: 7.5 }, { date: "2026-01-03", sleep_hours: 6.0, resting_hr: 70 }] };

  it("prefers higher-priority source per field, fills gaps from lower, tags provenance", () => {
    const out = reconcile([setB, setA]); // intentionally unordered
    const d1 = out.records.find((r) => r.date === "2026-01-01");
    expect(d1.steps).toBe(5000); // appleHealth wins over googleFit
    expect(d1.sleep_hours).toBe(7.5); // only googleFit had it
    expect(out.provenance.get("2026-01-01").steps).toBe("appleHealth");
    expect(out.provenance.get("2026-01-01").sleep_hours).toBe("googleFit");
  });
  it("flags cross-source conflicts and counts the gap day", () => {
    const out = reconcile([setA, setB]);
    const c = out.conflicts.find((x) => x.date === "2026-01-01" && x.field === "steps");
    expect(c).toBeTruthy();
    expect(c.kept.source).toBe("appleHealth");
    expect(c.other.source).toBe("googleFit");
    // 2026-01-02 missing entirely -> 1 gap day in the 01-01..01-03 span
    expect(out.gapDays).toBe(1);
  });
  it("never turns missing fields into zeros", () => {
    const out = reconcile([setA]);
    const d3 = out.records.find((r) => r.date === "2026-01-03");
    expect(d3.resting_hr).toBeNull();
  });
  it("DEFAULT_PRIORITY lists appleHealth above googleFit", () => {
    expect(DEFAULT_PRIORITY.indexOf("appleHealth")).toBeLessThan(DEFAULT_PRIORITY.indexOf("googleFit"));
  });
});

describe("ingestInputs end-to-end", () => {
  it("merges two single-signal CSVs into one canonical series", async () => {
    const inputs = [
      inputFromText("steps.csv", "date,steps\n2026-01-01,5000\n2026-01-02,6000\n"),
      inputFromText("hr.csv", "date,resting_hr\n2026-01-01,60\n2026-01-02,61\n"),
    ];
    const res = await ingestInputs(inputs);
    expect(res.records.length).toBe(2);
    expect(res.records[0].steps).toBe(5000);
    expect(res.records[0].resting_hr).toBe(60);
    expect(res.warnings.length).toBe(0);
  });
  it("returns unmapped (not a crash) for an unrecognized tabular file", async () => {
    const res = await ingestInputs([inputFromText("weird.csv", "when,foo\n2026-01-01,1\n")]);
    expect(res.records.length).toBe(0);
    expect(res.unmapped.length).toBe(1);
  });
});

describe("guided mapping transform", () => {
  it("toISODate handles iso / mdy / dmy / ymd / epoch", () => {
    expect(toISODate("2026-03-04", "iso")).toBe("2026-03-04");
    expect(toISODate("03/04/2026", "mdy")).toBe("2026-03-04");
    expect(toISODate("04/03/2026", "dmy")).toBe("2026-03-04");
    expect(toISODate("2026/03/04", "ymd")).toBe("2026-03-04");
    expect(toISODate("1740000000000", "epoch_ms")).toBe(new Date(1740000000000).toISOString().slice(0, 10));
    expect(toISODate("", "iso")).toBeNull();
  });
  it("applyMapping maps columns + date format to canonical records", () => {
    const rows = [{ d: "01/02/2026", st: "5000", hr: "60" }, { d: "01/03/2026", st: "6000", hr: "61" }];
    const recs = applyMapping(rows, { date: "d", steps: "st", resting_hr: "hr" }, "mdy");
    expect(recs.length).toBe(2);
    expect(recs[0].date).toBe("2026-01-02");
    expect(recs[0].steps).toBe(5000);
    expect(recs[0].resting_hr).toBe(60);
    expect(recs[0].sleep_hours).toBeNull();
  });
});
