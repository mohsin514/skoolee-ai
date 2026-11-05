import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LEARNER_PAGE_SIZE, learnerNextCursor, learnerPageWhere } from "@/lib/portfolio/service";
import { arabicWorkflowUi, urduWorkflowUi } from "@/lib/locale/workflow-ui-messages";

test("SKAI-1716: 401 learners return a cursor that reaches learner 401, same-name ties included", () => {
  const rows = Array.from({ length: 401 }, (_, i) => ({ id: `s${String(i).padStart(4, "0")}`, fullName: `Learner ${String(Math.floor(i / 2)).padStart(3, "0")}` }));
  const where = learnerPageWhere(learnerNextCursor(rows)) as { OR: [{ fullName: { gt: string } }, { fullName: string; id: { gt: string } }] };
  const rest = rows.filter(r => r.fullName > where.OR[0].fullName.gt || (r.fullName === where.OR[1].fullName && r.id > where.OR[1].id.gt));
  assert.deepEqual(rest.map(r => r.id), [rows[400].id]);
  assert.equal(learnerNextCursor(rows.slice(0, LEARNER_PAGE_SIZE)), null);
  assert.deepEqual(learnerPageWhere(null), {});
  assert.throws(() => learnerPageWhere(Buffer.from("[1]").toString("base64url")), /changed/);
});

test("SKAI-1716: every page keeps the school, campus/class scope; the selector offers Load more", () => {
  const service = readFileSync("src/lib/portfolio/service.ts", "utf8");
  const body = service.slice(service.indexOf("export async function teachingLearners"));
  assert.match(body, /where: \{ schoolId: user\.schoolId, archivedAt: null, \.\.\.\(lead \? .*\{ classId: \{ in: classIds \?\? \[\] \} \}\), \.\.\.learnerPageWhere\(cursor\) \}/);
  assert.doesNotMatch(body.slice(0, 900), /take: 400/);
  assert.match(body.slice(0, 200), /STUDENT" \|\| user\.role === "PARENT"\) throw/);
  const view = readFileSync("src/components/portfolio/portfolio.tsx", "utf8");
  assert.match(view, /data-pf-more/);
  for (const key of ["Load more learners", "Loading more learners…", "More learners could not be loaded. The list shown is kept."]) assert.ok(arabicWorkflowUi[key] && urduWorkflowUi[key], key);
});
