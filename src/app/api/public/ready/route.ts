import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { buildId, checkWithin } from "@/lib/ops/readiness";

// ─────────────────────────────────────────────────────────────────
// SKAI-733: readiness probe for deploy checks and uptime monitors.
//
// /api/public/health answers "can the browser reach the server?" and
// never touches the database, so it stays 200 while the database is
// down. This answers "can this deployment serve school data?": one
// bounded round trip to the database, plus the build it is running.
// No tenant, user or configuration detail is returned.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } as const;

export async function GET() {
  const started = Date.now();
  const database = await checkWithin(() => runUnscoped("readiness probe: database round trip", () => prisma.$queryRaw`SELECT 1`));
  const body = { ok: database, checks: { database: database ? "up" : "down" }, build: buildId(), latencyMs: Date.now() - started };
  return Response.json(body, { status: database ? 200 : 503, headers: NO_STORE });
}
