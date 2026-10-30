import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import * as care from "@/lib/care/service";
import { notifyConcern, notifyDisclosureReview, notifyEmergency, notifyOwner, notifyReleased } from "@/lib/care/notify";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const ok = (data: unknown, status = 200) => Response.json({ success: true, data }, { status, headers });

// SKO-439: confidential clinic and safeguarding. GET ?view=me | students&q= | summary&studentId= |
// settings | my-reports | messages | staff | clinic[&studentId=] | safeguarding[&concernId=] | oversight&domain=.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const p = request.nextUrl.searchParams, view = p.get("view") ?? "me";
    switch (view) {
      case "me": return ok(await care.workspaces(user));
      case "students": return ok(await care.findStudents(user, p.get("q") ?? ""));
      case "summary": return ok(await care.careSummary(user, p.get("studentId") ?? ""));
      case "settings": return ok(await care.settings(user, p.get("campusId")));
      case "my-reports": return ok(await care.myReports(user));
      case "messages": return ok(await care.messagesForMe(user));
      case "staff": return ok(await care.disclosureStaff(user));
      case "clinic": return ok(p.get("studentId") ? await care.clinicRecord(user, p.get("studentId")!) : await care.clinicQueue(user));
      case "safeguarding": return ok(p.get("concernId") ? await care.concernDetail(user, p.get("concernId")!) : p.get("studentId") ? await care.concernsForStudent(user, p.get("studentId")!) : await care.safeguardingQueue(user));
      case "oversight": return ok(await care.oversight(user, p.get("domain")));
      default: throw new ApiError("Unknown view", 400);
    }
  } catch (error) { return errorResponse(error, "[care] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const base = (campusId: string) => ({ schoolId: user.schoolId, campusId, actorId: user.userId });
    switch (body.action) {
      case "configure": return ok({ id: (await care.configure(user, body)).id });
      case "add-member": return ok({ id: (await care.addMember(user, body)).id }, 201);
      case "revoke-member": return ok(await care.revokeMember(user, String(body.id ?? "")));
      case "visit": return ok(await care.recordVisit(user, body), 201);
      case "care-plan": return ok(await care.saveCarePlan(user, body));
      case "instruction": return ok(await care.addInstruction(user, body), 201);
      case "end-instruction": return ok(await care.endInstruction(user, String(body.id ?? "")));
      case "dose": return ok(await care.recordDose(user, body), 201);
      case "concern": {
        const r = await care.reportConcern(user, body);
        if (r.created) await notifyConcern(base(r.campusId));
        return ok({ reference: r.reference, createdAt: r.createdAt }, r.created ? 201 : 200);
      }
      case "assign": {
        const r = await care.assignOwner(user, body);
        if (r.ownerId && r.ownerId !== user.userId) await notifyOwner(base(r.campusId), r.ownerId);
        return ok({ id: r.id });
      }
      case "escalate": return ok({ id: (await care.escalate(user, body)).id });
      case "note": return ok({ id: (await care.addNote(user, body)).id });
      case "implicated": return ok({ id: (await care.setImplicated(user, body)).id });
      case "close": return ok({ id: (await care.closeConcern(user, body)).id });
      case "propose-disclosure": {
        const r = await care.proposeDisclosure(user, body);
        await notifyDisclosureReview(base(r.campusId));
        return ok({ id: r.id }, 201);
      }
      case "review-disclosure": return ok(await care.reviewDisclosure(user, body));
      case "release-disclosure": {
        const r = await care.releaseDisclosure(user, String(body.id ?? ""));
        await notifyReleased(base(r.campusId), r.recipientType, r.recipientUserId);
        return ok({ id: r.id, status: "RELEASED" });
      }
      case "emergency": {
        const r = await care.openEmergency(user, body);
        await notifyEmergency(base(r.campusId), r.domain);
        return ok({ id: r.id, expiresAt: r.expiresAt }, 201);
      }
      case "revoke-emergency": return ok(await care.revokeEmergency(user, String(body.id ?? "")));
      case "review-emergency": return ok(await care.reviewEmergency(user, body));
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) { return errorResponse(error, "[care] POST failed"); }
}
