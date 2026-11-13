import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// SKAI-1344: the roster CSV must carry official identifiers plus a stable record key for regulator reconciliation.
describe("students export columns", () => {
  const src = readFileSync("src/app/api/students/export/route.ts", "utf8");
  it.each(["Admission No", "Nationality", "Emirates ID", "eSIS / MOE ID", "Record Key"])("includes %s", (h) => {
    expect(src).toContain(`header: "${h}"`);
  });
  it("keeps the export uncached", () => expect(src).toContain('"Cache-Control": "no-store"'));
});
