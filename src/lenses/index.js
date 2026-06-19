/* ------------------------------------------------------------------ */
/* lenses/index.js — public lens API                                   */
/* ------------------------------------------------------------------ */

import { ALL_LENSES, SELECTABLE_LENSES, generalLens } from "./configs.js";
import { normalizeLens, mergeLenses } from "./schema.js";

const BY_ID = Object.fromEntries(ALL_LENSES.map((l) => [l.id, l]));

export function getLens(id) {
  return BY_ID[id] ? normalizeLens(BY_ID[id]) : null;
}

// Build the ACTIVE lens from a list of selected condition ids. No/invalid/only
// "general" -> the default lens (today's behavior). One -> that lens. Many ->
// merged (comorbidity). Order of `ids` drives section ordering / framing priority.
export function getActiveLens(ids) {
  const valid = (ids || []).filter((id) => BY_ID[id] && id !== "general");
  if (!valid.length) return normalizeLens(generalLens);
  return mergeLenses(valid.map((id) => BY_ID[id]));
}

// Options for the condition selector UI.
export const LENS_OPTIONS = SELECTABLE_LENSES.map((l) => ({ id: l.id, label: l.displayName, status: l.status }));

export { ALL_LENSES, SELECTABLE_LENSES, generalLens } from "./configs.js";
export { normalizeLens, mergeLenses, HERO_SIGNALS, DEFAULT_SECTION_ORDER } from "./schema.js";
export { registerHero, getHero, hasHero, computeHero } from "./heroRegistry.js";
