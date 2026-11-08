import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CLOSED_REQUEST_PAGE, closedRequestCursor, closedRequestWhere } from "@/lib/purchasing/service";
import { arabicDesignSystemUi } from "@/lib/locale/design-system-ui-messages";

const src = readFileSync("src/lib/purchasing/service.ts", "utf8");

test("SKAI-1779: closed request 101 is reachable by cursor, same-timestamp ties included", () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({ id: `r${String(999 - i).padStart(3, "0")}`, createdAt: new Date(Date.UTC(2026, 0, 1) - Math.floor(i / 3) * 1000) }));
  const where = closedRequestWhere(closedRequestCursor(rows)) as { OR: [{ createdAt: { lt: Date } }, { createdAt: Date; id: { lt: string } }] };
  const rest = rows.filter(r => r.createdAt < where.OR[0].createdAt.lt || (r.createdAt.getTime() === where.OR[1].createdAt.getTime() && r.id < where.OR[1].id.lt));
  assert.deepEqual(rest.map(r => r.id), [rows[100].id]);
  assert.equal(closedRequestCursor(rows.slice(0, CLOSED_REQUEST_PAGE)), null);
  assert.throws(() => closedRequestWhere("Zm9v"), /changed/, "forged cursors fail closed");
});

test("SKAI-1779: open requests are never capped, so counts and filters cover them all; every page stays campus-scoped", () => {
  const overview = src.slice(src.indexOf("export async function purchasingOverview"));
  assert.match(overview, /purchaseRequest\.findMany\(\{ where: \{ schoolId: user\.schoolId, campusId, status: \{ notIn: CLOSED_REQUEST \} \}, orderBy: requestOrder \}\)/);
  assert.doesNotMatch(overview.slice(0, 2500), /purchaseRequest\.findMany\([^\n]*take: 100\b/);
  const next = src.slice(src.indexOf("export async function closedRequests"), src.indexOf("export async function purchasingOverview"));
  assert.match(next, /assert\(STAFF\.includes\(user\.role\)/);
  assert.match(next, /where: \{ schoolId: user\.schoolId, campusId, status: \{ in: CLOSED_REQUEST \}, \.\.\.closedRequestWhere\(cursor\) \}/);
  assert.match(readFileSync("src/components/purchasing/purchasing-panel.tsx", "utf8"), /data-purchasing-more/);
  for (const key of ["Load older requests", "Loading older requests…", "Older requests could not be loaded. The list shown is kept."]) assert.ok(arabicDesignSystemUi[key], key);
});
