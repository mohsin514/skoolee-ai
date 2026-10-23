import assert from "node:assert/strict";
import { test } from "node:test";
import { curriculumDataSchema, validateCurriculumApproval } from "../../src/lib/school-ai/assessment";
import { curriculumFromOutline, outlineBatches, outlineFromPages, outlineId, outlinePagesOf, pageRangeOf, verifyOutlineSuggestions } from "../../src/lib/school-ai/syllabus-outline";

const pages = [
  { page: 3, text: "Unit 1: Cells\n1.1 Describe the parts of a plant cell\n1.2 Compare plant and animal cells\nSome intro sentence that is not an outcome." },
  { page: 4, text: "Unit 2 - Forces\n- Name contact and non-contact forces\n• Measure a force with a newton meter\n2.3 Describe friction" },
];

test("outline rules read units, numbered and bulleted lines, in page order, with exact excerpts", () => {
  const rows = outlineFromPages([...pages].reverse());
  assert.deepEqual(rows.map(row => row.title), ["Describe the parts of a plant cell", "Compare plant and animal cells", "Name contact and non-contact forces", "Measure a force with a newton meter", "Describe friction"]);
  assert.equal(rows[0].unit, "Unit 1: Cells");
  assert.equal(rows[2].unit, "Unit 2 - Forces");
  assert.equal(rows[0].code, "1.1");
  assert.equal(rows[2].code, undefined);
  assert.equal(rows[0].page, "3");
  for (const row of rows) assert.ok(pages.find(page => String(page.page) === row.page)!.text.includes(row.excerpt));
  assert.deepEqual(outlineFromPages(pages).map(row => row.id), rows.map(row => row.id), "ids are deterministic");
  assert.match(rows[0].id, /^[a-zA-Z0-9_-]+$/);
});

test("outline rules read Arabic and Urdu unit headings", () => {
  const rows = outlineFromPages([{ page: 1, text: "الوحدة 1: الخلية\n- وصف أجزاء الخلية النباتية\nیونٹ 2: قوت\n- رگڑ کی وضاحت کریں" }]);
  assert.deepEqual(rows.map(row => row.unit), ["الوحدة 1: الخلية", "یونٹ 2: قوت"]);
});

test("AI suggestions are kept only when the excerpt is on the cited page", () => {
  const { kept, dropped } = verifyOutlineSuggestions([
    { unit: "Unit 1", title: "Plant cell parts", page: "3", excerpt: "Describe   the parts of a plant cell" },
    { unit: "Unit 1", title: "Invented outcome", page: "3", excerpt: "Explain photosynthesis in detail" },
    { unit: "Unit 2", title: "Friction", page: 9, excerpt: "Describe friction" },
    { unit: "Unit 1", title: "Plant cell parts", page: "3", excerpt: "Describe the parts of a plant cell" },
    { unit: "Unit 2", title: "", page: "4", excerpt: "Describe friction" },
  ], pages);
  assert.equal(kept.length, 1);
  assert.equal(dropped, 4);
  assert.equal(kept[0].title, "Plant cell parts");
});

test("batches respect the character budget and the page list falls back to the whole text", () => {
  const big = [{ page: 1, text: "a".repeat(8000) }, { page: 2, text: "b".repeat(8000) }, { page: 3, text: "c".repeat(100) }];
  assert.deepEqual(outlineBatches(big, 12000).map(batch => batch.map(page => page.page)), [[1], [2, 3]]);
  assert.deepEqual(outlinePagesOf({ extractedText: "Unit 1\n- x y z" }), [{ page: 1, text: "Unit 1\n- x y z" }]);
  assert.deepEqual(outlinePagesOf({ extractedText: "  " }), []);
  assert.equal(pageRangeOf([{ page: "3" }, { page: "7" }, { page: "4" }]), "3–7");
  assert.equal(outlineId("a", 1), outlineId("a", 1));
  assert.notEqual(outlineId("a", 1), outlineId("a", 2));
});

test("accepted rows build a draft curriculum that cites the source, bundles approval and approves untaught", () => {
  const accepted = outlineFromPages(pages).map(row => ({ suggestionId: row.id, title: row.title, unit: row.unit, page: row.page, ...(row.code ? { code: row.code } : {}) }));
  const source = { recordId: "source-1", version: 2, title: "Science syllabus", fileName: "science.pdf", excerpt: pages.map(page => page.text).join("\n"), approved: false };
  const body = curriculumFromOutline({ subjectId: "sub-1", classId: "cls-1", academicYear: "2026-27", board: "Federal", source, accepted: accepted.slice(0, 3) });
  assert.ok(curriculumDataSchema.safeParse(body).success);
  assert.deepEqual(body.approvalBundle, { sourceRecordId: "source-1", sourceVersion: 2 });
  assert.equal(body.sources[0].sourceRecordId, "source-1");
  assert.equal(body.sources[0].pageRange, "3–4");
  assert.ok(body.outcomes.every(outcome => !outcome.taught && outcome.included && outcome.sourceId === body.sources[0].id));
  assert.deepEqual(validateCurriculumApproval(body), [], "a source-cited syllabus approves before teaching starts");
  const extended = curriculumFromOutline({ existing: body, subjectId: "sub-1", classId: "cls-1", academicYear: "x", board: "y", source, accepted });
  assert.equal(extended.outcomes.length, 5, "extending appends only new outcomes");
  assert.equal(extended.sources.length, 1);
  assert.equal(extended.academicYear, "2026-27");
  const approvedSource = curriculumFromOutline({ subjectId: "sub-1", classId: "cls-1", academicYear: "2026-27", board: "Federal", source: { ...source, approved: true }, accepted });
  assert.equal(approvedSource.approvalBundle, undefined);
});

test("a hand-typed curriculum still needs one taught outcome", () => {
  const body = curriculumFromOutline({ subjectId: "s", classId: "c", academicYear: "2026-27", board: "B", source: { recordId: "r", version: 1, title: "t", fileName: "f", excerpt: "e", approved: true }, accepted: [{ suggestionId: "o1", title: "T", unit: "", page: "1" }] });
  const typed = { ...body, sources: body.sources.map(({ sourceRecordId: _r, sourceVersion: _v, ...rest }) => rest) };
  assert.ok(validateCurriculumApproval(typed).includes("Include at least one taught outcome."));
});
