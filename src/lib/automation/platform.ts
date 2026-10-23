import { createHash } from "node:crypto";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { SchoolAiError } from "@/lib/school-ai/access";
import type { AutomaticAction } from "./schema";
export async function executePlatformAction(user: AuthUser, key: string, action: AutomaticAction) {
 if (user.role !== "APP_OWNER") throw new SchoolAiError("Platform administration is restricted to the application owner.", 403);
 return runUnscoped("authorized automatic platform administration", async () => {
  if (action.tool === "platform.inspect") {
   const schools = await prisma.school.findMany({ where: action.data.search ? { name: { contains: action.data.search, mode: "insensitive" } } : {}, select: { id: true, name: true, city: true, website: true, status: true, plan: true, _count: { select: { campuses: true } } }, orderBy: { name: "asc" }, take: 51 });
   return { operation: action.tool, schools: schools.slice(0,50), truncated: schools.length > 50 };
  }
  if (action.tool !== "platform.update_institution") throw new SchoolAiError("Unsupported platform action.", 422);
  const fingerprint = createHash("sha256").update(JSON.stringify(action)).digest("hex");
  return prisma.$transaction(async tx => {
   await tx.$queryRaw`SELECT id FROM schools WHERE id=${user.schoolId} FOR UPDATE`;
   const previous = await tx.schoolAiRequest.findFirst({ where: { schoolId: user.schoolId, actorId: user.userId, feature: "AUTOMATIC_ACTION_V1", idempotencyKey: key } });
   if (previous) { if (previous.requestHash !== fingerprint) throw new SchoolAiError("This action has changed.", 409); return JSON.parse(previous.reply!); }
   const { schoolId, ...data } = action.data;
   const school = await tx.school.findUnique({ where: { id: schoolId }, select: { name: true, city: true, website: true } });
   if (!school) throw new SchoolAiError("Institution not found.", 404);
   await tx.school.update({ where: { id: schoolId }, data });
   const receipt = { id: schoolId, operation: action.tool, updatedFields: Object.keys(data) };
   await tx.auditLog.create({ data: { schoolId, userId: user.userId, tableName: "school", recordId: schoolId, oldValue: school, newValue: { ...data, source: "AUTOMATIC_PLATFORM_REQUEST" } } });
   await tx.schoolAiRequest.create({ data: { schoolId: user.schoolId, actorId: user.userId, actorRole: user.role, feature: "AUTOMATIC_ACTION_V1", idempotencyKey: key, requestHash: fingerprint, status: "COMPLETED", completedAt: new Date(), reply: JSON.stringify(receipt) } });
   return receipt;
  });
 });
}
