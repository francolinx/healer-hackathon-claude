// Deterministic generator for a SYNTHETIC ~2-year wearable history.
// NOT real patient data. Used as a test fixture and as the coach demo loader's
// source of truth. Run: `node tests/fixtures/genHistory.mjs > samples/sample_garmin_history.csv`
//
// Planted structure so the engine has something real to find:
//   - a genuine BEST 5-week stretch ~14 months ago (low RHR, ~8h sleep, ~12k
//     steps, consistent early bedtime, frequent workouts)
//   - a gentle middle baseline
//   - a DECLINED last ~40 days (higher RHR, ~6.2h sleep, ~5.5k steps, late and
//     inconsistent bedtime, few workouts)
//   - realistic gaps: ~10% of days dropped entirely, SpO2 sparse.

const DAYS = 730;
const END = "2026-06-13";

// Deterministic LCG PRNG.
let seed = 1337;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 100000) / 100000; };
const jitter = (amp) => (rnd() * 2 - 1) * amp;

const toUTC = (s) => new Date(s + "T00:00:00Z");
const dayStr = (d) => d.toISOString().slice(0, 10);

const end = toUTC(END);

function profileFor(i) {
  // i = days before END (0 = END, larger = older).
  // Best window: roughly 410..445 days ago (~14 months), 5 weeks long.
  const inBest = i >= 410 && i <= 444;
  const inRecentDecline = i <= 40;
  if (inBest) return { rhr: 52, sleep: 8.0, steps: 12200, ex: 52, ae: 720, bed: 612, bedStd: 18, wake: 388, spo2: 98, wkP: 0.8 };
  if (inRecentDecline) return { rhr: 64, sleep: 6.2, steps: 5500, ex: 15, ae: 300, bed: 700, bedStd: 55, wake: 430, spo2: 96, wkP: 0.2 };
  // Baseline middle, with mild seasonality on steps (summer higher).
  const month = toUTC(dayStr(new Date(end.getTime() - i * 86400000))).getUTCMonth() + 1;
  const summer = month >= 5 && month <= 9 ? 1 : 0;
  return { rhr: 58, sleep: 7.1, steps: 8200 + summer * 900, ex: 30, ae: 480, bed: 648, bedStd: 35, wake: 405, spo2: 97, wkP: 0.5 };
}

const header = ["date", "resting_hr", "avg_hr", "steps", "exercise_minutes", "active_energy", "spo2", "sleep_hours", "workouts", "bedtime_min", "wake_min"];
const lines = [header.join(",")];

for (let i = DAYS - 1; i >= 0; i--) {
  // ~10% of days are missing entirely (device not worn).
  if (rnd() < 0.1) continue;
  const d = new Date(end.getTime() - i * 86400000);
  const p = profileFor(i);
  const ex = Math.max(0, Math.round(p.ex + jitter(10)));
  const workout = rnd() < p.wkP ? 1 : 0;
  // SpO2 sparse: present ~45% of days.
  const spo2 = rnd() < 0.45 ? Math.max(90, Math.min(100, Math.round(p.spo2 + jitter(1)))) : "";
  const row = [
    dayStr(d),
    Math.round(p.rhr + jitter(3)),
    Math.round((p.rhr + 18) + jitter(6)),
    Math.max(500, Math.round(p.steps + jitter(1800))),
    ex,
    Math.max(80, Math.round(p.ae + jitter(90))),
    spo2,
    Math.round((p.sleep + jitter(0.6)) * 10) / 10,
    workout,
    Math.round(p.bed + jitter(p.bedStd)),
    Math.round(p.wake + jitter(25)),
  ];
  lines.push(row.join(","));
}

// No leading comment line: papaparse(header:true) would treat it as the header.
// This file is SYNTHETIC (see filename + DECISIONS.md D3), not real patient data.
process.stdout.write(lines.join("\n") + "\n");
