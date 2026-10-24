import { z } from "zod";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { addAction, addNote, completeAction, decideMentoring, designateCounsellor, exportPlan, pathwayOverview, readNotes, recordAlumni, requestAppointment, requestMentoring, revokeCounsellor, reviewAlumni, saveGoal, saveOpportunity, updateAppointment, verifyOpportunity } from "@/lib/pathways/service";

// SKO-455: student pathway plans, counselling appointments and restricted notes, opportunities,
// alumni consent and school-mediated mentoring.
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser();
    const params = new URL(request.url).searchParams;
    const studentId = params.get("studentId") ?? "";
    const view = params.get("view");
    const data = view === "export" ? await exportPlan(user, studentId) : view === "notes" ? await readNotes(user, studentId) : await pathwayOverview(user);
    return Response.json({ success: true, data }, { headers });
  } catch (error) { return errorResponse(error, "[pathways] GET failed"); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    const body = z.object({ action: z.enum(["designate", "revoke", "goal", "action", "complete", "opportunity", "verify", "appointment", "appointment-status", "note", "alumni", "alumni-review", "mentoring", "decide-mentoring"]), id: z.string().min(1).max(120).optional(), data: z.unknown().optional() }).strict().parse(await request.json().catch(() => ({})));
    const id = body.id ?? "";
    const run = (): Promise<unknown> => {
      switch (body.action) {
        case "designate": return designateCounsellor(user, body.data);
        case "revoke": return revokeCounsellor(user, id);
        case "goal": return saveGoal(user, body.data, body.id);
        case "action": return addAction(user, body.data);
        case "complete": return completeAction(user, id);
        case "opportunity": return saveOpportunity(user, body.data);
        case "verify": return verifyOpportunity(user, id, body.data);
        case "appointment": return requestAppointment(user, body.data);
        case "appointment-status": return updateAppointment(user, id, body.data);
        case "note": return addNote(user, body.data);
        case "alumni": return recordAlumni(user, body.data);
        case "alumni-review": return reviewAlumni(user, id, body.data);
        case "mentoring": return requestMentoring(user, body.data);
        default: return decideMentoring(user, id, body.data);
      }
    };
    return Response.json({ success: true, data: await run() }, { headers });
  } catch (error) { return errorResponse(error, "[pathways] POST failed"); }
}
