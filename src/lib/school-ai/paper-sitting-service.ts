/**
 * SKO-503 (plan F7, paper half): a sealed paper sat on paper.
 *
 * - Print run: covers equal to the candidates of one date-sheet row (grouped by room when seated, else the
 *   section's roster), each with a signed QR naming that candidate's script, a candidate number, a fold-over
 *   name strip and the seal prefix; the run records copies = candidates + spare %. Only a sealed, unchanged,
 *   uncompromised paper prints.
 * - Room sheet: ABSENT is authoritative. A script of an absent candidate cannot be scanned or marked until
 *   the office reopens the entry (audited, with a reason), and the office marks sheet refuses a mark too.
 * - Scan: a script is scanned once; a second scan of the same QR is refused.
 * - Marks: entered per question after hand marking, bounded by each question's marks.
 */
import { z } from "zod";
import { SignJWT, jwtVerify } from "jose";
import QRCode from "qrcode";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError, canManageAcademics } from "@/lib/api/scope";
import { writeAuditEvent } from "@/lib/audit-events";
import { paperDataSchema } from "./assessment";
import { contentHash } from "./release";
import { assertExamOffice } from "./paper-slot-service";
import { schoolAiTransaction } from "./transaction";
import { studioSlotsCopy } from "./exam-studio-copy-slots";
import type { Language } from "@/lib/locale/package";

const ISSUER = "skoolee-paper-script", AUDIENCE = "paper-sitting";
function secret() { const value = process.env.AUTH_SECRET; if (!value || value.length < 24) throw new ApiError("Script identification is not configured.", 503); return new TextEncoder().encode(value); }
const tokenSchema = z.object({ schoolId: z.string(), campusId: z.string(), scriptId: z.string(), scheduleId: z.string(), studentId: z.string(), sealPrefix: z.string() });
async function signScript(payload: z.infer<typeof tokenSchema>) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuer(ISSUER).setAudience(AUDIENCE).setIssuedAt().setExpirationTime("180d").sign(secret());
}
async function readScript(code: string) {
  try { const value = await jwtVerify(code, secret(), { algorithms: ["HS256"], issuer: ISSUER, audience: AUDIENCE }); return tokenSchema.parse(value.payload); }
  catch { throw new ApiError("This script code is not valid for this school.", 422); }
}
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

async function sealedSlot(user: AuthUser, slotId: string, tx: TxClient) {
  const slot = await tx.examPaperSlot.findFirst({ where: { id: slotId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, include: { examSession: { select: { title: true } }, schedules: { select: { id: true, date: true, subjectId: true, subject: { select: { name: true, teacherId: true } }, exam: { select: { id: true, classId: true, class: { select: { name: true, section: true } } } } } } } });
  if (!slot) throw new ApiError("Paper request not found in your campus.", 404);
  return slot;
}

/** May this person handle scripts of this row: the office, or the paper's author, moderator or the row's subject teacher. */
async function assertScriptHandler(user: AuthUser, tx: TxClient, slot: Awaited<ReturnType<typeof sealedSlot>>, scheduleId: string) {
  const office = await assertExamOffice(user, slot.campusId, tx).then(() => true, () => false);
  const schedule = slot.schedules.find(row => row.id === scheduleId);
  if (!schedule) throw new ApiError("That sitting is not part of this paper.", 404);
  if (office || slot.authorUserId === user.userId || slot.moderatorUserId === user.userId || schedule.subject.teacherId === user.userId) return { office, schedule };
  throw new ApiError("Only the exam office or this paper's teachers handle its scripts.", 403);
}

async function roster(tx: TxClient, schoolId: string, classId: string) {
  return tx.student.findMany({ where: { schoolId, classId, status: "active", archivedAt: null }, select: { id: true, fullName: true, rollNo: true }, orderBy: [{ rollNo: "asc" }, { fullName: "asc" }], take: 500 });
}

/** The covers for one date-sheet row (HTML to print), plus the run record. */
export async function printRun(user: AuthUser, slotId: string, scheduleId: string, language: Language = "en") {
  const t = studioSlotsCopy(language);
  const prepared = await schoolAiTransaction(user, async tx => {
    const slot = await sealedSlot(user, slotId, tx);
    await assertExamOffice(user, slot.campusId, tx);
    const schedule = slot.schedules.find(row => row.id === scheduleId);
    if (!schedule) throw new ApiError("That sitting is not part of this paper.", 404);
    if (!slot.sealedAt || !slot.sealHash) throw new ApiError("Seal the paper before printing it.", 409);
    if (slot.compromisedAt) throw new ApiError("This paper was reported compromised. Do not print it.", 409);
    const record = slot.paperRecordId ? await tx.schoolAiRecord.findFirst({ where: { id: slot.paperRecordId, schoolId: user.schoolId, kind: "PAPER" }, select: { version: true, data: true } }) : null;
    if (!record || record.version !== slot.paperVersion) throw new ApiError("The paper changed after it was sealed. It cannot be printed under this seal.", 409);
    let hash: string | null = null; try { hash = contentHash(paperDataSchema.parse(record.data)); } catch { hash = null; }
    if (hash !== slot.sealHash) throw new ApiError("The paper changed after it was sealed. It cannot be printed under this seal.", 409);
    const pupils = await roster(tx, user.schoolId, schedule.exam.classId);
    if (!pupils.length) throw new ApiError("This class has no active pupils to print covers for.", 409);
    const seats = await tx.examSeat.findMany({ where: { schoolId: user.schoolId, examScheduleId: schedule.id }, select: { studentId: true, seatNumber: true, examRoomId: true, examRoom: { select: { room: { select: { roomNumber: true } } } } } });
    const seatOf = new Map(seats.map(seat => [seat.studentId, seat]));
    const sealPrefix = slot.sealHash.slice(0, 16);
    const scripts = [];
    for (const [index, pupil] of pupils.entries()) {
      const script = await tx.examPaperScript.upsert({ where: { scheduleId_studentId: { scheduleId: schedule.id, studentId: pupil.id } }, update: {}, create: { schoolId: user.schoolId, campusId: slot.campusId, slotId: slot.id, scheduleId: schedule.id, studentId: pupil.id, candidateNo: index + 1, sealPrefix } });
      scripts.push({ script, pupil, seat: seatOf.get(pupil.id) ?? null });
    }
    const copies = Math.ceil(pupils.length * (1 + slot.spareCopiesPercent / 100));
    const groupLabel = `${schedule.exam.class.name}${schedule.exam.class.section ? ` ${schedule.exam.class.section}` : ""}`;
    await tx.examPrintRun.create({ data: { schoolId: user.schoolId, campusId: slot.campusId, slotId: slot.id, scheduleId: schedule.id, groupLabel, candidates: pupils.length, copies, sealPrefix, createdById: user.userId } });
    if (!slot.printedAt) await tx.examPaperSlot.update({ where: { id: slot.id }, data: { printedAt: new Date(), printedById: user.userId, printedHash: slot.sealHash, copiesRequested: slot.copiesRequested ?? copies } });
    await writeAuditEvent(tx, user, { table: "exam_print_runs", recordId: slot.id, action: "CREATE", campusId: slot.campusId, after: { scheduleId: schedule.id, candidates: pupils.length, copies, sealPrefix } });
    return { slot, schedule, scripts, copies, groupLabel, sealPrefix };
  });
  const { slot, schedule, scripts, copies, groupLabel, sealPrefix } = prepared;
  const date = new Intl.DateTimeFormat(language, { dateStyle: "long", timeZone: "UTC" }).format(schedule.date);
  const rooms = new Map<string, typeof scripts>();
  for (const row of scripts) { const room = row.seat?.examRoom.room?.roomNumber ?? groupLabel; rooms.set(room, [...(rooms.get(room) ?? []), row]); }
  const pages: string[] = [];
  for (const [room, rows] of rooms) {
    pages.push(`<section class="room"><h1>${escape(slot.examSession.title)} · ${escape(schedule.subject.name)} · ${escape(groupLabel)}</h1><p>${escape(fillCopy(t.printRoomLine, [room, String(rows.length), String(copies)]))}</p><p class="mono">#${escape(sealPrefix)}</p></section>`);
    for (const { script, pupil, seat } of rows) {
      const code = await signScript({ schoolId: user.schoolId, campusId: slot.campusId, scriptId: script.id, scheduleId: schedule.id, studentId: pupil.id, sealPrefix });
      const qr = await QRCode.toString(code, { type: "svg", margin: 1, errorCorrectionLevel: "M", width: 220 });
      pages.push(`<section class="cover" data-cover="${escape(script.id)}"><div class="fold"><span>${escape(t.printFold)}</span><strong>${escape(pupil.fullName)}</strong><span>${escape(pupil.rollNo ?? "")}</span></div><h2>${escape(slot.examSession.title)}</h2><p>${escape(schedule.subject.name)} · ${escape(groupLabel)} · ${escape(date)}</p><div class="qr">${qr}</div><p class="mono">${escape(script.id)}</p><p class="candidate">${escape(fillCopy(t.printCandidate, [String(script.candidateNo)]))}</p>${seat ? `<p>${escape(fillCopy(t.printSeat, [String(seat.seatNumber)]))}</p>` : ""}<p class="note">${escape(t.printCoverNote)}</p><p class="mono">#${escape(sealPrefix)}</p></section>`);
    }
  }
  const dir = language === "en" ? "ltr" : "rtl";
  return `<!doctype html><html lang="${language}" dir="${dir}"><head><meta charset="utf-8"><title>${escape(schedule.subject.name)} · ${escape(groupLabel)}</title><style>
body{font-family:system-ui,sans-serif;margin:0;color:#111}section{page-break-after:always;padding:24mm 18mm;box-sizing:border-box;min-height:270mm}
.room h1{font-size:20pt;margin:0 0 6mm}.cover h2{font-size:16pt;margin:10mm 0 2mm}.fold{border-bottom:2px dashed #555;padding-bottom:4mm;display:flex;gap:6mm;align-items:baseline;font-size:10pt}
.qr{width:60mm;height:60mm;margin:10mm 0}.qr svg{width:100%;height:100%}.candidate{font-size:28pt;font-weight:700}.note{font-size:10pt;color:#333}.mono{font-family:ui-monospace,monospace;font-size:9pt;color:#555}
</style></head><body>${pages.join("")}</body></html>`;
}
const fillCopy = (template: string, values: string[]) => template.replace(/\{(\d+)\}/g, (_match, index) => values[Number(index)] ?? "");

/** The room sheet for one date-sheet row: everyone present except the listed absentees. */
export const attendanceInput = z.strictObject({ absentStudentIds: z.array(z.string().min(1).max(128)).max(500) });
export async function recordAttendance(user: AuthUser, slotId: string, scheduleId: string, raw: unknown) {
  const input = attendanceInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const slot = await sealedSlot(user, slotId, tx);
    const { schedule } = await assertScriptHandler(user, tx, slot, scheduleId);
    const pupils = await roster(tx, user.schoolId, schedule.exam.classId);
    const absent = new Set(input.absentStudentIds);
    if ([...absent].some(id => !pupils.some(pupil => pupil.id === id))) throw new ApiError("Choose pupils of this class only.", 422);
    const existing = await tx.examAttendance.findMany({ where: { schoolId: user.schoolId, scheduleId }, select: { studentId: true, status: true, reopenedAt: true } });
    const before = new Map(existing.map(row => [row.studentId, row]));
    const scripts = await tx.examPaperScript.findMany({ where: { schoolId: user.schoolId, scheduleId, OR: [{ scannedAt: { not: null } }, { markedAt: { not: null } }] }, select: { studentId: true } });
    for (const pupil of pupils) {
      const status = absent.has(pupil.id) ? "ABSENT" : "PRESENT";
      const prior = before.get(pupil.id);
      if (prior?.status === status) continue;
      // An absence stands until the office reopens it; a scanned or marked script cannot be marked absent.
      if (prior?.status === "ABSENT" && !prior.reopenedAt) throw new ApiError("A recorded absence is changed only by the exam office reopening it.", 409, );
      if (status === "ABSENT" && scripts.some(row => row.studentId === pupil.id)) throw new ApiError("This pupil's script is already scanned or marked; they cannot be marked absent.", 409);
      await tx.examAttendance.upsert({ where: { scheduleId_studentId: { scheduleId, studentId: pupil.id } }, update: { status, recordedById: user.userId, recordedAt: new Date() }, create: { schoolId: user.schoolId, campusId: slot.campusId, scheduleId, studentId: pupil.id, status, recordedById: user.userId } });
    }
    await writeAuditEvent(tx, user, { table: "exam_attendance", recordId: scheduleId, action: "UPDATE", campusId: slot.campusId, after: { absent: absent.size, present: pupils.length - absent.size } });
    return { present: pupils.length - absent.size, absent: absent.size };
  });
}

export const reopenInput = z.strictObject({ studentId: z.string().min(1).max(128), reason: z.string().trim().min(5).max(500) });
/** The office reopens a recorded absence (audited): the pupil is treated as present and may be marked. */
export async function reopenAttendance(user: AuthUser, slotId: string, scheduleId: string, raw: unknown) {
  const input = reopenInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const slot = await sealedSlot(user, slotId, tx);
    await assertExamOffice(user, slot.campusId, tx);
    const row = await tx.examAttendance.findFirst({ where: { schoolId: user.schoolId, scheduleId, studentId: input.studentId, status: "ABSENT" } });
    if (!row) throw new ApiError("This pupil is not recorded absent.", 404);
    await tx.examAttendance.update({ where: { id: row.id }, data: { status: "PRESENT", reopenedAt: new Date(), reopenedById: user.userId, reopenReason: input.reason } });
    await writeAuditEvent(tx, user, { table: "exam_attendance", recordId: row.id, action: "UPDATE", campusId: slot.campusId, after: { reopened: true } });
    return { reopened: true };
  });
}

async function isAbsent(tx: TxClient, schoolId: string, scheduleId: string, studentId: string) {
  const row = await tx.examAttendance.findFirst({ where: { schoolId, scheduleId, studentId }, select: { status: true } });
  return row?.status === "ABSENT";
}

/** Scan one cover: refused for another school, an absent pupil, or a script scanned before. */
export const scanInput = z.strictObject({ code: z.string().min(10).max(3000) });
const SCRIPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function scanScript(user: AuthUser, raw: unknown) {
  const input = scanInput.parse(raw);
  // The QR carries a signed code; the printed id under it is the typed fallback (staff-only, this school only).
  const typed = SCRIPT_ID.test(input.code.trim());
  const identity = typed ? null : await readScript(input.code);
  if (identity && identity.schoolId !== user.schoolId) throw new ApiError("This script belongs to another school.", 403);
  return schoolAiTransaction(user, async tx => {
    const script = await tx.examPaperScript.findFirst({ where: identity ? { id: identity.scriptId, schoolId: user.schoolId, scheduleId: identity.scheduleId, studentId: identity.studentId } : { id: input.code.trim().toLowerCase(), schoolId: user.schoolId } });
    if (!script) throw new ApiError("This script is not on record.", 404);
    const slot = await sealedSlot(user, script.slotId, tx);
    await assertScriptHandler(user, tx, slot, script.scheduleId);
    if (await isAbsent(tx, user.schoolId, script.scheduleId, script.studentId)) throw new ApiError("This pupil is recorded absent. The exam office must reopen the entry first.", 409, "SCRIPT_ABSENT");
    const claimed = await tx.examPaperScript.updateMany({ where: { id: script.id, schoolId: user.schoolId, scannedAt: null }, data: { scannedAt: new Date(), scannedById: user.userId, version: { increment: 1 } } });
    if (claimed.count !== 1) throw new ApiError("This script was already scanned.", 409, "SCRIPT_ALREADY_SCANNED");
    await writeAuditEvent(tx, user, { table: "exam_paper_scripts", recordId: script.id, action: "UPDATE", campusId: script.campusId, after: { scanned: true } });
    const pupil = await tx.student.findFirst({ where: { id: script.studentId, schoolId: user.schoolId }, select: { fullName: true, rollNo: true } });
    return { scriptId: script.id, candidateNo: script.candidateNo, student: pupil, slotId: slot.id, scheduleId: script.scheduleId };
  });
}

/** Per-question marks after hand marking. Each mark is bounded by the question's marks. */
export const marksInput = z.strictObject({ version: z.number().int().positive(), marks: z.record(z.string().min(1).max(120), z.number().min(0).max(100)) });
export async function markScript(user: AuthUser, scriptId: string, raw: unknown) {
  const input = marksInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const script = await tx.examPaperScript.findFirst({ where: { id: scriptId, schoolId: user.schoolId } });
    if (!script) throw new ApiError("Script not found.", 404);
    const slot = await sealedSlot(user, script.slotId, tx);
    await assertScriptHandler(user, tx, slot, script.scheduleId);
    if (await isAbsent(tx, user.schoolId, script.scheduleId, script.studentId)) throw new ApiError("This pupil is recorded absent. The exam office must reopen the entry before a mark is entered.", 409, "SCRIPT_ABSENT");
    if (!script.scannedAt) throw new ApiError("Scan the script's cover before entering its marks.", 409, "SCRIPT_NOT_SCANNED");
    const record = slot.paperRecordId ? await tx.schoolAiRecord.findFirst({ where: { id: slot.paperRecordId, schoolId: user.schoolId }, select: { data: true } }) : null;
    const paper = record ? paperDataSchema.parse(record.data) : null;
    if (!paper) throw new ApiError("The sealed paper is unavailable.", 409);
    for (const [questionId, value] of Object.entries(input.marks)) {
      const question = paper.questions.find(row => row.id === questionId);
      if (!question) throw new ApiError("A mark names a question that is not in the paper.", 422);
      if (value > question.marks) throw new ApiError(`Question ${questionId} is out of ${question.marks}.`, 422);
    }
    const total = Object.values(input.marks).reduce((sum, value) => sum + value, 0);
    const updated = await tx.examPaperScript.updateMany({ where: { id: script.id, schoolId: user.schoolId, version: input.version }, data: { marks: input.marks, total, markedById: user.userId, markedAt: new Date(), version: { increment: 1 } } });
    if (updated.count !== 1) throw new ApiError("This script changed meanwhile. Reload and try again.", 409);
    await writeAuditEvent(tx, user, { table: "exam_paper_scripts", recordId: script.id, action: "UPDATE", campusId: script.campusId, after: { marked: true, total } });
    return { total, of: paper.blueprint.totalMarks };
  });
}

/** Everything the Papers step shows for a sealed paper's sittings. */
export async function sittingView(user: AuthUser, slotId: string) {
  return schoolAiTransaction(user, async tx => {
    const slot = await sealedSlot(user, slotId, tx);
    const office = await assertExamOffice(user, slot.campusId, tx).then(() => true, () => false);
    if (!office && slot.authorUserId !== user.userId && slot.moderatorUserId !== user.userId && !slot.schedules.some(row => row.subject.teacherId === user.userId)) throw new ApiError("Paper request not found in your campus.", 404);
    const record = slot.paperRecordId ? await tx.schoolAiRecord.findFirst({ where: { id: slot.paperRecordId, schoolId: user.schoolId }, select: { data: true } }) : null;
    const paper = record ? paperDataSchema.safeParse(record.data) : null;
    const sections = [];
    for (const schedule of slot.schedules) {
      const pupils = await roster(tx, user.schoolId, schedule.exam.classId);
      const [attendance, scripts, runs] = await Promise.all([
        tx.examAttendance.findMany({ where: { schoolId: user.schoolId, scheduleId: schedule.id }, select: { studentId: true, status: true, reopenedAt: true } }),
        tx.examPaperScript.findMany({ where: { schoolId: user.schoolId, scheduleId: schedule.id }, select: { id: true, studentId: true, candidateNo: true, scannedAt: true, total: true, version: true, marks: true } }),
        tx.examPrintRun.count({ where: { schoolId: user.schoolId, scheduleId: schedule.id } }),
      ]);
      const att = new Map(attendance.map(row => [row.studentId, row]));
      const scr = new Map(scripts.map(row => [row.studentId, row]));
      sections.push({
        scheduleId: schedule.id, name: `${schedule.exam.class.name}${schedule.exam.class.section ? ` ${schedule.exam.class.section}` : ""}`, date: schedule.date.toISOString().slice(0, 10), printRuns: runs,
        pupils: pupils.map(pupil => ({ id: pupil.id, name: pupil.fullName, rollNo: pupil.rollNo, attendance: att.get(pupil.id)?.status ?? null, reopened: Boolean(att.get(pupil.id)?.reopenedAt), script: scr.get(pupil.id) ? { id: scr.get(pupil.id)!.id, candidateNo: scr.get(pupil.id)!.candidateNo, scanned: Boolean(scr.get(pupil.id)!.scannedAt), total: scr.get(pupil.id)!.total, version: scr.get(pupil.id)!.version, marks: scr.get(pupil.id)!.marks } : null })),
      });
    }
    return { slotId: slot.id, office, sealed: Boolean(slot.sealedAt), compromised: Boolean(slot.compromisedAt), questions: paper?.success ? paper.data.questions.map((question, index) => ({ id: question.id, number: index + 1, marks: question.marks })) : [], totalMarks: paper?.success ? paper.data.blueprint.totalMarks : null, sections, canManage: canManageAcademics(user) || office };
  });
}
