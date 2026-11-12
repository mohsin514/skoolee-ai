import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { closeDropSession, getDropSession } from "@/lib/drop/service";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };

// SKAI-1847: the creator polls what the phone has sent (GET) and closes the handoff when done (DELETE).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    return Response.json({ success: true, data: await getDropSession(user, (await params).id) }, { headers: noStore });
  } catch (error) { return errorResponse(error, "[drop/sessions/id] GET failed"); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    return Response.json({ success: true, data: await closeDropSession(user, (await params).id) }, { headers: noStore });
  } catch (error) { return errorResponse(error, "[drop/sessions/id] DELETE failed"); }
}
