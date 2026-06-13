// Feedback flywheel persistence (optional).
//
// If VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set at build time, a
// feedback click is written to a Supabase table. If they are not set, this is a
// no-op and the UI falls back to local state - the demo never breaks and no
// network call is made. PHI never leaves the browser either way: we persist only
// the visit-context labels and the usefulness signal, no wearable data.
//
// Expected table (SQL):
//   create table feedback (
//     id          bigint generated always as identity primary key,
//     ts          timestamptz not null default now(),
//     clinician_type   text,
//     chief_complaint  text,
//     value       text
//   );
//   alter table feedback enable row level security;
//   create policy "anon insert" on feedback for insert to anon with check (true);

import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TABLE = import.meta.env.VITE_SUPABASE_FEEDBACK_TABLE || "feedback";

export const feedbackEnabled = Boolean(URL && KEY);

let client = null;
function getClient() {
  if (!feedbackEnabled) return null;
  if (!client) client = createClient(URL, KEY);
  return client;
}

// Fire-and-forget. Resolves to true if a row was written, false otherwise.
// Never throws - a logging failure must not interrupt the demo.
export async function logFeedback({ clinicianType, chiefComplaint, value }) {
  const supabase = getClient();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from(TABLE).insert({
      ts: new Date().toISOString(),
      clinician_type: clinicianType,
      chief_complaint: chiefComplaint,
      value,
    });
    if (error) {
      console.warn("VisitPulse: feedback insert failed (continuing offline):", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("VisitPulse: feedback insert threw (continuing offline):", err);
    return false;
  }
}
