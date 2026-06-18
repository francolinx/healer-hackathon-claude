/* ------------------------------------------------------------------ */
/* ingest/adapters/registry.js — ordered list of all adapters          */
/* ------------------------------------------------------------------ */
// Source-specific adapters first (they detect with higher confidence); the
// generic CSV/JSON adapters are the low-priority fallback before guided mapping.
// New platform adapters are appended here as they are implemented (Phase D).

import { appleHealthAdapter } from "./appleHealth.js";
import { genericJsonAdapter } from "./genericJson.js";
import { genericCsvAdapter } from "./genericCsv.js";

export const ADAPTERS = [
  appleHealthAdapter,
  genericJsonAdapter,
  genericCsvAdapter,
];

export const ADAPTERS_BY_ID = Object.fromEntries(ADAPTERS.map((a) => [a.id, a]));
