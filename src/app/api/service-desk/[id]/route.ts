import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { privateDownloadResponse } from "@/lib/storage/private-download";
import { actOnRequest, attachmentFor, requestView } from "@/lib/service-desk/service";
import { tell } from "@/lib/service-desk/notify";

export const runtime = "nodejs";

// SKO-441: one request. GET → the view for this person (requesters never see internal entries);
// ?attachment=<eventId> streams a photo the person may see. POST {action, knownVersion, ...}.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    const { id } = await params;
    const attachment = request.nextUrl.searchParams.get("attachment");
    if (attachment) { const file = await attachmentFor(user, id, attachment); return privateDownloadResponse(file.storageKey, file.fileName, { contentType: file.contentType, inlineImage: true }); }
    return Response.json({ success: true, data: await requestView(user, id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[service-desk/id] GET failed"); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const result = await actOnRequest(user, id, body);
    if (result.notify) await tell(result.notify.event, { schoolId: user.schoolId, campusId: result.campusId, actorId: user.userId }, result.notify.recipients, result.reference);
    return Response.json({ success: true, data: { id: result.id, version: result.version } });
  } catch (error) { return errorResponse(error, "[service-desk/id] POST failed"); }
}
