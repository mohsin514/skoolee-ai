import { ApiError, requirePlatformOwner } from "@/lib/api/scope";
import { failFrom, ok } from "@/lib/api/envelope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { applyPolicy, recordRun, report, revertPolicy } from "@/lib/capacity/service";
import { resetPeaks } from "@/lib/capacity/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

// SKO-451: platform capacity for operators. GET → measured telemetry, queue pressure, policy and recorded runs.
// POST {action: apply | revert | reset-peaks | record-run}. Every change is scoped, audited and reversible.
export async function GET() {
  try {
    await requirePlatformOwner();
    return ok(await report(), { headers: noStore });
  } catch (error) { return failFrom(error, "[owner/capacity] GET failed"); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const owner = await requirePlatformOwner();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    switch (body.action) {
      case "apply": return ok(await applyPolicy(owner.userId, body), { status: 201, headers: noStore });
      case "revert": return ok(await revertPolicy(owner.userId, body), { headers: noStore });
      // Start of a measured run: background peaks are counted from here.
      case "reset-peaks": resetPeaks(); return ok({ reset: true }, { headers: noStore });
      case "record-run": return ok(await recordRun(owner.userId, body), { status: 201, headers: noStore });
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) { return failFrom(error, "[owner/capacity] POST failed"); }
}
