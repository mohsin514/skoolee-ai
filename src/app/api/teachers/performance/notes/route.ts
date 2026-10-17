import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { addNote, listNotes } from "@/lib/staff/teaching-evidence";

// SKO-461: append-only support actions (leaders) and responses (the teacher).
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const sp = req.nextUrl.searchParams;
    const teacherId = sp.get("teacherId"), year = Number(sp.get("academicYear"));
    if (!teacherId || !Number.isInteger(year)) throw new ApiError("teacherId and academicYear are required", 400);
    return Response.json({ success: true, data: await listNotes(user, await resolveCampusId(user, sp.get("campusId")), teacherId, year) });
  } catch (error) {
    return errorResponse(error, "[teachers/performance/notes] GET failed");
  }
}

const Note = z.object({ teacherId: z.string().min(1).max(100), academicYear: z.number().int().min(2000).max(2200), body: z.string().max(2000), campusId: z.string().optional() });

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const parsed = Note.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError("Invalid note", 400);
    const campusId = await resolveCampusId(user, parsed.data.campusId);
    return Response.json({ success: true, data: await addNote(user, campusId, parsed.data.teacherId, parsed.data.academicYear, parsed.data.body) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[teachers/performance/notes] POST failed");
  }
}
