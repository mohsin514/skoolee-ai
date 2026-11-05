import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STAFF_PAGE, staffNextCursor, staffPageWhere } from "@/lib/improvement/service";
import { arabicWorkflowUi, urduWorkflowUi } from "@/lib/locale/workflow-ui-messages";

test("SKAI-1724: staff after the first 300 are reachable by cursor, same-name ties included", () => {
  const rows = Array.from({ length: 301 }, (_, i) => ({ id: `u${String(i).padStart(4, "0")}`, fullName: `Teacher ${String(Math.floor(i / 3)).padStart(3, "0")}` }));
  const where = staffPageWhere(staffNextCursor(rows)) as { OR: [{ fullName: { gt: string } }, { fullName: string; id: { gt: string } }] };
  const rest = rows.filter(r => r.fullName > where.OR[0].fullName.gt || (r.fullName === where.OR[1].fullName && r.id > where.OR[1].id.gt));
  assert.deepEqual(rest.map(r => r.id), [rows[300].id]);
  assert.equal(staffNextCursor(rows.slice(0, STAFF_PAGE)), null);
  assert.deepEqual(staffPageWhere(undefined), {});
  assert.throws(() => staffPageWhere("garbage"), /changed/);
});

test("SKAI-1724: every page stays inside the school and excludes families; failures are visible", () => {
  const service = readFileSync("src/lib/improvement/service.ts", "utf8");
  const body = service.slice(service.indexOf("export async function staff("));
  assert.match(body, /assert\(!NOT_STAFF\.includes\(user\.role\)/);
  assert.match(body, /where: \{ schoolId: user\.schoolId, isActive: true, role: \{ notIn: \["PARENT", "STUDENT"\] \}, \.\.\.staffPageWhere\(cursor\) \}/);
  assert.doesNotMatch(body.slice(0, 500), /take: 300\b/);
  const view = readFileSync("src/components/improvement/improvement-workspace.tsx", "utf8");
  assert.doesNotMatch(view, /view=staff"\)\.catch\(\(\) => \[\]\)/, "a failed staff load is no longer swallowed");
  assert.match(view, /<ErrorState description=\{ui\("Staff could not be loaded\."\)\} onRetry=\{\(\) => loadPeople\(\)\}/);
  assert.equal(view.match(/\n\s+\{peopleControl\}/g)?.length, 2, "owner and reviewer selectors both get the control");
  for (const key of ["Staff could not be loaded.", "Load more staff", "Loading more staff…", "More staff could not be loaded. The list shown is kept."]) assert.ok(arabicWorkflowUi[key] && urduWorkflowUi[key], key);
});
