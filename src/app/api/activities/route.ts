import { NextRequest } from "next/server";
import { ApiError, requireAuthUser } from "@/lib/api/scope";
import { created, failFrom, ok } from "@/lib/api/envelope";
import { addSession, cancelActivity, cancelPlace, createActivity, markAttendance, recordFee, requestRefund, roster, staffActivities } from "@/lib/activities/service";
import { notifyOfferedPlaces, sendActivityNotice } from "@/lib/activities/offer-notice";

export const runtime = "nodejs";

// SKO-440: coordinator side. GET → activities (or ?id= roster) · POST {action: create | session | attend |
// fee | cancel-place | refund | cancel}.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const id = request.nextUrl.searchParams.get("id"), headers = { "Cache-Control": "private, no-store" };
    return ok(id ? await roster(user, id) : await staffActivities(user), { headers });
  } catch (error) { return failFrom(error, "[activities] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (user.role === "PARENT" || user.role === "STUDENT") throw new ApiError("Not found", 404);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    switch (body.action) {
      case "create": return created({ id: (await createActivity(user, body)).id });
      case "session": { const s = await addSession(user, body); return ok({ id: s.id, replayed: s.replayed }, { status: s.replayed ? 200 : 201 }); }
      case "attend": return ok({ id: (await markAttendance(user, body)).id });
      case "fee": return ok(await recordFee(user, body));
      case "cancel-place": { const r = await cancelPlace(user, body); const notice = await notifyOfferedPlaces(user, r.offered); return ok({ ...r, noticeWithheld: notice.withheld }); }
      case "refund": return ok(await requestRefund(user, body));
      case "cancel": {
        const r = await cancelActivity(user, String(body.activityId ?? ""));
        const notice = await sendActivityNotice(user, "ACTIVITY_CANCELLED", r.studentIds, String(body.activityId ?? ""), r.studentIds.length);
        return ok({ cancelled: r.cancelled, noticeWithheld: notice.withheld });
      }
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) { return failFrom(error, "[activities] POST failed"); }
}
