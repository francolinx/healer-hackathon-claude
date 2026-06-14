/* ------------------------------------------------------------------ */
/* coach.js — VisitPulse COMMUNICATION layer                           */
/* ------------------------------------------------------------------ */
//
// Turns the deterministic FACTS object from healthEngine.computeHistoricalBest()
// into a warm, specific, wellness-framed nudge.
//
// TONIGHT this is 100% TEMPLATE-BASED and deterministic — NO LLM, no network.
// The adapter `generateCoachMessage(facts, options)` exposes a `strategy` seam so
// a future LLM implementation can be dropped in WITHOUT changing callers.
//
// ===================== GROUNDING CONTRACT =====================
// Any implementation (template OR future LLM) may ONLY reference fields that are
// present on the `facts` object (and values derived from them by arithmetic).
// It must NEVER invent a number, metric, or claim that isn't in `facts`, and it
// must NEVER make a diagnostic/medical claim — output stays in behavioral
// wellness framing (sleep timing, activity, consistency). The LLM, when added,
// rephrases facts; it never decides them. See INTEGRATION-PLAN.md.
// ==============================================================

export const COACH_DISCLAIMER =
  "This is patient-generated wearable data and should be interpreted as context, not diagnosis.";

/* ---------------- formatting helpers ------------------------------- */
const isNum = (v) => v !== null && v !== undefined && !Number.isNaN(Number(v));

function fmt12h(totalMinFromMidnight) {
  const t = ((Math.round(totalMinFromMidnight) % 1440) + 1440) % 1440;
  let h = Math.floor(t / 60);
  const m = t % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
// bedtime is stored as minutes-after-noon; wake as minutes-after-midnight.
export const bedtimeClock = (minsAfterNoon) => (isNum(minsAfterNoon) ? fmt12h(720 + Number(minsAfterNoon)) : null);
export const wakeClock = (minsAfterMid) => (isNum(minsAfterMid) ? fmt12h(Number(minsAfterMid)) : null);
const comma = (n) => Math.round(n).toLocaleString("en-US");

/* ---------------- focus-gap selection ------------------------------ */
// Only behavioral, directly-movable metrics are candidates to "coach" on.
// Resting HR is an outcome, not a behavior, so we report it but never instruct it.
const MOVABLE = ["bedtime_min", "sleep_hours", "steps", "exercise_minutes", "workouts_per_week"];

function pickFocusGap(facts) {
  const movable = (facts.gaps || []).filter((g) => MOVABLE.includes(g.key) && !g.towardBest && isNum(g.delta));
  if (!movable.length) return null;
  // Rank by absolute % change from the best (bedtime gets a small boost because a
  // modest % shift in timing has outsized downstream effect on sleep).
  const severity = (g) => {
    const base = g.pctChange === null ? 0 : Math.abs(g.pctChange);
    return g.key === "bedtime_min" ? base * 1.5 + 5 : base;
  };
  return movable.slice().sort((a, b) => severity(b) - severity(a))[0];
}

/* ---------------- the parts a UI can render separately -------------- */
export function buildCoachParts(facts) {
  if (!facts || !facts.ok) {
    return {
      headline: "Not enough history yet",
      body: (facts && facts.reason) || "Add more days of data and your best window will appear here.",
      nudge: null,
      caveat: null,
      disclaimer: COACH_DISCLAIMER,
    };
  }

  const lowCoverage = (facts.confounds || []).some((c) => c.code === "LOW_CURRENT_COVERAGE");
  const caveat = lowCoverage
    ? "Heads up: your recent data is a bit sparse, so treat this as a rough read."
    : null;

  // At or above best right now -> celebrate, don't nudge.
  if (facts.atOrAboveBest) {
    const p = facts.current.profile;
    const highlights = [];
    if (isNum(p.steps)) highlights.push(`~${comma(p.steps)} steps/day`);
    if (isNum(p.sleep_hours)) highlights.push(`${p.sleep_hours}h sleep`);
    if (isNum(p.resting_hr)) highlights.push(`${p.resting_hr} bpm resting HR`);
    return {
      headline: "You're at your best right now 🎉",
      body: `Your last ${facts.config.CURRENT_DAYS} days score about ${facts.current.score} — at or above your strongest past window (${facts.best.score}). This is the version of you your data has been pointing to.`,
      nudge: highlights.length ? `Keep the rhythm that's working: ${highlights.join(", ")}.` : "Keep doing what you're doing.",
      caveat,
      disclaimer: COACH_DISCLAIMER,
    };
  }

  const headline = `You're ${facts.percentBack}% back to your best`;
  const monthsAgo = facts.best.monthsAgo;
  const whenWord = monthsAgo <= 1 ? "recently" : `about ${monthsAgo} month${monthsAgo === 1 ? "" : "s"} ago`;
  const body = `Your strongest sustained stretch was ${whenWord} (a ${facts.config.WINDOW_DAYS}-day window scoring ${facts.best.score}). Your last ${facts.config.CURRENT_DAYS} days score ${facts.current.score} — so you're ${facts.percentBack}% of the way back to a level you've already proven you can hit.`;

  const nudge = buildNudge(facts);
  return { headline, body, nudge, caveat, disclaimer: COACH_DISCLAIMER };
}

// The single specific, grounded nudge. Target numbers come from facts.target
// (peak or realistic), so nothing is invented.
function buildNudge(facts) {
  const g = pickFocusGap(facts);
  if (!g) return "You're close on the movable habits — hold the line on sleep and daily activity this week.";
  const tgt = (facts.target && facts.target.profile) || facts.best.profile;
  const isRealistic = facts.target && facts.target.kind === "realistic";
  const aim = isRealistic ? "a realistic next step" : "your proven best";

  switch (g.key) {
    case "bedtime_min": {
      const bestC = bedtimeClock(g.best);
      const curC = bedtimeClock(g.current);
      const tgtC = bedtimeClock(tgt.bedtime_min);
      const slip = Math.round(g.delta); // minutes later than best
      return `Your bedtime slipped about ${slip} min later — around ${curC} lately vs ${bestC} in your best stretch. Try lights-out by ${tgtC || bestC} three nights this week; sleep timing tends to pull the rest along.`;
    }
    case "sleep_hours": {
      return `You're averaging ${g.current}h of sleep vs ${g.best}h in your best window. Aim for ${tgt.sleep_hours || g.best}h a few nights this week (${aim}).`;
    }
    case "steps": {
      return `You're around ${comma(g.current)} steps/day vs ${comma(g.best)} in your best window. A short daily walk to nudge back toward ${comma(tgt.steps || g.best)}/day is the fastest lever (${aim}).`;
    }
    case "exercise_minutes": {
      return `Active minutes are at ${Math.round(g.current)}/day vs ${Math.round(g.best)} in your best stretch. Two or three sessions this week gets you toward ${Math.round(tgt.exercise_minutes || g.best)}/day (${aim}).`;
    }
    case "workouts_per_week": {
      return `You're at ${g.current} workouts/week vs ${g.best} in your best window. Putting ${Math.round(tgt.workouts_per_week || g.best)} on the calendar this week is the move (${aim}).`;
    }
    default:
      return "Hold the line on sleep and daily activity this week.";
  }
}

/* ---------------- main adapter (strategy seam) --------------------- */
export function generateCoachMessage(facts, options = {}) {
  const strategy = options.strategy || "template";
  if (strategy === "template") {
    const parts = buildCoachParts(facts);
    const lines = [];
    if (parts.caveat) lines.push(parts.caveat);
    lines.push(parts.headline + ".");
    lines.push(parts.body);
    if (parts.nudge) lines.push(parts.nudge);
    if (options.includeDisclaimer !== false) lines.push("", parts.disclaimer);
    return lines.join("\n");
  }
  // ---- SEAM: future grounded-LLM strategy ----
  // A future impl would call an LLM with `facts` as the ONLY source of truth and
  // the grounding contract above as a system constraint. Not available offline.
  throw new Error(`coach strategy "${strategy}" is not available in this client-side build`);
}

/* ---------------- deterministic weekly pattern summary ------------- */
// For the "This Week" view. Pure; compares the last 7 days to the best profile.
export function weeklySummary(recentRows, bestProfile) {
  const rows = (recentRows || []).slice(-7);
  const vals = (key) => rows.map((r) => r[key]).filter(isNum).map(Number);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const std = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
  const beds = vals("bedtime_min");
  const r2 = (v, d = 0) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

  const sleep = r2(mean(vals("sleep_hours")), 1);
  const steps = r2(mean(vals("steps")), 0);
  const ex = r2(mean(vals("exercise_minutes")), 0);
  const workouts = vals("workouts").reduce((a, b) => a + b, 0);
  const bedtime = beds.length ? r2(mean(beds), 0) : null;
  const bedtimeStd = beds.length >= 2 ? r2(std(beds), 0) : null;

  const consistency = bedtimeStd === null ? null : bedtimeStd <= 25 ? "steady" : bedtimeStd <= 50 ? "a little variable" : "all over the place";
  return {
    days: rows.length,
    sleep, steps, exerciseMinutes: ex, workouts,
    bedtimeClock: bedtimeClock(bedtime),
    wakeClock: wakeClock(r2(mean(vals("wake_min")), 0)),
    bedtimeStd, consistency,
    vsBest: bestProfile ? {
      steps: isNum(steps) && isNum(bestProfile.steps) ? steps - bestProfile.steps : null,
      sleep: isNum(sleep) && isNum(bestProfile.sleep_hours) ? r2(sleep - bestProfile.sleep_hours, 1) : null,
    } : null,
  };
}
