import { requireAuthUser, errorResponse } from "@/lib/api/scope";
import { createDraftTimetableSlot, DraftTimetableSlotError } from "@/lib/timetable/draft-slot";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    const { id } = await params;
    if (Number(request.headers.get("content-length") || 0) > 8192) throw new DraftTimetableSlotError("The period request is too large.", 413, "TIMETABLE_SLOT_INVALID");
    const text = await request.text();
    if (text.length > 8192) throw new DraftTimetableSlotError("The period request is too large.", 413, "TIMETABLE_SLOT_INVALID");
    let input: unknown;
    try { input = JSON.parse(text); } catch { throw new DraftTimetableSlotError("Enter valid period details.", 400, "TIMETABLE_SLOT_INVALID"); }
    const data = await createDraftTimetableSlot(user, id, input);
    return Response.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof DraftTimetableSlotError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    return errorResponse(error, "[timetable/id/slots] POST failed");
  }
}
