import { NextRequest } from "next/server";
import { actOnCallback, callbackHistory, listCalls, logCall, ownerCandidates } from "@/lib/front-desk/phone-calls";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
  canManageFrontDesk,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

// SKO-465 reception call log and callback queue.
// GET   ?campusId=&view=open|mine|overdue|unassigned|all&direction=IN|OUT&q=   → calls with their callbacks
// GET   ?history=<callbackId>                                             → one callback's history
// GET   ?owners=1                                                         → front-office owners on this campus (campus admins, ADMIN, receptionists; G40)
// POST  {name, phone, direction, date, purpose, note?, sensitive?, callbackDue?, callbackOwnerId?, idempotencyKey}
// PATCH {id (callback), version, action: reassign|reschedule|attempt|complete, ...}
// DELETE is not supported: calls and callback history are kept.

const VIEWS = ["open", "mine", "overdue", "unassigned", "all"];

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "front-desk");
    const params = request.nextUrl.searchParams;
    const campusId = await resolveCampusId(user, params.get("campusId"));

    if (params.get("owners")) {
      if (!canManageFrontDesk(user)) throw new ApiError("Forbidden", 403);
      const owners = await ownerCandidates(user, campusId);
      return Response.json({ success: true, data: owners });
    }
    const history = params.get("history");
    if (history) return Response.json({ success: true, data: await callbackHistory(user, campusId, history) });

    // The log is front-desk work; other readers of the module only reach callbacks they own.
    const view = params.get("view") ?? "open";
    if (!VIEWS.includes(view)) throw new ApiError("Unknown view", 400);
    if (!canManageFrontDesk(user) && view !== "mine") throw new ApiError("Forbidden", 403);
    const direction = params.get("direction");
    if (direction && !["IN", "OUT"].includes(direction)) throw new ApiError("Unknown direction", 400);
    const result = await listCalls(user, campusId, { view, q: params.get("q") ?? "", direction });
    return Response.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error, "[front-desk] phone-calls GET failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFrontDesk(user)) throw new ApiError("Only front-desk staff and campus leaders can log calls.", 403);
    await assertPermission(user, "front-desk", "add");
    const body = await request.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const { call, replayed } = await logCall(user, campusId, body);
    const { requestHash: _hash, idempotencyKey: _key, ...data } = call;
    return Response.json({ success: true, data, replayed }, { status: replayed ? 200 : 201 });
  } catch (error) {
    return errorResponse(error, "[front-desk] phone-calls POST failed");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "front-desk");
    await assertPermission(user, "front-desk", "edit");
    const body = await request.json();
    if (!body.id) throw new ApiError("id is required", 400);
    const campusId = await resolveCampusId(user, body.campusId);
    const { outcome: _outcome, ...data } = await actOnCallback(user, campusId, body);
    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] phone-calls PATCH failed");
  }
}

export async function DELETE() {
  return Response.json({ error: "Calls and their callback history are kept. Complete the callback with an outcome instead." }, { status: 405 });
}
