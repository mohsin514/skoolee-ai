import { prisma } from "@/lib/db/prisma";
import { requireAuthUser, errorResponse, ApiError, readJsonObject } from "@/lib/api/scope";
import { INVITABLE_ROLES, membershipAuthority, membershipChangeDecision } from "@/lib/membership-access";
import { authorityRoleFor, kindFor } from "@/lib/auth/institution";
import { z } from "zod";

/**
 * People & access (§7.2 G7b). The institution authority lists and manages members school-wide; a delegate
 * (canManageMemberships) only on its own campus; everyone else sees their own row.
 */
export async function GET() {
  try {
    const user = await requireAuthUser();
    const { authority, canManage } = membershipAuthority(user);
    const scope = authority ? {} : { campusId: user.campusId };
    const members = await prisma.user.findMany({ where: { schoolId: user.schoolId, ...(canManage ? scope : { id: user.userId }) },
      select: { id: true, fullName: true, email: true, role: true, campusId: true, isActive: true, isInstitutionOwner: true, canPurchaseSubscription: true, canManageMemberships: true, accessVersion: true } });
    const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true, registrationKind: true } });
    const campuses = await prisma.campus.findMany({ where: { schoolId: user.schoolId, ...(authority ? {} : { id: user.campusId || "" }) }, select: { id: true, name: true } });
    const kind = kindFor(user);
    return Response.json({
      members, school, campuses, canManage, isOwner: Boolean(user.isInstitutionOwner), currentUserId: user.userId,
      // The purchase checkbox is offered only for another holder of the authority role (§10.11 MembershipsPanel).
      isAuthority: authority, institutionKind: kind, authorityRole: kind ? authorityRoleFor(kind) : null,
    });
  } catch (error) { return errorResponse(error); }
}

// role: an invitable role, or — for a flag-only change on another authority-role user — that user's current role.
// campusId: the campus for an invitable role; for that flag-only change, the stored campus as is (null for a group
// admin). membershipChangeDecision compares both with the stored values (G7b).
// reason: optional; when not empty, at least 10 characters (e.g. §2.6 "Make {principal} the campus admin"); kept in the audit row.
const changeSchema = z.object({ userId: z.string().uuid(), role: z.enum([...INVITABLE_ROLES, "SUPER_ADMIN", "ADMIN"]), campusId: z.string().uuid().nullable(),
  canPurchaseSubscription: z.boolean(), canManageMemberships: z.boolean(), isActive: z.boolean(),
  expectedVersion: z.number().int().min(0), reviewed: z.literal(true), reason: z.string().trim().max(500).optional().refine((value) => !value || value.length >= 10) });
export async function PUT(req: Request) {
  try {
    const actor = await requireAuthUser();
    if (!membershipAuthority(actor).canManage) throw new ApiError("Membership management is not delegated", 403);
    const parsed = changeSchema.safeParse(await readJsonObject(req));
    if (!parsed.success) throw new ApiError("Review the role, campus and access change before confirming", 400);
    const input = parsed.data;
    const target = await prisma.user.findFirst({ where: { id: input.userId, schoolId: actor.schoolId } });
    if (!target) throw new ApiError("This membership cannot be changed here", 403);
    const decision = membershipChangeDecision(actor, target, input);
    // The machine code (MFA_REQUIRED) travels with the refusal so People & access can offer "Turn on two-step sign-in" (F28).
    if (!decision.ok) throw new ApiError(decision.error, decision.status, decision.code);
    // The decision has already matched an authority target's campus to the stored one, and required a campus for
    // every other role; the campus is still re-checked against this school.
    const nextCampusId = input.campusId;
    const campus = nextCampusId ? await prisma.campus.findFirst({ where: { id: nextCampusId, schoolId: actor.schoolId } }) : { id: null };
    if (!campus) throw new ApiError("Campus is outside this institution", 403);
    const before = { role: target.role, campusId: target.campusId, isActive: target.isActive, canPurchaseSubscription: target.canPurchaseSubscription, canManageMemberships: target.canManageMemberships };
    const after = { role: input.role, campusId: nextCampusId, isActive: input.isActive, canPurchaseSubscription: input.canPurchaseSubscription, canManageMemberships: input.canManageMemberships };
    await prisma.$transaction(async tx => {
      const changed = await tx.user.updateMany({ where: { id: target.id, accessVersion: input.expectedVersion }, data: { ...after, accessVersion: { increment: 1 } } });
      if (changed.count !== 1) throw new ApiError("This membership changed. Reload and review again.", 409);
      await tx.loginSession.updateMany({ where: { userId: target.id }, data: { isActive: false } });
      await tx.auditLog.create({ data: { userId: actor.userId, tableName: "membership", recordId: target.id, oldValue: before, newValue: { ...after, ...(input.reason ? { reason: input.reason } : {}) } } });
    });
    return Response.json({ success: true });
  } catch (error) { return errorResponse(error); }
}
