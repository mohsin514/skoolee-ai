import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { createEntry, createShare, editReflection, eligibleEvidence, guardianShares, portfolio, removeEntry, reviewEntry, revokeShare, sharedCollection, teachingLearners } from "@/lib/portfolio/service";

export const runtime = "nodejs";

// SKO-427: learning portfolio. GET ?studentId (learner: own; teacher: class learner) · ?view=evidence ·
// guardians: ?view=shares or ?share=<id>. POST {action: entry | reflect | review | remove | share | revoke}.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const p = request.nextUrl.searchParams, headers = { "Cache-Control": "private, no-store" };
    const studentId = p.get("studentId");
    if (p.get("share")) return Response.json({ success: true, data: await sharedCollection(user, p.get("share")!) }, { headers });
    if (p.get("view") === "shares") return Response.json({ success: true, data: await guardianShares(user, studentId) }, { headers });
    if (p.get("view") === "learners") return Response.json({ success: true, data: await teachingLearners(user) }, { headers });
    if (p.get("view") === "evidence") return Response.json({ success: true, data: await eligibleEvidence(user, studentId) }, { headers });
    return Response.json({ success: true, data: await portfolio(user, studentId) }, { headers });
  } catch (error) { return errorResponse(error, "[portfolio] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const run = {
      entry: () => createEntry(user, body), reflect: () => editReflection(user, body), review: () => reviewEntry(user, body),
      remove: () => removeEntry(user, String(body.entryId ?? "")), share: () => createShare(user, body), revoke: () => revokeShare(user, String(body.shareId ?? "")),
    }[String(body.action) as "entry"];
    if (!run) throw new ApiError("Unknown action", 400);
    const row = await run() as { id: string; version?: number; status?: string };
    return Response.json({ success: true, data: { id: row.id, version: row.version ?? null, status: row.status ?? null } }, { status: body.action === "entry" || body.action === "share" ? 201 : 200 });
  } catch (error) { return errorResponse(error, "[portfolio] POST failed"); }
}
