import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COMPLAINT_PAGE, complaintCursor, complaintPageWhere } from "@/lib/front-desk/complaints";
import { arabicWorkflowUi, urduWorkflowUi } from "@/lib/locale/workflow-ui-messages";

const route = readFileSync("src/app/api/front-desk/complaints/route.ts", "utf8");

test("SKAI-1720: Active, Unassigned and Overdue count the whole filtered queue, not the 300 loaded rows", () => {
  const get = route.slice(route.indexOf("const filters = {"), route.indexOf("export async function POST"));
  assert.doesNotMatch(get, /active\.filter\(/, "counters are no longer derived from the loaded page");
  assert.match(get, /const activeWhere = \{ \.\.\.filters, AND: \[\.\.\.filters\.AND, \{ status: \{ not: "RESOLVED" \} \}\] \};/);
  assert.match(get, /prisma\.complaint\.count\(\{ where: activeWhere \}\)/);
  assert.match(get, /prisma\.complaint\.count\(\{ where: \{ \.\.\.activeWhere, AND: \[\.\.\.activeWhere\.AND, \{ ownerId: null \}\] \} \}\)/);
  assert.match(get, /prisma\.complaint\.count\(\{ where: \{ \.\.\.activeWhere, AND: \[\.\.\.activeWhere\.AND, \{ dueDate: \{ lt: today \} \}\] \} \}\)/);
  assert.match(get, /\.\.\.scope, AND: \[visibleWhere\(user\)\]/, "counts keep campus scope and confidentiality");
});

test("SKAI-1720: the 301st complaint is reachable through a keyset cursor, ties included", () => {
  const rows = Array.from({ length: 301 }, (_, i) => ({ id: `c${String(999 - i).padStart(3, "0")}`, date: new Date(Date.UTC(2026, 9, 1) - Math.floor(i / 4) * 86_400_000), createdAt: new Date(Date.UTC(2026, 9, 1) - Math.floor(i / 2) * 1000) }));
  const where = complaintPageWhere(complaintCursor(rows[COMPLAINT_PAGE - 1]))!;
  const [a, b, c] = where.OR as [{ date: { lt: Date } }, { date: Date; createdAt: { lt: Date } }, { date: Date; createdAt: Date; id: { lt: string } }];
  const rest = rows.filter(r => r.date < a.date.lt || (r.date.getTime() === b.date.getTime() && r.createdAt < b.createdAt.lt) || (r.date.getTime() === c.date.getTime() && r.createdAt.getTime() === c.createdAt.getTime() && r.id < c.id.lt));
  assert.deepEqual(rest.map(r => r.id), [rows[300].id]);
  assert.equal(complaintPageWhere(null), null);
  assert.throws(() => complaintPageWhere("not-a-cursor"), /changed/);
  assert.match(route, /nextCursor: truncated && last \? complaintCursor\(last\) : null/);
  assert.match(route, /orderBy: \[\{ date: "desc" \}, \{ createdAt: "desc" \}, \{ id: "desc" \}\]/);
});

test("SKAI-1720: the desk offers a localized Load older complaints", () => {
  assert.match(readFileSync("src/components/operations/complaints-desk.tsx", "utf8"), /data-complaints-more/);
  for (const key of ["Load older complaints", "Loading older complaints…", "Older complaints could not be loaded. The queue shown is kept."]) assert.ok(arabicWorkflowUi[key] && urduWorkflowUi[key], key);
});
