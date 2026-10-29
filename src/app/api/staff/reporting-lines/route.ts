import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError, assertPermission, canManageCampusOps, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { readJsonBody } from "@/lib/api/validate";

// Secondary reporting lines (Module 8b).
//
// The solid line lives on the profile and is what the chart lays out. These are
// the extra ones a real institution runs on — a lecturer answering to the
// Controller of Examinations for exam duty while still belonging to their
// department — and are drawn dashed rather than as structure.

const LineInput = z.object({
  userId: z.string().uuid(),
  managerId: z.string().uuid(),
  kind: z.enum(["DOTTED", "FUNCTIONAL", "PROJECT"]).default("DOTTED"),
  label: z.string().trim().max(80).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "staff", "edit");
    const input = LineInput.parse(await readJsonBody(req));

    if (input.userId === input.managerId) {
      throw new ApiError("A staff member cannot report to themselves", 400);
    }

    const [staff, manager] = await Promise.all([
      prisma.user.findFirst({ where: { id: input.userId, isActive: true }, select: { id: true } }),
      prisma.user.findFirst({ where: { id: input.managerId, isActive: true }, select: { id: true } }),
    ]);
    if (!staff || !manager) throw new ApiError("Both people must be active staff at this school", 404);

    // A second line is not structure, so it cannot form a cycle that breaks the
    // chart — but duplicating one clutters it for no gain.
    const duplicate = await prisma.staffReportingLine.findFirst({
      where: { userId: input.userId, managerId: input.managerId, endedAt: null },
      select: { id: true },
    });
    if (duplicate) throw new ApiError("That reporting line already exists", 409);

    const line = await prisma.$transaction(async (tx) => {
      const created = await tx.staffReportingLine.create({
        data: {
          userId: input.userId,
          managerId: input.managerId,
          kind: input.kind,
          label: input.label || null,
        },
      });
      await writeAuditEvent(tx, user, { table: "staff_reporting_lines", recordId: created.id, action: "CREATE", after: { userId: created.userId, managerId: created.managerId, kind: created.kind } });
      return created;
    });

    return Response.json({ success: true, line }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[staff/reporting-lines] POST failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "staff", "edit");
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const line = await prisma.staffReportingLine.findFirst({ where: { id }, select: { id: true, userId: true, managerId: true, kind: true } });
    if (!line) throw new ApiError("Reporting line not found", 404);

    await prisma.$transaction(async (tx) => {
      await tx.staffReportingLine.update({ where: { id }, data: { endedAt: new Date() } });
      await writeAuditEvent(tx, user, { table: "staff_reporting_lines", recordId: id, action: "ARCHIVE", before: { userId: line.userId, managerId: line.managerId, kind: line.kind }, after: { ended: true } });
    });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[staff/reporting-lines] DELETE failed");
  }
}
