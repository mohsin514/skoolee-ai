import { NextRequest } from "next/server";
import { actOnItem, itemHistory, listItems, logItem } from "@/lib/front-desk/postal";
import { ownerCandidates } from "@/lib/front-desk/phone-calls";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
  canManageFrontDesk,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { idBody, jsonObjectBody } from "@/lib/validators/route-bodies";

// SKO-464 postal and courier register.
// GET   ?campusId=&view=active|mine|closed|all&direction=RECEIVE|DISPATCH&q=   → items with counts
// GET   ?history=<id>                                                     → one item's history
// GET   ?owners=1                                                         → front-office owners on this campus (campus admins, ADMIN, receptionists; G40)
// POST  {direction, date, toName, fromName?, courier?, referenceNo?, note?, ownerId?, idempotencyKey}
// PATCH {id, version, action: assign|dispatch|collect|deliver|correct, ...}
// DELETE is not supported: items and their history are kept.

const VIEWS = ["active", "mine", "closed", "all"];

async function frontDesk() {
  const user = await requireAuthUser();
  await assertModuleRead(user, "front-desk");
  if (!canManageFrontDesk(user)) throw new ApiError("Only front-desk staff and campus leaders can use the postal register.", 403);
  return user;
}

export async function GET(request: NextRequest) {
  try {
    const user = await frontDesk();
    const params = request.nextUrl.searchParams;
    const campusId = await resolveCampusId(user, params.get("campusId"));
    if (params.get("owners")) {
      const owners = await ownerCandidates(user, campusId);
      return Response.json({ success: true, data: owners });
    }
    const history = params.get("history");
    if (history) return Response.json({ success: true, data: await itemHistory(user, campusId, history) });
    const view = params.get("view") ?? "active";
    if (!VIEWS.includes(view)) throw new ApiError("Unknown view", 400);
    const direction = params.get("direction");
    if (direction && !["RECEIVE", "DISPATCH"].includes(direction)) throw new ApiError("Unknown direction", 400);
    return Response.json({ success: true, ...(await listItems(user, campusId, { view, direction, q: params.get("q") ?? "" })) });
  } catch (error) {
    return errorResponse(error, "[front-desk] postal GET failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await frontDesk();
    await assertPermission(user, "front-desk", "add");
    const body = await parseBody(request, jsonObjectBody);
    const campusId = await resolveCampusId(user, body.campusId);
    const { item, replayed } = await logItem(user, campusId, body);
    const { requestHash: _hash, idempotencyKey: _key, fileKey: _file, ...data } = item;
    return Response.json({ success: true, data, replayed }, { status: replayed ? 200 : 201 });
  } catch (error) {
    return errorResponse(error, "[front-desk] postal POST failed");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await frontDesk();
    await assertPermission(user, "front-desk", "edit");
    const body = await parseBody(request, idBody);
    const campusId = await resolveCampusId(user, body.campusId);
    const { requestHash: _hash, idempotencyKey: _key, fileKey: _file, ...data } = await actOnItem(user, campusId, body);
    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] postal PATCH failed");
  }
}

export async function DELETE() {
  return Response.json({ error: "Postal items and their history are kept. Correct the item with a reason instead." }, { status: 405 });
}
