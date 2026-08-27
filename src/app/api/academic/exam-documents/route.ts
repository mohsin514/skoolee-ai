import { NextRequest } from "next/server";
import {
  ApiError,
  assertSharedModuleRead,
  assertStaffRole,
  errorResponse,
  isFamilyRole,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import { renderDateSheetPdf, renderSeatingPdf } from "@/lib/academic/exam-docs";

export const runtime = "nodejs";

/**
 * Downloadable exam paperwork (§80).
 *
 * GET ?doc=datesheet&sessionId=…[&classId=]  → the date sheet, as a PDF
 * GET ?doc=seating&sessionId=…               → the seating plan, as a PDF
 *
 * The two documents have different audiences and therefore different rules.
 * A date sheet is public within the school — a parent may download their own
 * child's class. A seating plan is a roster of exactly where every named child
 * will be at a known time, so it never leaves staff hands.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = req.nextUrl;
    const doc = searchParams.get("doc") ?? "datesheet";
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const sessionId = searchParams.get("sessionId") ?? undefined;
    const examId = searchParams.get("examId") ?? undefined;
    const scheduleId = searchParams.get("scheduleId") ?? undefined;
    let classId = searchParams.get("classId") ?? undefined;

    if (doc === "seating") {
      assertStaffRole(user);
      const { buffer, filename } = await renderSeatingPdf({
        campusId,
        sessionId,
        examId,
        scheduleId,
      });
      return pdfResponse(buffer, filename);
    }

    if (doc !== "datesheet") throw new ApiError("Unknown document", 400);

    await assertSharedModuleRead(user, "exams");

    // A family may only ever take away their own child's sheet, whatever the
    // query string asks for.
    if (isFamilyRole(user)) {
      const students = await prisma.student.findMany({
        where:
          user.role === "STUDENT"
            ? { studentUserId: user.userId }
            : { parentUserId: user.userId },
        select: { classId: true },
      });
      const ownClassIds = new Set(students.map((s) => s.classId));
      if (ownClassIds.size === 0) throw new ApiError("No class linked to this account", 403);
      if (!classId || !ownClassIds.has(classId)) {
        classId = [...ownClassIds][0];
      }
    }

    const { buffer, filename } = await renderDateSheetPdf({ campusId, sessionId, examId, classId });
    return pdfResponse(buffer, filename);
  } catch (error) {
    return errorResponse(error, "[exam-documents] GET failed");
  }
}

function pdfResponse(buffer: Buffer, filename: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
