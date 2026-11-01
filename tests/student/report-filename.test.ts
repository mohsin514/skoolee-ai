import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/student/reports/page.tsx", "utf8");
const name = (title: string | undefined) => {
  const slug = (title ?? "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${slug ? `report-card-${slug}` : "report-card"}.pdf`;
};

test("SKAI-1489: Arabic or Urdu-only titles fall back to report-card.pdf", () => {
  assert.equal(name("امتحان منتصف الفصل"), "report-card.pdf");
  assert.equal(name("وسط مدتی امتحان"), "report-card.pdf");
  assert.equal(name(undefined), "report-card.pdf");
  assert.equal(name("Mid-Term 2026"), "report-card-Mid-Term-2026.pdf");
  assert.equal(name("Term 1 — امتحان"), "report-card-Term-1.pdf");
});

test("SKAI-1489: the student page uses the same rule", () => {
  assert.match(source, /\.replace\(\/\[\^a-z0-9\]\+\/gi, "-"\)\.replace\(\/\^-\+\|-\+\$\/g, ""\)/);
  assert.match(source, /`\$\{slug \? `report-card-\$\{slug\}` : "report-card"\}\.pdf`/);
});
