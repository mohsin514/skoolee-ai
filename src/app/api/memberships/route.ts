import { prisma } from "@/lib/db/prisma";
import { requireAuthUser, errorResponse, ApiError } from "@/lib/api/scope";
import { INVITABLE_ROLES } from "@/lib/membership-access";
import { z } from "zod";

export async function GET() {
  try {
    const user = await requireAuthUser();
    const canManage = user.isInstitutionOwner || user.canManageMemberships;
    const scope = user.isInstitutionOwner ? {} : { campusId: user.campusId };
    const members = await prisma.user.findMany({ where: { schoolId: user.schoolId, ...(canManage ? scope : { id: user.userId }) },
      select: { id: true, fullName: true, email: true, role: true, campusId: true, isActive: true, isInstitutionOwner: true, canPurchaseSubscription: true, canManageMemberships: true, accessVersion: true } });
    const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true, registrationKind: true } });
    const campuses = await prisma.campus.findMany({ where: { schoolId: user.schoolId, ...(user.isInstitutionOwner ? {} : { id: user.campusId || "" }) }, select: { id: true, name: true } });
    return Response.json({ members, school, campuses, canManage: Boolean(canManage), isOwner: Boolean(user.isInstitutionOwner), currentUserId: user.userId });
  } catch (error) { return errorResponse(error); }
}
const changeSchema = z.object({ userId: z.string().uuid(), role: z.enum(INVITABLE_ROLES), campusId: z.string().uuid(),
  canPurchaseSubscription: z.boolean(), canManageMemberships: z.boolean(), isActive: z.boolean(),
  expectedVersion: z.number().int().min(0), reviewed: z.literal(true) });
export async function PUT(req: Request) {
  try {
    const actor = await requireAuthUser();
    if (!actor.isInstitutionOwner && !actor.canManageMemberships) throw new ApiError("Membership management is not delegated", 403);
    const parsed = changeSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("Review the role, campus and access change before confirming", 400);
    const input = parsed.data;
    const target = await prisma.user.findFirst({ where: { id: input.userId, schoolId: actor.schoolId } });
    if (!target || target.isInstitutionOwner || target.role === "APP_OWNER" || target.id === actor.userId) throw new ApiError("This membership cannot be changed here", 403);
    if (!actor.isInstitutionOwner && (target.campusId !== actor.campusId || input.campusId !== actor.campusId || input.canPurchaseSubscription || input.canManageMemberships || target.canPurchaseSubscription || target.canManageMemberships || input.role === "CAMPUS_ADMIN")) throw new ApiError("An owner must review this authority change", 403);
    if (["PARENT", "STUDENT"].includes(input.role) && (input.canPurchaseSubscription || input.canManageMemberships)) throw new ApiError("Family memberships cannot receive administrative delegations", 400);
    const campus = await prisma.campus.findFirst({ where: { id: input.campusId, schoolId: actor.schoolId } });
    if (!campus) throw new ApiError("Campus is outside this institution", 403);
    const before = { role: target.role, campusId: target.campusId, isActive: target.isActive, canPurchaseSubscription: target.canPurchaseSubscription, canManageMemberships: target.canManageMemberships };
    const after = { role: input.role, campusId: input.campusId, isActive: input.isActive, canPurchaseSubscription: input.canPurchaseSubscription, canManageMemberships: input.canManageMemberships };
    await prisma.$transaction(async tx => {
      const changed = await tx.user.updateMany({ where: { id: target.id, accessVersion: input.expectedVersion }, data: { ...after, accessVersion: { increment: 1 } } });
      if (changed.count !== 1) throw new ApiError("This membership changed. Reload and review again.", 409);
      await tx.loginSession.updateMany({ where: { userId: target.id }, data: { isActive: false } });
      await tx.auditLog.create({ data: { userId: actor.userId, tableName: "membership", recordId: target.id, oldValue: before, newValue: after } });
    });
    return Response.json({ success: true });
  } catch (error) { return errorResponse(error); }
}
