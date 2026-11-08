import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { approveDigest, dispatchDigest, editEntry, getDigest, scheduleDigest } from "@/lib/family/digests";
import { notifyDigestDeliveries } from "@/lib/family/digest-notify";

// SKO-423: one digest. GET · PATCH {action: edit|approve|schedule|send, knownVersion, ...}
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await requireAuthUser(); const { id } = await params; return Response.json({ success: true, data: await getDigest(user, id) }); }
  catch (error) { return errorResponse(error, "[digests/id] GET failed"); }
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === "edit") return Response.json({ success: true, data: await editEntry(user, id, body) });
    if (body.action === "approve") return Response.json({ success: true, data: await approveDigest(user, id, body) });
    if (body.action === "schedule") return Response.json({ success: true, data: await scheduleDigest(user, id, body) });
    if (body.action === "send") {
      const digest = await getDigest(user, id);
      if (Number(body.knownVersion) !== digest.version) throw new ApiError("This digest changed since you opened it. Review the new version.", 409);
      const result = await dispatchDigest(user.schoolId, id);
      await notifyDigestDeliveries(user.schoolId, digest.campusId, result.created);
      return Response.json({ success: true, data: { delivered: result.created.length, blocked: result.blocked } });
    }
    throw new ApiError("Unknown action", 400);
  } catch (error) { return errorResponse(error, "[digests/id] PATCH failed"); }
}
