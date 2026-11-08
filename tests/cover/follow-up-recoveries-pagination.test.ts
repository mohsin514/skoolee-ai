import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RECOVERY_PAGE, recoveryNextCursor, recoveryPageWhere } from "@/lib/cover/recovery";
import { arabicWorkflowUi, urduWorkflowUi } from "@/lib/locale/workflow-ui-messages";

test("SKAI-1729: open recovery 101 is reachable by cursor, same-date ties included", () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({ id: `r${String(i).padStart(3, "0")}`, date: new Date(Date.UTC(2026, 8, 1) + Math.floor(i / 5) * 86_400_000) }));
  const where = recoveryPageWhere(recoveryNextCursor(rows)) as { OR: [{ date: { gt: Date } }, { date: Date; id: { gt: string } }] };
  const rest = rows.filter(r => r.date > where.OR[0].date.gt || (r.date.getTime() === where.OR[1].date.getTime() && r.id > where.OR[1].id.gt));
  assert.deepEqual(rest.map(r => r.id), [rows[100].id]);
  assert.equal(recoveryNextCursor(rows.slice(0, RECOVERY_PAGE)), null);
  assert.throws(() => recoveryPageWhere("Zm9v"), /changed/);
});

test("SKAI-1729: the count covers the whole open queue and every page keeps the leader gate and campus scope", () => {
  const src = readFileSync("src/lib/cover/recovery.ts", "utf8");
  const body = src.slice(src.indexOf("export async function openRecoveries"), src.indexOf("export async function campusFollowUp"));
  assert.match(body, /if \(!canLead\(user, campusId\)\) throw new ApiError\("Cover follow-up is for campus leaders\.", 403\);/);
  assert.match(body, /const scope = \{ schoolId: user\.schoolId, campusId, status: \{ in: OPEN_RECOVERY \} \};/);
  assert.match(body, /prisma\.lessonRecovery\.count\(\{ where: scope \}\)/);
  assert.doesNotMatch(src.slice(src.indexOf("export async function campusFollowUp")), /take: 100\b/);
  const view = readFileSync("src/components/cover/cover-follow-up.tsx", "utf8");
  assert.match(view, /value=\{openTotal\} label=\{ui\("Missed learning still open"\)\}/);
  assert.match(view, /data-follow-recoveries-more/);
  for (const key of ["Load more missed learning", "Loading more missed learning…", "More missed learning could not be loaded. The list shown is kept."]) assert.ok(arabicWorkflowUi[key] && urduWorkflowUi[key], key);
});
