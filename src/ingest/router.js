/* ------------------------------------------------------------------ */
/* ingest/router.js — sniff files, unpack zips, dispatch to adapters   */
/* ------------------------------------------------------------------ */
//
// Turns uploaded File objects (and zip archives / multiple files) into adapter
// "inputs", then picks the highest-confidence adapter for each. Anything tabular
// with no confident adapter is returned as `unmapped` for the guided-mapping UI.
// Client-side only; zips are unpacked in the browser with JSZip (lazy-loaded).

export const TEXT_EXTS = ["csv", "tsv", "txt", "json", "xml"];
const TEXT_LIMIT = 25 * 1024 * 1024; // read whole file as text under this; above -> stream (XML)
const HEAD_BYTES = 64 * 1024;
export const DETECT_THRESHOLD = 0.4;

export const extOf = (name) => { const m = /\.([a-z0-9]+)$/i.exec(name || ""); return m ? m[1].toLowerCase() : ""; };

// Build an adapter input from raw text (used by zip entries + tests).
export function inputFromText(name, text) {
  const t = String(text);
  return { name, ext: extOf(name), size: t.length, head: t.slice(0, HEAD_BYTES), text: t, file: null };
}

async function blobHead(file) {
  try { return await file.slice(0, HEAD_BYTES).text(); } catch (_) { return ""; }
}

async function isZip(file) {
  if (extOf(file.name) === "zip") return true;
  try {
    const b = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    return b[0] === 0x50 && b[1] === 0x4b; // "PK"
  } catch (_) { return false; }
}

async function fileToInput(file) {
  const name = file.name || "upload";
  const ext = extOf(name);
  const size = file.size;
  const head = await blobHead(file);
  const text = size <= TEXT_LIMIT ? await file.text() : null; // huge XML stays a Blob (streamed)
  return { name, ext, size, head, text, file };
}

async function unzipToInputs(file) {
  const JSZip = (await import("jszip")).default;
  const buf = typeof file.arrayBuffer === "function" ? await file.arrayBuffer() : file;
  const zip = await JSZip.loadAsync(buf);
  const inputs = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const base = entry.name.split("/").pop();
    if (!base || base.startsWith(".")) continue; // skip __MACOSX, dotfiles
    if (!TEXT_EXTS.includes(extOf(entry.name))) continue; // skip binaries
    const text = await entry.async("string");
    inputs.push(inputFromText(entry.name, text));
  }
  return inputs;
}

// Expand a FileList/array of File into adapter inputs (unpacking any zips).
export async function buildInputs(fileList) {
  const files = Array.from(fileList || []);
  const inputs = [];
  for (const file of files) {
    if (await isZip(file)) inputs.push(...(await unzipToInputs(file)));
    else inputs.push(await fileToInput(file));
  }
  return inputs;
}

export function looksTabular(input) {
  if (["csv", "tsv", "txt"].includes(input.ext)) return true;
  const head = input.head || "";
  const firstLine = head.split(/\r?\n/)[0] || "";
  return /[,;\t]/.test(firstLine) && /\r?\n/.test(head);
}

// Assign each input to the best adapter (or to unmapped/skipped).
export function route(inputs, adapters) {
  const routed = [];
  const unmapped = [];
  const skipped = [];
  for (const input of inputs) {
    let best = null;
    for (const a of adapters) {
      let c = 0;
      try { c = a.detect(input) || 0; } catch (_) { c = 0; }
      if (!best || c > best.confidence) best = { adapter: a, confidence: c };
    }
    if (best && best.confidence >= DETECT_THRESHOLD) routed.push({ input, adapter: best.adapter, confidence: best.confidence });
    else if (looksTabular(input)) unmapped.push(input);
    else skipped.push({ input, reason: "No adapter recognized this file." });
  }
  return { routed, unmapped, skipped };
}
