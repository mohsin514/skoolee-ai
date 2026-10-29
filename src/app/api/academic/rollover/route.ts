import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { approvePlan, decide, executePlan, loadRollover, preparePlan, reverseDecision, setClassCapacity, setClassMap } from "@/lib/academic/rollover";
import { readJsonBody } from "@/lib/api/validate";

// SKO-404: reviewed year-end rollover. GET shows readiness, the versioned plan,
// every learner's decision and the reconciliation; POST actions change it.

const id = z.string().min(1).max(100);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), sourceYear: z.number().int(), effectiveDate: z.string() }),
  z.object({ action: z.literal("map"), planId: id, version: z.number().int(), sourceClassId: id, promote: id.nullable().optional(), retain: id.nullable().optional() }),
  z.object({ action: z.literal("decide"), planId: id, version: z.number().int(), rows: z.array(z.object({ studentId: id, decision: z.string(), destinationClassId: id.nullable().optional(), reason: z.string().max(500).nullable().optional() })).min(1).max(500) }),
  z.object({ action: z.literal("capacity"), classId: id, capacity: z.number().int().nullable() }),
  z.object({ action: z.literal("approve"), planId: id, version: z.number().int() }),
  z.object({ action: z.literal("execute"), planId: id, version: z.number().int(), limit: z.number().int().min(1).max(200).optional() }),
  z.object({ action: z.literal("reverse"), planId: id, studentId: id, reason: z.string().max(500), effectiveDate: z.string() }),
]);

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const params = req.nextUrl.searchParams;
    const campusId = await resolveCampusId(user, params.get("campusId"));
    const year = Number(params.get("sourceYear"));
    return Response.json({ success: true, data: await loadRollover(user, campusId, Number.isInteger(year) && year > 0 ? year : null) });
  } catch (error) {
    return errorResponse(error, "[academic/rollover] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const raw = (await readJsonBody(req)) as Record<string, any> | null;
    const parsed = Body.safeParse(raw);
    if (!parsed.success) throw new ApiError("Invalid rollover request", 400);
    const campusId = await resolveCampusId(user, raw?.campusId);
    const body = parsed.data;
    const data =
      body.action === "prepare" ? await preparePlan(user, campusId, body.sourceYear, body.effectiveDate)
      : body.action === "map" ? await setClassMap(user, body.planId, body.version, body.sourceClassId, { promote: body.promote, retain: body.retain })
      : body.action === "decide" ? await decide(user, body.planId, body.version, body.rows)
      : body.action === "capacity" ? await setClassCapacity(user, campusId, body.classId, body.capacity)
      : body.action === "approve" ? await approvePlan(user, campusId, body.planId, body.version)
      : body.action === "execute" ? await executePlan(user, body.planId, body.version, body.limit)
      : await reverseDecision(user, body.planId, body.studentId, body.reason, body.effectiveDate);
    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[academic/rollover] POST failed");
  }
}
