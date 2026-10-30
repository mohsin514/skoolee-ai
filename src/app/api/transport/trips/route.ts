import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import * as transport from "@/lib/transport/service";
import { notifyException } from "@/lib/transport/notify";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const ok = (data: unknown, status = 200) => Response.json({ success: true, data }, { status, headers });

// SKO-437: dated trips. GET ?date= (list) | ?id= (trip) | ?id=&receiversFor= | ?view=staff.
// POST {action: publish | amend | depart | board | absent | stop | handover | exception | vehicle-check | close |
// emergency-close | resolve | owner}. Crew events carry occurredAt and clientEventId so an offline queue replays safely.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const p = request.nextUrl.searchParams;
    if (p.get("view") === "staff") return ok(await transport.coordinatorStaff(user));
    if (p.get("id") && p.get("receiversFor")) return ok(await transport.receivers(user, p.get("id")!, p.get("receiversFor")!));
    if (p.get("id")) return ok(await transport.tripDetail(user, p.get("id")!));
    return ok(await transport.listTrips(user, p.get("date")));
  } catch (error) { return errorResponse(error, "[transport/trips] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const base = (campusId: string) => ({ schoolId: user.schoolId, campusId, actorId: user.userId });
    switch (body.action) {
      case "publish": {
        const r = await transport.publishTrip(user, body);
        if (r.exceptions.length) await notifyException(base(r.campusId), r.ownerId);
        return ok({ id: r.id, expected: r.expected, exceptions: r.exceptions.length }, 201);
      }
      case "amend": {
        const r = await transport.amend(user, body);
        if (r.overflow) await notifyException(base(r.campusId), r.ownerId);
        return ok({ id: r.id, overflow: !!r.overflow });
      }
      case "depart": return ok(await transport.depart(user, body));
      case "board": {
        try { return ok(await transport.board(user, body)); }
        catch (error) {
          if (error instanceof transport.DoubleBoarding) {
            const ex = await transport.recordDoubleBoarding(user, String(body.tripId ?? ""), error);
            if (ex) await notifyException(base(ex.campusId), ex.ownerId);
            return Response.json({ success: false, error: error.message, code: "DOUBLE_BOARDING" }, { status: 409, headers });
          }
          throw error;
        }
      }
      case "absent": return ok(await transport.markAbsent(user, body));
      case "stop": return ok(await transport.stopArrived(user, body));
      case "handover": return ok(await transport.handover(user, body));
      case "exception": {
        const r = await transport.reportException(user, body);
        if (!r.repeated) await notifyException(base(r.campusId), r.coordinatorId);
        return ok({ exceptionId: r.exceptionId, repeated: r.repeated }, r.repeated ? 200 : 201);
      }
      case "vehicle-check": return ok(await transport.vehicleCheck(user, body));
      case "close": return ok(await transport.closeTrip(user, body));
      case "emergency-close": return ok(await transport.emergencyClose(user, body));
      case "resolve": return ok(await transport.resolveException(user, body));
      case "owner": {
        const r = await transport.assignExceptionOwner(user, body);
        await notifyException(base(r.campusId), r.ownerId);
        return ok({ id: r.id });
      }
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) { return errorResponse(error, "[transport/trips] POST failed"); }
}
