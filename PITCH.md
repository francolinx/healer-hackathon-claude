# VisitPulse - pitch, demo, and Q&A

## 3-minute pitch (read-aloud)

**(0:00) The failure.** "We didn't start with AI. We started with a workflow failure: patients now
walk in with months of wearable data, and clinicians have about seven minutes and no real way to
use it. So useful signals get ignored, and noisy ones become a liability."

**(0:30) Why it's hard.** "The data is high-volume, longitudinal, and consumer-grade. Nobody has
time to scroll a month of graphs during a visit, and raw exports aren't trustworthy."

**(1:00) What we built.** "VisitPulse takes the patient's own Apple Health / Garmin export and
produces a one-page, non-diagnostic pre-visit brief - and it's contextual: it reshapes around who
you're seeing and why. Same data, a cardiology-palpitations lens vs a sleep-fatigue lens." (Demo
here - see run-of-show.)

**(2:00) Why it's safe and true.** "It's deterministic - templates and rules, not a model - so
every line traces to a number a clinician can vet. It flags what changed, says what it couldn't
see, and never hides a finding. On six years of my real data it correctly says I'm stable - it
doesn't cry wolf."

**(2:30) The moat and the ask.** "Everyone racing in - Oura+Counsel, Verily, Twin - is building a
closed loop: their device, their doctors. We're the open layer: any wearable a patient owns,
routed to the doctor they already see. And every clinician who tells us whether a summary mattered
makes that translation harder to copy. That feedback loop is the moat. We're looking for clinical
design partners / a pilot clinic."

## Demo run-of-show (~90 seconds)
1. **Upload** -> "Use sample Garmin data."
2. **Trend analysis** -> point at the shaded recent window and the flagged rows.
3. **Visit context** -> Cardiology / Palpitations.
4. **Brief** -> note it leads with heart rate + exertion and complaint-specific questions.
5. **Live switch** -> flip to Sleep medicine / Fatigue. "Same data, re-framed instantly." (the wow)
6. **Feedback** -> click "Acted on it." "Every click is labeled data - that's the flywheel."
7. **(Optional capper)** Upload `samples/sample_garmin.csv` (or your real export CSV) -> "it stays
   honest - no false alarm, and it flags the missing SpO2."

## Judge Q&A
- **"Oura+Counsel just shipped this."** -> "Closed loop: their ring, their doctors. We're open -
  any device, the patient's own doctor. They won't build that; it cannibalizes captive-care revenue."
- **"Isn't this Verily / Twin?"** -> "Those are continuous, enrollment-based metabolic programs sold
  to health plans. We're a discrete pre-visit brief - any condition, the patient's own clinician."
- **"What stops a funded team copying you?"** -> "The model is easy; the compounding asset is
  clinician feedback on which summaries change decisions - labeled data they can't buy. And the
  closed players are structurally blocked from competing without breaking their own model."
- **"Why trust consumer data?"** -> "Don't trust the data - trust the translation. We show
  uncertainty, what we filtered out, and what we couldn't see. We earn trust by also saying
  'you're fine,' not only by raising flags."
