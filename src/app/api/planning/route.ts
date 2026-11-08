import { z } from "zod";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { decideHandoff, duplicateScenario, planningOverview, proposeHandoff, refreshScenario, saveScenario, takeBaseline } from "@/lib/planning/service";

// SKO-453: capacity and staffing scenarios. Planning tables only; live records are never changed.
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try { return Response.json({ success: true, data: await planningOverview(await requireAuthUser(), new URL(request.url).searchParams.get("campusId")) }, { headers }); }
  catch (error) { return errorResponse(error, "[planning] GET failed"); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    const body = z.object({ action: z.enum(["baseline", "save", "duplicate", "refresh", "handoff", "decide"]), id: z.string().min(1).max(120).optional(), version: z.number().int().positive().optional(), data: z.unknown().optional() }).strict().parse(await request.json().catch(() => ({})));
    const id = body.id ?? "";
    const run = (): Promise<unknown> => {
      switch (body.action) {
        case "baseline": return takeBaseline(user, body.data);
        case "save": return saveScenario(user, body.data, body.id, body.version);
        case "duplicate": return duplicateScenario(user, id);
        case "refresh": return refreshScenario(user, id);
        case "handoff": return proposeHandoff(user, id, body.data);
        default: return decideHandoff(user, id, body.data);
      }
    };
    return Response.json({ success: true, data: await run() }, { headers });
  } catch (error) { return errorResponse(error, "[planning] POST failed"); }
}
