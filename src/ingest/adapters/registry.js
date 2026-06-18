/* ------------------------------------------------------------------ */
/* ingest/adapters/registry.js — ordered list of all adapters          */
/* ------------------------------------------------------------------ */
// Source-specific adapters first (they detect with higher confidence); the
// generic CSV/JSON adapters are the low-priority fallback before guided mapping.

import { appleHealthAdapter } from "./appleHealth.js";
import { healthConnectAdapter } from "./healthConnect.js";
import { googleFitAdapter } from "./googleFit.js";
import { samsungHealthAdapter } from "./samsungHealth.js";
import { fitbitAdapter } from "./fitbit.js";
import { garminAdapter } from "./garmin.js";
import { genericJsonAdapter } from "./genericJson.js";
import { genericCsvAdapter } from "./genericCsv.js";

export const ADAPTERS = [
  appleHealthAdapter,
  healthConnectAdapter,
  googleFitAdapter,
  samsungHealthAdapter,
  fitbitAdapter,
  garminAdapter,
  genericJsonAdapter,
  genericCsvAdapter,
];

export const ADAPTERS_BY_ID = Object.fromEntries(ADAPTERS.map((a) => [a.id, a]));
