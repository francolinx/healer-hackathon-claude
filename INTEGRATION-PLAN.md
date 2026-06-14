# INTEGRATION-PLAN.md — future messaging + LLM communication layer

**Status: SCAFFOLD + PLAN ONLY.** Nothing in this document is wired tonight. The
app is fully functional, offline, and client-side with zero external deps. This
file describes how a future weekly-nudge messaging backend with a grounded LLM
would work, and the decisions the user must make first.

## The seam that already exists
- **FACTS** are produced by `src/healthEngine.js` (`computeHistoricalBest`) —
  deterministic, auditable, LLM-free.
- **COMMUNICATION** goes through one adapter in `src/coach.js`:
  ```js
  generateCoachMessage(facts, options) -> string
  ```
  Today `options.strategy` defaults to `"template"`. A future `"llm"` strategy
  plugs in behind the same signature; callers don't change.

## Grounding contract (non-negotiable, enforced for any strategy)
A generated message may reference **only** fields present on the `facts` object
(and values derived from them by arithmetic). It must never:
- introduce a number, metric, or trend that isn't in `facts`;
- make a diagnostic, triage, or treatment claim (wellness/behavioral framing only).
The LLM, when added, **rephrases** facts — it never decides them. The existing
unit test `tests/coach.test.js` ("grounding: …") demonstrates the check; an LLM
path would keep an equivalent post-generation validator (reject/repair messages
that contain numbers not in the allowed set).

## Proposed future architecture (weekly nudge)
```
[client] export/upload  ->  FACTS (healthEngine, on-device)
                               │
                  (privacy boundary — see decisions)
                               ▼
                 weekly scheduled job (server or on-device)
                               │  reads FACTS only (not raw health rows)
                               ▼
        grounded LLM phrases nudge  ->  validator (grounding contract)
                               ▼
        messaging API (Telegram / WhatsApp / SMS / email)  ->  user
```
Key property: the job operates on the compact **facts object**, not raw
wearable data. That keeps the data surface tiny and reviewable.

## Implementation sketch (when greenlit)
1. `coach.js`: add `strategy: "llm"` calling a provider via an injected client;
   keep the template path as offline fallback.
2. Provider call uses Anthropic's latest model (e.g. Claude) with `facts` as the
   only source of truth in the system prompt + the grounding contract; low
   temperature; short max tokens.
3. Post-validate output against `facts` (numbers/claims allowlist); on failure,
   fall back to the deterministic template message — never block the nudge.
4. Scheduler: a weekly job (cron / serverless) computes facts and sends.
5. Messaging adapter: pluggable `send(channel, userRef, text)`.

## Decisions the user must make FIRST (Phase-4 gate)
1. **Privacy posture (the big one).** What, if anything, leaves the device?
   - Option A: stay on-device — facts + message generated locally, app only
     hands the finished text to a share sheet / messaging deep link. Strongest
     privacy; no server secrets. (Recommended default to evaluate first.)
   - Option B: server-side facts — requires consent, encryption in transit + at
     rest, data-retention policy, and a BAA if this ever touches PHI in a covered
     context.
   The current build's claim — "no health data leaves the device" — must remain
   true until this is decided.
2. **Where the LLM runs** — provider API (key management, who holds the key) vs a
   self-hosted/on-device model. Affects cost, latency, and #1.
3. **Key management** — never ship a provider key in the client bundle. Requires
   a minimal backend or edge function if Option B.
4. **Consent + channels** — explicit opt-in per channel (Telegram/WhatsApp/SMS),
   unsubscribe, message frequency, and quiet hours.
5. **Storage** — if any history is persisted for weekly jobs: where, encrypted
   how, retention, deletion on request.

## What is intentionally NOT done tonight
No keys, no backend, no network calls, no scheduler, no messaging. The template
adapter ships and is the offline default; the LLM strategy throws clearly until
the decisions above are made.
