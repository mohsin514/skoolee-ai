import { NextRequest } from "next/server";
import {
  ApiError,
  assertSharedModuleRead,
  canManageOperations,
  errorResponse,
  isFamilyRole,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import { studentScope } from "@/lib/auth/policy";
import { renderDateSheetPdf, renderSeatingPdf } from "@/lib/academic/exam-docs";
import { documentVersionLabel, latestPublishedVersion, publishedPapersForClasses } from "@/lib/academic/datesheet-publication";

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
    let sessionId = searchParams.get("sessionId") ?? undefined;
    const examId = searchParams.get("examId") ?? undefined;
    const scheduleId = searchParams.get("scheduleId") ?? undefined;
    let classId = searchParams.get("classId") ?? undefined;

    if (doc === "seating") {
      // SKO-413: seating names pupils and rooms; the exam office and teachers (invigilators) print it,
      // not every staff role.
      if (!canManageOperations(user) && user.role !== "TEACHER") throw new ApiError("Only the examination office and teachers can print seating plans", 403);
      const { buffer, filename } = await renderSeatingPdf({
        campusId,
        sessionId,
        examId,
        scheduleId,
        versionLabel: await documentVersionLabel(sessionId, campusId, "seating"),
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
            : studentScope(user, "learningRecords"),
        select: { classId: true },
      });
      const ownClassIds = new Set(students.map((s) => s.classId));
      if (ownClassIds.size === 0) throw new ApiError("No class linked to this account", 403);
      if (!classId || !ownClassIds.has(classId)) {
        classId = [...ownClassIds][0];
      }
      // SKO-413: a family sheet is always the published version for the family's own class,
      // whichever exam or session the query names — never another class or a live draft.
      if (examId) {
        const exam = await prisma.exam.findFirst({ where: { id: examId, campusId }, select: { classId: true, sessionId: true, status: true } });
        if (!exam || !ownClassIds.has(exam.classId)) throw new ApiError("Exam not found", 404);
        if (!exam.sessionId && exam.status === "DRAFT") throw new ApiError("Exam not found", 404);
        if (exam.sessionId && !sessionId) sessionId = exam.sessionId;
      }
      if (sessionId) {
        const papers = (await publishedPapersForClasses(user.schoolId, [classId])).filter(p => p.sessionId === sessionId && (!examId || p.examId === examId));
        const latest = await latestPublishedVersion(sessionId);
        if (!latest || !papers.length) throw new ApiError("This datesheet has not been published yet", 404);
        const { buffer, filename } = await renderDateSheetPdf({ campusId, sessionId, published: { papers },
          versionLabel: `Version ${latest.version} · ref ${latest.id.slice(0, 8)} · published ${latest.publishedAt.toISOString().slice(0, 10)}` });
        return pdfResponse(buffer, filename);
      }
    }

    const { buffer, filename } = await renderDateSheetPdf({ campusId, sessionId, examId, classId,
      versionLabel: isFamilyRole(user) ? undefined : await documentVersionLabel(sessionId, campusId, "datesheet") });
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
