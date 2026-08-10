import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser } from "@/lib/api/scope";

// Staff payroll / bank records (Module 8).
// GET  /api/staff/profile?userId= — full profile + documents + timeline (admin only).
//      Bank details are ONLY ever served by this admin-gated route.
// PATCH /api/staff/profile         — { userId, ...fields } upsert; records timeline events
//      for designation / contract / salary / bank changes.

const CONTRACT_TYPES = new Set(["PERMANENT", "CONTRACT", "PART_TIME"]);

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
        await assertPermission(user, "staff", "view");
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) throw new ApiError("userId required", 400);

    const staff = await prisma.user.findFirst({
      where: { id: userId, schoolId: user.schoolId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        onboardingComplete: true,
        staffProfile: true,
        staffDocuments: {
          select: { id: true, kind: true, fileKey: true, fileName: true, uploadedAt: true },
          orderBy: { uploadedAt: "desc" },
        },
        staffTimelineEvents: {
          select: { id: true, kind: true, title: true, detail: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });
    if (!staff) throw new ApiError("Staff member not found", 404);

    const documents = await Promise.all(
      staff.staffDocuments.map(async (doc) => {
        const { getDownloadUrl } = await import("@/lib/storage/s3");
        return {
          ...doc,
          downloadUrl: await getDownloadUrl(doc.fileKey).catch(() => null),
        };
      })
    );

    return Response.json({ success: true, data: { ...staff, staffDocuments: documents } });
  } catch (error) {
    return errorResponse(error, "[staff/profile] GET failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "staff", "edit");
    const body = await req.json();
    const userId = String(body.userId ?? "");
    if (!userId) throw new ApiError("userId is required", 400);

    const staff = await prisma.user.findFirst({
      where: { id: userId, schoolId: user.schoolId },
      select: { id: true, fullName: true, staffProfile: true },
    });
    if (!staff) throw new ApiError("Staff member not found", 404);

    const existing = staff.staffProfile;
    const current = existing
      ? {
          designation: existing.designation ?? null,
          contractType: existing.contractType ?? null,
          basicSalary: existing.basicSalary ?? 0,
          bankAccountName: existing.bankAccountName ?? null,
          bankAccountNumber: existing.bankAccountNumber ?? null,
          bankName: existing.bankName ?? null,
        }
      : { designation: null, contractType: null, basicSalary: 0, bankAccountName: null, bankAccountNumber: null, bankName: null };

    const data: Record<string, unknown> = {};
    if (body.designation !== undefined) data.designation = String(body.designation ?? "").trim() || null;
    if (body.contractType !== undefined) {
      const ct = String(body.contractType ?? "").toUpperCase();
      if (ct && !CONTRACT_TYPES.has(ct)) throw new ApiError("contractType must be PERMANENT, CONTRACT or PART_TIME", 400);
      data.contractType = ct || null;
    }
    if (body.basicSalary !== undefined) {
      const salary = Math.round(Number(body.basicSalary));
      if (!Number.isFinite(salary) || salary < 0) throw new ApiError("basicSalary must be a non-negative integer (paisa)", 400);
      data.basicSalary = salary;
    }
    if (body.allowances !== undefined) data.allowancesJson = body.allowances;
    if (body.deductions !== undefined) data.deductionsJson = body.deductions;
    if (body.socialLinks !== undefined) data.socialLinksJson = body.socialLinks;
    if (body.bankAccountName !== undefined) data.bankAccountName = String(body.bankAccountName ?? "").trim() || null;
    if (body.bankAccountNumber !== undefined) data.bankAccountNumber = String(body.bankAccountNumber ?? "").trim() || null;
    if (body.bankName !== undefined) data.bankName = String(body.bankName ?? "").trim() || null;

    const events: Array<{ kind: string; title: string; detail: string }> = [];
    const changed = (before: unknown, after: unknown) =>
      String(before ?? "") !== String(after ?? "");
    const inBody = (field: string) => Object.prototype.hasOwnProperty.call(body, field);

    if (inBody("designation") && changed(current.designation, data.designation)) {
      events.push({
        kind: "DESIGNATION",
        title: "Designation updated",
        detail: `${current.designation || "—"} → ${String(data.designation ?? "") || "—"}`,
      });
    }
    if (inBody("contractType") && changed(current.contractType, data.contractType)) {
      events.push({
        kind: "CONTRACT",
        title: "Contract type updated",
        detail: `${current.contractType || "—"} → ${String(data.contractType ?? "") || "—"}`,
      });
    }
    if (inBody("basicSalary") && Number(current.basicSalary) !== Number(data.basicSalary)) {
      events.push({
        kind: "SALARY",
        title: "Basic salary updated",
        detail: `Rs. ${(current.basicSalary / 100).toLocaleString("en-PK")} → Rs. ${(Number(data.basicSalary ?? 0) / 100).toLocaleString("en-PK")}`,
      });
    }
    if (inBody("bankAccountNumber") && changed(current.bankAccountNumber, data.bankAccountNumber)) {
      events.push({
        kind: "BANK",
        title: "Bank details updated",
        detail: data.bankAccountNumber ? "Account number changed" : "Bank details cleared",
      });
    }

    const profile = await prisma.staffProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    if (events.length > 0) {
      await prisma.staffTimelineEvent.createMany({
        data: events.map((e) => ({ ...e, userId, actorId: user.userId })),
      });
    }

    return Response.json({ success: true, data: profile, events: events.length });
  } catch (error) {
    return errorResponse(error, "[staff/profile] PATCH failed");
  }
}
