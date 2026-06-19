/* ------------------------------------------------------------------ */
/* lenses/heroRegistry.js — seam for condition "hero" computations      */
/* ------------------------------------------------------------------ */
//
// Maps a lens.heroSignal key -> a deterministic function that computes that
// condition's hero metric from the canonical records. EMPTY today (only "none").
// Later prompts call registerHero("pem_load", fn) WITHOUT touching the selector
// or the config schema. Functions must be pure + deterministic (no LLM, no I/O).

import { HERO_SIGNALS } from "./schema.js";

const registry = new Map();

// Register (or override) a hero computation. fn signature is up to the feature,
// but by convention: (records, lens, options) -> { ...deterministic facts }.
export function registerHero(key, fn) {
  if (typeof fn !== "function") throw new Error("registerHero: fn must be a function");
  registry.set(key, fn);
}

export function getHero(key) {
  return registry.get(key) || null;
}

export function hasHero(key) {
  return registry.has(key);
}

// Convenience: run a lens's hero computation if one is registered, else null.
export function computeHero(lens, records, options) {
  const key = lens && lens.heroSignal;
  if (!key || key === HERO_SIGNALS.NONE) return null;
  const fn = registry.get(key);
  return fn ? fn(records, lens, options) : null;
}

// "none" is always present and returns null (the general lens has no hero metric).
registerHero(HERO_SIGNALS.NONE, () => null);
