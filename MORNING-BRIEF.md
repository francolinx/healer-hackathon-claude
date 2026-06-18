# MORNING-BRIEF — what happened overnight

**Deploy URL (LIVE):** the repo is connected to Vercel and **auto-deploys** on every
push to `claude/modest-sagan-zgmmeg`. Newest production build:
`https://healer-hackathon-claude-git-f40245-leothelion059-2425s-projects.vercel.app`
(stable branch alias — always points at the latest). All work is committed + pushed.

## Session 3 update — Multi-source ingestion (NEW)
Upload **any platform's export** (Apple Health, Health Connect, Google Fit,
Samsung, Fitbit, Garmin), **multiple files, or a `.zip`** → everything normalizes
into the one canonical schema the app already uses. Client-side, deterministic,
no PHI leaves the device. Apple Health + CSV/JSON are verified; the 5 new platform
adapters are best-effort and **NEED VALIDATION against a real export** (see
ADAPTERS.md). A **guided column-mapping** fallback makes any tabular file
ingestible, and an **ingestion summary** shows sources/fields/conflicts. Tests:
**52 passing** (engine, coach, ingest, adapters, zip). The one thing waiting on
you: drop a real export from each platform so I can flip adapters to ✅ verified.

---

## TL;DR
VisitPulse now has **two experiences** behind a top-of-page toggle, and both
build, run, and are demo-safe offline:
1. **Pre-Visit Brief** — your original clinical flow, unchanged.
2. **Health Coach (NEW, the hero)** — *Historical-Best benchmarking*: scans the
   full history, finds your best sustained window, and shows **"% back to your
   best"** with the receipts.

`npm run build` ✅ · `npm test` ✅ (25/25) · preview serves 200 · no LLM, no
network, no PHI leaves the device.

## What's new (look at these first)
1. **Toggle to "Health Coach" → "Use sample 2-year history"** on the Upload
   screen. You'll see:
   - **Your Best Self:** the big *% back to your best* number, the daily-score
     timeline with your best window (green) and last 30 days (amber) shaded, a
     **then-vs-now gap** per signal, a **peak vs realistic target**, and confound
     caveats.
   - **This Week:** last-7-day pattern + a **template coach nudge** (copyable).
2. **The FACTS/COMMUNICATION split** (the architecture that makes this safe):
   - `src/healthEngine.js` — deterministic, LLM-free facts (documented in
     `SCORING.md`, unit-tested).
   - `src/coach.js` — template messages today, with a documented **LLM seam** and
     a **grounding contract** (AI may only rephrase facts, never invent them).
3. **Sleep parsing fixed** in the Apple Health parser: counts only *Asleep*
   stages, merges overlapping intervals (no double-counting), attributes each
   night to the wake date, and extracts bedtime/wake.
4. **Full-history parsing**: the coach uses the entire export; the clinical brief
   still uses the last 30 days (`recentData`).

## Decisions that wait on YOU
1. **Privacy posture — the big one.** A future weekly LLM nudge over
   Telegram/WhatsApp needs you to decide what (if anything) leaves the device,
   where the LLM runs, consent, encryption, keys. Nothing is wired until you
   decide — see **INTEGRATION-PLAN.md**. The "no health data leaves the device"
   claim is currently TRUE and I kept it that way.
2. **Default experience.** I left the default as **Pre-Visit Brief** to preserve
   your existing demo. If you want the coach to lead, change
   `useState("clinical")` → `useState("coach")` in `src/App.jsx` (one line).
3. **Deploy + QR** (carried over from the prior session).

## Deploy (still needs your Vercel account)
This sandbox has no Vercel CLI/token, so I couldn't deploy. The repo is
deploy-ready (`vercel.json`, Vite preset). To deploy:
1. vercel.com/new → import `francolinx/healer-hackathon-claude` → set production
   branch to `claude/modest-sagan-zgmmeg` (or merge it to your default).
2. After it's live, run `npm run qr -- https://YOUR-URL.vercel.app visitpulse-qr`
   for the pitch-slide QR (`DEPLOY.md` has details).
If your repo is already connected to Vercel, my pushes to the branch will have
triggered a build automatically — grab the URL from the Vercel dashboard.

## Recommended next 3 steps
1. **Make the privacy decision** (Phase 4 gate) so the weekly grounded-LLM nudge
   can be built behind the existing `coach.js` seam.
2. **Deploy + QR**, then drop the URL at the top of this file.
3. **Tune the coach for a real export:** run your own `export.xml` through the
   Health Coach and sanity-check the best window / ranges in `METRIC_SPECS`
   (`SCORING.md` explains every knob); adjust if your data suggests different
   wellness bands.

## Where everything lives
- Logs/decisions: `NIGHT-LOG.md`, `DECISIONS.md`
- Engine spec: `SCORING.md` · Future messaging/LLM: `INTEGRATION-PLAN.md`
- Tests: `tests/` (`npm test`) · Plan: `PLAN.md` · Deploy: `DEPLOY.md`
