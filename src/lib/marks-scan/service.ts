import { createHash, randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { gradeForMark, isLockedStatus, thresholdsForClass } from "@/lib/academic/report-cards";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { uploadPrivateObject } from "@/lib/storage/s3";
import { extractMarks, type Reading } from "./extractor";

// SKO-412: paper marks sheet → staged scan → teacher review → approved, idempotent, reversible import.
// - A template freezes the roster (row → pupil) and limits; its QR holds only an opaque reference and page.
//   Possessing a QR grants nothing: it resolves only for staff assigned to that exam subject.
// - Captured pages are checked for blur/contrast; a poor page is kept as "retake" and never accepted.
//   The same image twice is ignored; a different image for an accepted page replaces it and sends that
//   page's cells back to review.
// - Extraction (pluggable, see ./extractor) only proposes values with a confidence. Every cell needs an
//   explicit teacher review before approval; confidence only orders the queue.
// - Approval needs every page and every cell resolved, the roster unchanged and the exam still open.
//   Commit rechecks all of it, lists marks changed by someone else since the scan began for an explicit
//   decision, writes through the same grading rules as manual entry, and returns a receipt. Retrying the
//   same commit returns the same receipt; reversal restores the earlier marks only if nobody changed them.

const QR_PREFIX = "SKMS1";
const HEADER = 0.14, FOOTER = 0.04; // template layout: fractions of the page height

async function examSubject(user: AuthUser, examId: string, subjectId: string, db: TxClient = prisma) {
  const exam = await db.exam.findFirst({ where: { id: examId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { id: true, title: true, status: true, isLocked: true, campusId: true, classId: true, academicYear: true, academicModelVersionId: true, subjectId: true, class: { select: { name: true, section: true, classTeacherId: true } } } });
  const subject = exam ? await db.subject.findFirst({ where: { id: subjectId, schoolId: user.schoolId, classId: exam.classId }, select: { id: true, name: true, totalMarks: true, teacherId: true } }) : null;
  if (!exam || !subject || (exam.subjectId && exam.subjectId !== subject.id)) throw new ApiError("Exam not found", 404);
  const assigned = canManageOperations(user) || (user.role === "TEACHER" && (subject.teacherId === user.userId || exam.class.classTeacherId === user.userId));
  if (!assigned) throw new ApiError("Exam not found", 404);
  return { exam, subject };
}
const assertOpen = (exam: { status: string; isLocked: boolean }) => {
  if (exam.isLocked || isLockedStatus(exam.status)) throw new ApiError("This exam is locked; marks cannot be imported.", 409);
  if (exam.status === "DRAFT") throw new ApiError("Activate the exam before importing marks.", 409);
};

type RosterRow = { row: number; page: number; studentId: string; rollNo: string; name: string };

export async function createTemplate(user: AuthUser, body: Record<string, unknown>) {
  const rowsPerPage = Math.min(30, Math.max(5, Number(body.rowsPerPage ?? 20) || 20));
  return schoolAiTransaction(user, async tx => {
    const { exam, subject } = await examSubject(user, String(body.examId ?? ""), String(body.subjectId ?? ""), tx);
    assertOpen(exam);
    const students = await tx.student.findMany({ where: { schoolId: user.schoolId, classId: exam.classId, archivedAt: null, status: "active" }, select: { id: true, fullName: true, rollNo: true }, orderBy: [{ rollNo: "asc" }, { fullName: "asc" }] });
    if (!students.length) throw new ApiError("This class has no pupils to print.", 409);
    const roster: RosterRow[] = students.map((s, i) => ({ row: i + 1, page: Math.floor(i / rowsPerPage) + 1, studentId: s.id, rollNo: s.rollNo ?? "", name: s.fullName }));
    const latest = await tx.markSheetTemplate.findFirst({ where: { examId: exam.id, subjectId: subject.id }, orderBy: { version: "desc" }, select: { version: true } });
    return tx.markSheetTemplate.create({ data: { schoolId: user.schoolId, campusId: exam.campusId, examId: exam.id, subjectId: subject.id, version: (latest?.version ?? 0) + 1, reference: randomBytes(12).toString("base64url"), rowsPerPage, pageCount: Math.ceil(students.length / rowsPerPage), maxMarks: subject.totalMarks, roster: roster as unknown as Prisma.InputJsonValue, createdById: user.userId } });
  });
}

async function loadTemplate(user: AuthUser, templateId: string, db: TxClient = prisma) {
  const template = await db.markSheetTemplate.findFirst({ where: { id: templateId, schoolId: user.schoolId } });
  if (!template) throw new ApiError("Marks sheet not found", 404);
  const scope = await examSubject(user, template.examId, template.subjectId, db);
  return { template, roster: template.roster as unknown as RosterRow[], ...scope };
}

/** Everything needed to print the sheet: pages, rows and one QR per page (opaque reference only). */
export async function templateSheet(user: AuthUser, templateId: string) {
  const { template, roster, exam, subject } = await loadTemplate(user, templateId);
  const pages = [];
  for (let page = 1; page <= template.pageCount; page++) { const code = `${QR_PREFIX}:${template.reference}:${page}`; pages.push({ page, code, qr: await QRCode.toDataURL(code, { margin: 1, width: 160 }), rows: roster.filter(r => r.page === page) }); }
  return { id: template.id, version: template.version, maxMarks: template.maxMarks, examTitle: exam.title, subjectName: subject.name, className: [exam.class.name, exam.class.section].filter(Boolean).join(" "), pages };
}

export function parseQr(code: string) {
  const match = /^SKMS1:([A-Za-z0-9_-]{16}):(\d{1,2})$/.exec(String(code ?? "").trim());
  if (!match) throw new ApiError("This is not a Skoolee marks sheet code.", 400);
  return { reference: match[1], page: Number(match[2]) };
}

export async function startBatch(user: AuthUser, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    let templateId = String(body.templateId ?? "");
    if (body.qr) { const { reference } = parseQr(String(body.qr)); const found = await tx.markSheetTemplate.findFirst({ where: { reference, schoolId: user.schoolId }, select: { id: true } }); if (!found) throw new ApiError("Marks sheet not found", 404); templateId = found.id; }
    const { template, roster, exam } = await loadTemplate(user, templateId, tx);
    assertOpen(exam);
    const marks = await tx.mark.findMany({ where: { examId: template.examId, subjectId: template.subjectId, studentId: { in: roster.map(r => r.studentId) } }, select: { studentId: true, marksObtained: true, isAbsent: true, isExempt: true } });
    const baseline = Object.fromEntries(marks.map(m => [m.studentId, { marksObtained: m.marksObtained, isAbsent: m.isAbsent, isExempt: m.isExempt }]));
    return tx.markScanBatch.create({ data: { schoolId: user.schoolId, campusId: template.campusId, templateId: template.id, baseline, createdById: user.userId } });
  });
}

async function loadBatch(user: AuthUser, batchId: string, db: TxClient = prisma, lock = false) {
  if (lock) await db.$queryRaw`SELECT id FROM mark_scan_batches WHERE id = ${batchId} AND school_id = ${user.schoolId} FOR UPDATE`;
  const batch = await db.markScanBatch.findFirst({ where: { id: batchId, schoolId: user.schoolId } });
  if (!batch) throw new ApiError("Scan not found", 404);
  const scope = await loadTemplate(user, batch.templateId, db);
  return { batch, ...scope };
}
const bump = (tx: TxClient, batchId: string, status?: string) => tx.markScanBatch.update({ where: { id: batchId }, data: { version: { increment: 1 }, ...(status ? { status } : {}), approvedById: null, approvedAt: null } });

/**
 * Add one captured page. Quality and the page's QR are checked before anything is accepted; a duplicate
 * image is ignored; a different image for an accepted page replaces it and sends its cells back to review.
 */
export async function addPage(user: AuthUser, batchId: string, body: Record<string, unknown>) {
  const bytes = Buffer.from(String(body.image ?? ""), "base64");
  const contentType = String(body.contentType ?? "image/jpeg");
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) throw new ApiError("Upload a JPEG, PNG or WebP photo.", 400);
  if (bytes.length < 64 || bytes.length > 8 * 1024 * 1024) throw new ApiError("The photo is empty or larger than 8 MB.", 400);
  const sharpness = Number(body.sharpness), contrast = Number(body.contrast);
  if (!Number.isFinite(sharpness) || !Number.isFinite(contrast)) throw new ApiError("Image quality was not measured. Retake the photo.", 400);
  const { reference, page } = parseQr(String(body.qr ?? ""));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return schoolAiTransaction(user, async tx => {
    const { batch, template, roster } = await loadBatch(user, batchId, tx, true);
    if (!["CAPTURING", "REVIEW", "APPROVED"].includes(batch.status)) throw new ApiError("This scan can no longer take pages.", 409);
    if (reference !== template.reference) throw new ApiError("This page belongs to a different marks sheet or version.", 409);
    if (page < 1 || page > template.pageCount) throw new ApiError("This page number is not part of the sheet.", 409);
    const accepted = await tx.markScanPage.findFirst({ where: { batchId, pageNumber: page, status: "ACCEPTED" } });
    if (accepted?.sha256 === sha256) return { status: "DUPLICATE" as const, page };
    const storageKey = `mark-scans/${user.schoolId}/${batchId}/${page}-${sha256.slice(0, 16)}.${contentType.split("/")[1]}`;
    const poor = sharpness < 75 || contrast < 14;
    try { await uploadPrivateObject(storageKey, bytes, contentType); } catch (error) { if (!String((error as { name?: string })?.name ?? "").includes("PreconditionFailed")) throw error; }
    if (poor) {
      await tx.markScanPage.create({ data: { schoolId: user.schoolId, batchId, pageNumber: page, storageKey, sha256, sharpness, contrast, status: "RETAKE", reason: sharpness < 75 ? "BLURRED" : "LOW_CONTRAST" } });
      return { status: "RETAKE" as const, page, reason: sharpness < 75 ? "BLURRED" : "LOW_CONTRAST" };
    }
    if (accepted) await tx.markScanPage.update({ where: { id: accepted.id }, data: { status: "REPLACED" } });
    await tx.markScanPage.create({ data: { schoolId: user.schoolId, batchId, pageNumber: page, storageKey, sha256, sharpness, contrast } });
    const rows = roster.filter(r => r.page === page);
    const readings = await extractMarks({ bytes, contentType, rows: rows.map(r => r.row), maxMarks: template.maxMarks, synthetic: body.syntheticReadings });
    for (const row of rows) {
      const reading: Reading | undefined = readings.find(r => r.row === row.row);
      const data = { proposedValue: reading?.value ?? null, proposedAbsent: reading?.absent ?? false, confidence: reading?.confidence ?? null, alternatives: (reading?.alternatives ?? []) as Prisma.InputJsonValue, reviewedValue: null, reviewedAbsent: false, reviewedById: null, reviewedAt: null, status: "NEEDS_REVIEW", corrected: false };
      await tx.markScanCell.upsert({ where: { batchId_studentId: { batchId, studentId: row.studentId } }, create: { schoolId: user.schoolId, batchId, pageNumber: page, rowNumber: row.row, studentId: row.studentId, ...data }, update: data });
    }
    await bump(tx, batchId, "REVIEW");
    return { status: accepted ? "REPLACED" as const : "ACCEPTED" as const, page, cells: rows.length };
  });
}

/** The review queue: pages, missing pages, cells (uncertain first) with their crop and the current mark. */
export async function batchView(user: AuthUser, batchId: string) {
  const { batch, template, roster, exam, subject } = await loadBatch(user, batchId);
  const [pages, cells, marks, enrolled] = await Promise.all([
    prisma.markScanPage.findMany({ where: { batchId }, orderBy: [{ pageNumber: "asc" }, { createdAt: "asc" }] }),
    prisma.markScanCell.findMany({ where: { batchId } }),
    prisma.mark.findMany({ where: { examId: template.examId, subjectId: template.subjectId, studentId: { in: roster.map(r => r.studentId) } }, select: { studentId: true, marksObtained: true, isAbsent: true, isExempt: true } }),
    prisma.student.findMany({ where: { schoolId: user.schoolId, classId: exam.classId, archivedAt: null, status: "active", id: { in: roster.map(r => r.studentId) } }, select: { id: true } }),
  ]);
  const accepted = new Map(pages.filter(p => p.status === "ACCEPTED").map(p => [p.pageNumber, p]));
  const missing = Array.from({ length: template.pageCount }, (_, i) => i + 1).filter(p => !accepted.has(p));
  const current = new Map(marks.map(m => [m.studentId, m])), base = batch.baseline as Record<string, { marksObtained: number; isAbsent: boolean } | undefined>;
  const stillEnrolled = new Set(enrolled.map(s => s.id));
  const rowHeight = (1 - HEADER - FOOTER) / template.rowsPerPage;
  const cellViews = cells.map(cell => {
    const r = roster.find(x => x.studentId === cell.studentId)!, indexOnPage = (r.row - 1) % template.rowsPerPage;
    const now = current.get(cell.studentId) ?? null, before = base[cell.studentId] ?? null;
    return { ...cell, name: r.name, rollNo: r.rollNo, enrolled: stillEnrolled.has(cell.studentId), pageImage: accepted.get(cell.pageNumber) ? `/api/marks-scan/${batchId}?image=${accepted.get(cell.pageNumber)!.id}` : null, crop: { top: HEADER + indexOnPage * rowHeight, height: rowHeight }, current: now, changedSinceScan: JSON.stringify(now ? { marksObtained: now.marksObtained, isAbsent: now.isAbsent } : null) !== JSON.stringify(before ? { marksObtained: before.marksObtained, isAbsent: before.isAbsent } : null) };
  }).sort((a, b) => (a.status === "NEEDS_REVIEW" ? 0 : 1) - (b.status === "NEEDS_REVIEW" ? 0 : 1) || (a.confidence ?? -1) - (b.confidence ?? -1) || a.rowNumber - b.rowNumber);
  return { batch: { id: batch.id, status: batch.status, version: batch.version, receipt: batch.receipt, approvedAt: batch.approvedAt }, template: { id: template.id, version: template.version, pageCount: template.pageCount, maxMarks: template.maxMarks }, exam: { title: exam.title, status: exam.status, locked: exam.isLocked || isLockedStatus(exam.status) }, subject: { name: subject.name }, pages: pages.map(p => ({ id: p.id, pageNumber: p.pageNumber, status: p.status, reason: p.reason, sharpness: p.sharpness })), missingPages: missing, cells: cellViews, counts: { needsReview: cellViews.filter(c => c.status === "NEEDS_REVIEW").length, reviewed: cellViews.filter(c => c.status === "REVIEWED").length, excluded: cellViews.filter(c => c.status === "EXCLUDED").length } };
}

export async function pageImage(user: AuthUser, batchId: string, pageId: string) {
  await loadBatch(user, batchId);
  const page = await prisma.markScanPage.findFirst({ where: { id: pageId, batchId, schoolId: user.schoolId } });
  if (!page || !page.storageKey.startsWith(`mark-scans/${user.schoolId}/${batchId}/`)) throw new ApiError("Page not found", 404);
  const ext = page.storageKey.split(".").pop() ?? "jpeg";
  return { storageKey: page.storageKey, contentType: `image/${ext}`, fileName: `page-${page.pageNumber}.${ext}` };
}

/** The teacher's decision for one cell: a whole mark within the limit, absent, or left out of this import. */
export async function reviewCell(user: AuthUser, batchId: string, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const { batch, template } = await loadBatch(user, batchId, tx, true);
    if (!["REVIEW", "APPROVED"].includes(batch.status)) throw new ApiError("This scan is not open for review.", 409);
    if (body.knownVersion !== undefined && Number(body.knownVersion) !== batch.version) throw new ApiError("This scan changed since you opened it. Review the latest pages.", 409);
    const cell = await tx.markScanCell.findFirst({ where: { id: String(body.cellId ?? ""), batchId } });
    if (!cell) throw new ApiError("Cell not found", 404);
    const exclude = body.exclude === true, absent = body.absent === true;
    let value: number | null = null;
    if (!exclude && !absent) {
      value = Number(body.value);
      if (!Number.isInteger(value) || value < 0 || value > template.maxMarks) throw new ApiError("Enter a whole mark from 0 to the sheet's maximum.", 400);
    }
    const corrected = exclude ? cell.corrected : absent !== cell.proposedAbsent || (!absent && value !== cell.proposedValue);
    await tx.markScanCell.update({ where: { id: cell.id }, data: { status: exclude ? "EXCLUDED" : "REVIEWED", reviewedValue: value, reviewedAbsent: absent, reviewedById: user.userId, reviewedAt: new Date(), corrected } });
    await bump(tx, batchId, "REVIEW");
    return { ok: true };
  });
}

export async function approveBatch(user: AuthUser, batchId: string, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const { batch, template, exam, roster } = await loadBatch(user, batchId, tx, true);
    if (batch.status !== "REVIEW") throw new ApiError("Only a scan under review can be approved.", 409);
    if (Number(body.knownVersion) !== batch.version) throw new ApiError("This scan changed since you opened it. Review the latest pages.", 409);
    assertOpen(exam);
    const pages = await tx.markScanPage.findMany({ where: { batchId, status: "ACCEPTED" }, select: { pageNumber: true } });
    const missing = Array.from({ length: template.pageCount }, (_, i) => i + 1).filter(p => !pages.some(x => x.pageNumber === p));
    if (missing.length) throw new ApiError("Some pages are still missing or need a retake.", 409);
    const cells = await tx.markScanCell.findMany({ where: { batchId } });
    if (cells.length !== roster.length || cells.some(c => c.status === "NEEDS_REVIEW")) throw new ApiError("Review every mark before approving.", 409);
    const enrolled = new Set((await tx.student.findMany({ where: { schoolId: user.schoolId, classId: exam.classId, archivedAt: null, status: "active", id: { in: roster.map(r => r.studentId) } }, select: { id: true } })).map(s => s.id));
    if (cells.some(c => c.status === "REVIEWED" && !enrolled.has(c.studentId))) throw new ApiError("A pupil on this sheet has left the class. Leave their mark out before approving.", 409);
    return tx.markScanBatch.update({ where: { id: batchId }, data: { status: "APPROVED", approvedById: user.userId, approvedAt: new Date() } });
  });
}

/**
 * Write the approved marks. `decisions` resolves marks someone else changed since the scan began
 * ("overwrite" or "keep"); without a decision for each, nothing is written. Same commitKey → same receipt.
 */
export async function commitBatch(user: AuthUser, batchId: string, body: Record<string, unknown>) {
  const commitKey = String(body.commitKey ?? "");
  if (commitKey.length < 8 || commitKey.length > 120) throw new ApiError("Missing request key.", 400);
  const decisions = (body.decisions && typeof body.decisions === "object" ? body.decisions : {}) as Record<string, string>;
  return schoolAiTransaction(user, async tx => {
    const { batch, template, exam, subject } = await loadBatch(user, batchId, tx, true);
    if (batch.status === "COMMITTED" && batch.commitKey === commitKey) return { receipt: batch.receipt, repeated: true };
    if (batch.status !== "APPROVED") throw new ApiError("Approve the reviewed scan before importing it.", 409);
    if (Number(body.knownVersion) !== batch.version) throw new ApiError("This scan changed since it was approved. Review it again.", 409);
    const freshExam = await tx.exam.findUniqueOrThrow({ where: { id: exam.id }, select: { status: true, isLocked: true } });
    assertOpen(freshExam);
    const cells = (await tx.markScanCell.findMany({ where: { batchId, status: "REVIEWED" } }));
    const enrolled = new Set((await tx.student.findMany({ where: { schoolId: user.schoolId, classId: exam.classId, archivedAt: null, status: "active", id: { in: cells.map(c => c.studentId) } }, select: { id: true } })).map(s => s.id));
    if (cells.some(c => !enrolled.has(c.studentId))) throw new ApiError("A pupil on this sheet has left the class. Leave their mark out and approve again.", 409);
    const existing = new Map((await tx.mark.findMany({ where: { examId: exam.id, subjectId: subject.id, studentId: { in: cells.map(c => c.studentId) } } })).map(m => [m.studentId, m]));
    const base = batch.baseline as Record<string, { marksObtained: number; isAbsent: boolean } | undefined>;
    const conflicts = cells.filter(c => { const now = existing.get(c.studentId), before = base[c.studentId]; return JSON.stringify(now ? [now.marksObtained, now.isAbsent] : null) !== JSON.stringify(before ? [before.marksObtained, before.isAbsent] : null); });
    const undecided = conflicts.filter(c => !["overwrite", "keep"].includes(decisions[c.studentId]));
    if (undecided.length) throw new ApiError(JSON.stringify({ code: "CONFLICTS", studentIds: undecided.map(c => c.studentId) }), 409);
    const thresholds = await thresholdsForClass(exam.classId, exam.academicYear, tx, exam.academicModelVersionId);
    const changed: { studentId: string; before: { marksObtained: number; isAbsent: boolean } | null; after: { marksObtained: number; isAbsent: boolean } }[] = [], kept: string[] = [], unchanged: string[] = [];
    for (const cell of cells) {
      if (decisions[cell.studentId] === "keep" && conflicts.includes(cell)) { kept.push(cell.studentId); continue; }
      const absent = cell.reviewedAbsent, obtained = absent ? 0 : Number(cell.reviewedValue);
      const old = existing.get(cell.studentId);
      if (old && old.marksObtained === obtained && old.isAbsent === absent && !old.isExempt) { unchanged.push(cell.studentId); continue; }
      const grade = absent ? null : gradeForMark(obtained, template.maxMarks, thresholds);
      const mark = old
        ? await tx.mark.update({ where: { id: old.id }, data: { marksObtained: obtained, isAbsent: absent, isExempt: false, grade, enteredBy: user.userId } })
        : await tx.mark.create({ data: { schoolId: user.schoolId, campusId: exam.campusId, examId: exam.id, studentId: cell.studentId, subjectId: subject.id, marksObtained: obtained, isAbsent: absent, grade, enteredBy: user.userId } });
      await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: exam.campusId, tableName: "marks", recordId: mark.id, userId: user.userId, oldValue: old ? { marksObtained: old.marksObtained, isAbsent: old.isAbsent, isExempt: old.isExempt } : Prisma.JsonNull, newValue: { marksObtained: obtained, isAbsent: absent, source: "MARK_SCAN", batchId, templateVersion: template.version, corrected: cell.corrected } } });
      changed.push({ studentId: cell.studentId, before: old ? { marksObtained: old.marksObtained, isAbsent: old.isAbsent } : null, after: { marksObtained: obtained, isAbsent: absent } });
    }
    const receipt = { batchId, committedAt: new Date().toISOString(), changed, kept, unchanged, excluded: await tx.markScanCell.count({ where: { batchId, status: "EXCLUDED" } }), corrected: cells.filter(c => c.corrected).length };
    await tx.markScanBatch.update({ where: { id: batchId }, data: { status: "COMMITTED", commitKey, committedAt: new Date(), receipt: receipt as unknown as Prisma.InputJsonValue } });
    return { receipt, repeated: false };
  });
}

/** Undo an import, but only for marks nobody has changed since; otherwise list them and change nothing. */
export async function reverseBatch(user: AuthUser, batchId: string) {
  return schoolAiTransaction(user, async tx => {
    const { batch, exam, subject, template } = await loadBatch(user, batchId, tx, true);
    if (batch.status !== "COMMITTED") throw new ApiError("Only an imported scan can be reversed.", 409);
    const thresholds = await thresholdsForClass(exam.classId, exam.academicYear, tx, exam.academicModelVersionId);
    assertOpen(await tx.exam.findUniqueOrThrow({ where: { id: exam.id }, select: { status: true, isLocked: true } }));
    const receipt = batch.receipt as { changed: { studentId: string; before: { marksObtained: number; isAbsent: boolean } | null; after: { marksObtained: number; isAbsent: boolean } }[] };
    const marks = new Map((await tx.mark.findMany({ where: { examId: exam.id, subjectId: subject.id, studentId: { in: receipt.changed.map(c => c.studentId) } } })).map(m => [m.studentId, m]));
    const moved = receipt.changed.filter(c => { const m = marks.get(c.studentId); return !m || m.marksObtained !== c.after.marksObtained || m.isAbsent !== c.after.isAbsent; });
    if (moved.length) throw new ApiError(JSON.stringify({ code: "CHANGED_SINCE_IMPORT", studentIds: moved.map(c => c.studentId) }), 409);
    for (const c of receipt.changed) {
      const m = marks.get(c.studentId)!;
      if (c.before) await tx.mark.update({ where: { id: m.id }, data: { marksObtained: c.before.marksObtained, isAbsent: c.before.isAbsent, grade: c.before.isAbsent ? null : gradeForMark(c.before.marksObtained, template.maxMarks, thresholds), enteredBy: user.userId } });
      else await tx.mark.delete({ where: { id: m.id } });
      await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: exam.campusId, tableName: "marks", recordId: m.id, userId: user.userId, oldValue: c.after, newValue: c.before ? { ...c.before, source: "MARK_SCAN_REVERSAL", batchId } : { deleted: true, source: "MARK_SCAN_REVERSAL", batchId } } });
    }
    return tx.markScanBatch.update({ where: { id: batchId }, data: { status: "REVERSED", reversedAt: new Date() } });
  });
}

export async function listForExam(user: AuthUser, examId: string, subjectId: string) {
  await examSubject(user, examId, subjectId);
  const templates = await prisma.markSheetTemplate.findMany({ where: { schoolId: user.schoolId, examId, subjectId }, orderBy: { version: "desc" }, select: { id: true, version: true, pageCount: true, createdAt: true, batches: { orderBy: { createdAt: "desc" }, select: { id: true, status: true, createdAt: true } } } });
  return templates;
}
