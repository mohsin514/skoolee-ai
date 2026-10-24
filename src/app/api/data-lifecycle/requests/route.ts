import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { createLifecycleRequest, reviewLifecycleRequest } from "@/lib/data-lifecycle/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const request = await createLifecycleRequest(user, await req.json());
    return Response.json({ success: true, request: { id: request.id, kind: request.kind, status: request.status, version: request.version, plan: request.plan } }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[data-lifecycle] request failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const request = await reviewLifecycleRequest(user, await req.json());
    return Response.json({ success: true, request: { id: request.id, kind: request.kind, status: request.status, version: request.version, receipt: request.receipt } });
  } catch (error) {
    return errorResponse(error, "[data-lifecycle] review failed");
  }
}
