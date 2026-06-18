import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { healthConnectAdapter } from "../src/ingest/adapters/healthConnect.js";
import { googleFitAdapter } from "../src/ingest/adapters/googleFit.js";
import { samsungHealthAdapter } from "../src/ingest/adapters/samsungHealth.js";
import { fitbitAdapter } from "../src/ingest/adapters/fitbit.js";
import { garminAdapter } from "../src/ingest/adapters/garmin.js";
import { inputFromText } from "../src/ingest/router.js";

const fx = (rel) => readFileSync(fileURLToPath(new URL("./fixtures/sources/" + rel, import.meta.url)), "utf8");
const inp = (name, rel) => inputFromText(name, fx(rel));
const day = (recs, d) => recs.find((r) => r.date === d);

describe("Health Connect adapter", () => {
  const input = inp("health_connect.json", "health_connect.json");
  it("detects and parses records into one canonical day", async () => {
    expect(healthConnectAdapter.detect(input)).toBeGreaterThan(0.5);
    const { records, warnings } = await healthConnectAdapter.parse(input);
    const d = day(records, "2026-04-01");
    expect(d.steps).toBe(5000);          // 3000 + 2000
    expect(d.resting_hr).toBe(55);
    expect(d.sleep_hours).toBe(8);        // 23:00 -> 07:00, attributed to wake date
    expect(d.active_energy).toBe(600);    // nested {inKilocalories}
    expect(d.spo2).toBe(97);
    expect(d.exercise_minutes).toBe(45);
    expect(d.workouts).toBe(1);
    expect(warnings.join(" ")).toMatch(/NEEDS VALIDATION/);
  });
});

describe("Google Fit (Takeout) adapter", () => {
  const input = inp("Takeout/Fit/Daily activity metrics/2026-04-02.csv", "googlefit_2026-04-02.csv");
  it("derives the date from the filename and maps daily metrics", async () => {
    expect(googleFitAdapter.detect(input)).toBeGreaterThan(0.8);
    const { records } = await googleFitAdapter.parse(input);
    const d = day(records, "2026-04-02");
    expect(d.steps).toBe(9000);
    expect(d.active_energy).toBe(520);
    expect(d.exercise_minutes).toBe(40);
    expect(d.avg_hr).toBe(72);
    expect(d.resting_hr).toBe(54); // approx from daily min HR
  });
});

describe("Samsung Health adapter", () => {
  const input = inp("com.samsung.health.step_count.202604.csv", "com.samsung.health.step_count.202604.csv");
  it("strips the metadata line and sums steps per day", async () => {
    expect(samsungHealthAdapter.detect(input)).toBeGreaterThan(0.8);
    const { records } = await samsungHealthAdapter.parse(input);
    const d = day(records, "2026-04-03");
    expect(d.steps).toBe(8500);
  });
});

describe("Fitbit adapter", () => {
  it("parses sleep (minutesAsleep -> hours, bedtime/wake)", async () => {
    const input = inp("sleep-2026-04-04.json", "fitbit_sleep-2026-04-04.json");
    expect(fitbitAdapter.detect(input)).toBeGreaterThan(0.8);
    const { records } = await fitbitAdapter.parse(input);
    const d = day(records, "2026-04-04");
    expect(d.sleep_hours).toBe(7.5);
    expect(d.bedtime_min).toBe(((23 + 12) % 24) * 60 + 15); // 23:15
    expect(d.wake_min).toBe(6 * 60 + 45); // 06:45
  });
  it("parses resting heart rate (value.value)", async () => {
    const input = inp("resting_heart_rate-2026-04-04.json", "fitbit_resting_heart_rate-2026-04-04.json");
    const { records } = await fitbitAdapter.parse(input);
    expect(day(records, "2026-04-04").resting_hr).toBe(56);
  });
  it("sums intraday steps per day", async () => {
    const input = inp("steps-2026-04-04.json", "fitbit_steps-2026-04-04.json");
    const { records } = await fitbitAdapter.parse(input);
    expect(day(records, "2026-04-04").steps).toBe(1000); // 300 + 700
  });
});

describe("Garmin adapter", () => {
  const input = inp("DI_CONNECT/DI-Connect-Aggregator/UDSFile.json", "garmin_UDSFile.json");
  it("detects DI_CONNECT path and maps daily summary fields", async () => {
    expect(garminAdapter.detect(input)).toBeGreaterThan(0.8);
    const { records } = await garminAdapter.parse(input);
    const d = day(records, "2026-04-05");
    expect(d.steps).toBe(11000);
    expect(d.resting_hr).toBe(50);
    expect(d.active_energy).toBe(700);
    expect(d.exercise_minutes).toBe(45); // 30 + 15
    expect(d.sleep_hours).toBe(7.5);     // 27000s / 3600
  });
});
