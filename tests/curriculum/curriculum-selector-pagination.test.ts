import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CURRICULUM_PAGE, curriculumNextCursor, curriculumPageWhere } from "@/lib/curriculum/service";
import { getObjectiveMapCopy } from "@/components/curriculum/objective-map-copy";

test("SKAI-1734: approved curriculum 201 is reachable by cursor, same-title ties included", () => {
  const rows = Array.from({ length: 201 }, (_, i) => ({ id: `c${String(i).padStart(3, "0")}`, title: `Science ${String(Math.floor(i / 2)).padStart(3, "0")}` }));
  const where = curriculumPageWhere(curriculumNextCursor(rows)) as { OR: [{ title: { gt: string } }, { title: string; id: { gt: string } }] };
  const rest = rows.filter(r => r.title > where.OR[0].title.gt || (r.title === where.OR[1].title && r.id > where.OR[1].id.gt));
  assert.deepEqual(rest.map(r => r.id), [rows[200].id]);
  assert.equal(curriculumNextCursor(rows.slice(0, CURRICULUM_PAGE)), null);
  assert.throws(() => curriculumPageWhere("junk"), /changed/);
});

test("SKAI-1734: every page keeps school, campus, approved and assigned-subject scope; the selector loads more", () => {
  const src = readFileSync("src/lib/curriculum/service.ts", "utf8");
  const body = src.slice(src.indexOf("export async function listCurricula"), src.indexOf("export const mapInput"));
  assert.match(body, /assertSchoolAiAccess\(user, "view", permissions\)/);
  assert.match(body, /where: \{ schoolId: user\.schoolId, kind: "CURRICULUM", status: "APPROVED", \.\.\.\(campusId \? \{ campusId \} : \{\}\), subjectId: \{ in: subjects\.map\(subject => subject\.id\) \}, \.\.\.curriculumPageWhere\(cursor\) \}/);
  assert.doesNotMatch(body, /take: 200\b/);
  assert.match(readFileSync("src/components/curriculum/ObjectiveMap.tsx", "utf8"), /data-curricula-more/);
  for (const lang of ["en", "ar", "ur"]) { const t = getObjectiveMapCopy(lang); assert.ok(t.loadMoreCurricula && t.loadingMoreCurricula && t.moreCurriculaFailed && t.retryMoreCurricula, lang); }
});
