import { isCampusOperator } from "@/lib/auth/institution";
import { executePlatformAction } from "./platform";
import { createAutomaticStudents } from "./students";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { assertPlanCapacity } from "@/lib/billing/entitlements";
import { assertWorkspacePermission, SchoolAiError } from "@/lib/school-ai/access";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { logCall } from "@/lib/front-desk/phone-calls";
import type { ToolAction } from "./tool-schemas";
export async function executeRoleAction(user: AuthUser, campusId: string | null, key: string, action: ToolAction): Promise<Record<string, unknown>> {
 if (action.tool === "platform.inspect" || action.tool === "platform.update_institution") return executePlatformAction(user, key, action);
 if (action.tool === "students.create") return createAutomaticStudents(user, campusId, key, action.data);
 if (action.tool === "front_desk.log_call") {
  if ((!isCampusOperator(user) && user.role !== "RECEPTIONIST") || !campusId || campusId !== user.campusId) throw new SchoolAiError("Call logging belongs to this campus's front desk.", 403);
  await assertWorkspacePermission(user, "front-desk", "add");
  const result = await logCall(user, campusId, { ...action.data, idempotencyKey: createHash("sha256").update(key).digest("hex") });
  return { id: result.call.id, operation: action.tool, saved: true };
 }
 return schoolAiTransaction(user, async tx => {
  // This lock and the receipt commit make retries safe even after a lost response.
  await tx.$queryRaw`SELECT id FROM schools WHERE id=${user.schoolId} FOR UPDATE`;
  const fingerprint = createHash("sha256").update(JSON.stringify(action)).digest("hex");
  const previous = await tx.schoolAiRequest.findFirst({ where: { schoolId: user.schoolId, actorId: user.userId, feature: "AUTOMATIC_ACTION_V1", idempotencyKey: key } });
  if (previous) { if (previous.requestHash !== fingerprint) throw new SchoolAiError("The saved action changed. Start a new request.", 409); return JSON.parse(previous.reply!) as Record<string, unknown>; }
  const ids: string[] = [];
  let receipt: Record<string, unknown>;
  if (action.tool === "profile.update") {
   if (user.role !== "TEACHER" && ["qualification", "specialization", "subjectSpecialties", "experience"].some(field => field in action.data)) throw new SchoolAiError("Professional teaching fields belong to teachers.", 403);
   await tx.user.update({ where: { id: user.userId }, data: action.data });
   receipt = { id: user.userId, operation: action.tool, updatedFields: Object.keys(action.data) };
  } else if (action.tool === "campus.create") {
   if (user.role !== "SUPER_ADMIN") throw new SchoolAiError("Only the group administrator creates campuses.", 403);
   await assertPlanCapacity({ schoolId: user.schoolId, metric: "campuses", increment: 1, client: tx });
   if (await tx.campus.findFirst({ where: { schoolId: user.schoolId, name: { equals: action.data.name, mode: "insensitive" }, archivedAt: null } })) throw new SchoolAiError("A campus with that name already exists. Choose a distinct name.", 409);
   const campus = await tx.campus.create({ data: { ...action.data, schoolId: user.schoolId, regId: `C-${createHash("sha256").update(key).digest("hex").slice(0,24)}` } });
   receipt = { id: campus.id, operation: action.tool, createdCount: 1, delegationRequired: true };
  } else if (action.tool === "library.create_books") {
   if ((!isCampusOperator(user) && user.role !== "LIBRARIAN") || !campusId || campusId !== user.campusId) throw new SchoolAiError("Catalogue creation belongs to this campus's librarian.", 403);
   await assertWorkspacePermission(user, "library", "add");
   for (const book of action.data.books) {
    if (book.isbn && await tx.book.findFirst({ where: { schoolId: user.schoolId, campusId, isbn: book.isbn } })) throw new SchoolAiError("An ISBN already exists in the catalogue. Add copies to that title instead.", 409);
    const saved = await tx.book.create({ data: { ...book, schoolId: user.schoolId, campusId, copiesAvailable: book.copiesTotal } }); ids.push(saved.id);
   }
   receipt = { id: ids[0], ids, operation: action.tool, createdCount: ids.length };
  } else {
   // A personal plan is saved with the actor-owned receipt, never a school workflow.
   receipt = { id: key, operation: action.tool, plan: action.data, visibility: "PRIVATE", saved: true };
  }
  await tx.schoolAiRequest.create({ data: { schoolId: user.schoolId, campusId, actorId: user.userId, actorRole: user.role, feature: "AUTOMATIC_ACTION_V1", idempotencyKey: key, requestHash: fingerprint, status: "COMPLETED", completedAt: new Date(), reply: JSON.stringify(receipt) } });
  await tx.auditLog.create({ data: { schoolId: user.schoolId, userId: user.userId, tableName: "automatic_action", recordId: key, newValue: { operation: action.tool, ids, actorRole: user.role } as Prisma.InputJsonValue } });
  return receipt;
 });
}
