import { operationDeleteResponse } from "@/lib/destructive/operations";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertPermission,
  assertStaffRole,
  canManageCampusOps,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";
import { created, fail, failFrom, ok } from "@/lib/api/envelope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";
import { writeAuditEvent } from "@/lib/audit-events";
import { assertGroupCurrent, parseGroupInput } from "@/lib/students/group-policy";

// GET    /api/student-groups?campusId=   → staff only (families never read the campus group list)
// POST   { name, description?, campusId? }
// PATCH  { id, name?, description?, expected? } → 409 when `expected` is stale
// DELETE via the reviewed-delete flow (blocked while students are in the group)
// SKAI-169: names are unique per campus ignoring case; every write is audited.

// The tenant guard checks each reference inside the transaction, which is slow over a remote pool.
const TX_OPTIONS = { maxWait: 20_000, timeout: 60_000 };
const DUPLICATE = "A group with this name already exists in this campus";

async function assertNameFree(campusId: string, name: string, exceptId?: string) {
  const clash = await prisma.studentGroup.findFirst({
    where: { campusId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ApiError(DUPLICATE, 409);
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");
    const campusId = user.role === "SUPER_ADMIN" && !requestedCampusId
      ? null
      : await resolveCampusId(user, requestedCampusId);

    let groups = await prisma.studentGroup.findMany({
      where: scopedCampusWhere(user, campusId),
      include: { _count: { select: { students: true } } },
      orderBy: { name: "asc" },
    });

    // New campuses have no student-group rows yet, but registration needs the
    // logistics choices promised by the form. Bootstrap only an empty,
    // campus-scoped list; existing custom groups are left untouched.
    if (campusId && groups.length === 0) {
      await prisma.studentGroup.createMany({
        data: ["Transport users", "Hostel residents"].map((name) => ({
          schoolId: user.schoolId,
          campusId,
          name,
        })),
        skipDuplicates: true,
      });
      groups = await prisma.studentGroup.findMany({
        where: scopedCampusWhere(user, campusId),
        include: { _count: { select: { students: true } } },
        orderBy: { name: "asc" },
      });
    }

    return ok(groups);
  } catch (error) {
    return failFrom(error, "[student-groups] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "students", "add");

    const body = await parseBody(req, jsonObjectBody);
    const input = parseGroupInput(body, false) as { name: string; description: string | null };
    const campusId = await resolveCampusId(user, body.campusId || null);
    await assertNameFree(campusId, input.name);

    const group = await prisma.$transaction(async (tx) => {
      const row = await tx.studentGroup.create({
        data: { schoolId: user.schoolId, campusId, ...input },
        include: { _count: { select: { students: true } } },
      });
      await writeAuditEvent(tx, user, { table: "student_groups", recordId: row.id, action: "CREATE", campusId, after: input });
      return row;
    }, TX_OPTIONS);

    return created(group);
  } catch (error: any) {
    if (error?.code === "P2002") return fail("CONFLICT", DUPLICATE);
    return failFrom(error, "[student-groups] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "students", "edit");

    const body = await parseBody(req, jsonObjectBody);
    if (!body.id) throw new ApiError("Group id is required", 400);
    const data = parseGroupInput(body, true);

    const existing = await prisma.studentGroup.findFirst({
      where: { id: String(body.id), ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? body.campusId : user.campusId) },
      select: { id: true, campusId: true, name: true, description: true },
    });
    if (!existing) throw new ApiError("Group not found", 404);
    assertGroupCurrent(body.expected, existing);
    if (data.name !== undefined) await assertNameFree(existing.campusId, data.name, existing.id);

    const group = await prisma.$transaction(async (tx) => {
      const row = await tx.studentGroup.update({
        where: { id: existing.id },
        data,
        include: { _count: { select: { students: true } } },
      });
      const { id: _id, campusId: _campus, ...before } = existing;
      await writeAuditEvent(tx, user, { table: "student_groups", recordId: row.id, action: "UPDATE", campusId: existing.campusId, before, after: data });
      return row;
    }, TX_OPTIONS);

    return ok(group);
  } catch (error: any) {
    if (error?.code === "P2002") return fail("CONFLICT", DUPLICATE);
    return failFrom(error, "[student-groups] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  return operationDeleteResponse(req, "student-groups");
}
