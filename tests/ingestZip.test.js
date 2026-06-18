import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { ingestFiles } from "../src/ingest/index.js";

// Build an in-memory zip and wrap it as a File (Node 20+ has File/Blob globals),
// exercising the real router buildInputs -> unzip -> route -> reconcile path.
async function zipFile(name, entries) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  const buf = await zip.generateAsync({ type: "uint8array" });
  return new File([buf], name, { type: "application/zip" });
}

describe("zip + multi-file ingestion", () => {
  it("unpacks a zip of canonical CSVs and reconciles them", async () => {
    const file = await zipFile("export.zip", {
      "export/steps.csv": "date,steps\n2026-01-01,5000\n2026-01-02,6000\n",
      "export/hr.csv": "date,resting_hr\n2026-01-01,60\n2026-01-02,61\n",
      "export/readme.txt": "not data",
      "__MACOSX/._steps.csv": "junk",
    });
    const res = await ingestFiles([file]);
    expect(res.records.length).toBe(2);
    expect(res.records[0].steps).toBe(5000);
    expect(res.records[0].resting_hr).toBe(60);
  });

  it("handles multiple top-level files at once", async () => {
    const f1 = new File(["date,steps\n2026-02-01,3000\n"], "steps.csv", { type: "text/csv" });
    const f2 = new File(["date,sleep_hours\n2026-02-01,7.5\n"], "sleep.csv", { type: "text/csv" });
    const res = await ingestFiles([f1, f2]);
    expect(res.records.length).toBe(1);
    expect(res.records[0].steps).toBe(3000);
    expect(res.records[0].sleep_hours).toBe(7.5);
  });

  it("routes an unrecognized tabular file inside a zip to unmapped (no crash)", async () => {
    const file = await zipFile("weird.zip", { "weird/data.csv": "when,foo\n2026-01-01,1\n" });
    const res = await ingestFiles([file]);
    expect(res.records.length).toBe(0);
    expect(res.unmapped.length).toBe(1);
  });
});
