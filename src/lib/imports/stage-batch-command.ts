import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { studentSchema } from "@/lib/validators/schemas";
import { importField, normalizeImportHeader } from "@/lib/imports/csv";
import { isoDate, summarizeImportRows, type ImportRow } from "@/lib/imports/batch";
import { importReviewToken } from "@/lib/imports/review-token";
import { resolveRosterClass } from "@/lib/imports/roster-class";

/**
 * Staging for spreadsheet imports (POST /api/import-batches), extracted so the route and the AI Workflows
 * `imports.stage_batch` capability run the same command: the student-roster duplicate matching, the
 * batch's idempotency key (school, campus, kind, fingerprint, target scope), the expired-batch reuse and
 * the review response. Staging never writes a student; committing stays on the import review screen.
 * Throws ApiError with the route's exact messages and statuses.
 */
export const MAX_IMPORT_ROWS = 1000;
export const STAGING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ImportBatchKind = "STUDENT_ROSTER" | "BANK_STATEMENT";
type ImportBatchRecord = { id: string; campusId: string; kind: string; state: string; sourceName: string; expiresAt: Date; data: Prisma.JsonValue; receipt: Prisma.JsonValue | null; createdAt: Date };

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asRows(value: Prisma.JsonValue): ImportRow[] {
  const data = object(value);
  return Array.isArray(data?.rows) ? data.rows as unknown as ImportRow[] : [];
}

function receiptCounts(value: Prisma.JsonValue | null) {
  const record = object(value);
  const summary = object(record?.summary) || {};
  return {
    total: Number(summary.total) || 0,
    accepted: Number(summary.committed ?? summary.created ?? summary.accepted) || 0,
    rejected: Number(summary.rejected) || 0,
    skipped: Number(summary.skipped) || 0,
    unresolved: Number(summary.unresolved) || 0,
  };
}

/** The review payload the import screens read (rows only while STAGED, plus the review token). */
export function importBatchView(batch: ImportBatchRecord) {
  const rows = asRows(batch.data);
  const storedSummary = object(object(batch.data)?.summary);
  return {
    id: batch.id,
    campusId: batch.campusId,
    kind: batch.kind,
    state: batch.state,
    sourceName: batch.sourceName,
    expiresAt: batch.expiresAt,
    createdAt: batch.createdAt,
    summary: batch.receipt ? receiptCounts(batch.receipt) : storedSummary || summarizeImportRows(rows),
    rows: batch.state === "STAGED" ? rows : undefined,
    receipt: batch.receipt,
    reviewToken: importReviewToken(batch),
  };
}

export async function expireStagedBatches(schoolId: string, campusId: string) {
  await prisma.$executeRaw`UPDATE import_batches
    SET state='EXPIRED',
        receipt=jsonb_build_object('summary', COALESCE(data->'summary', '{}'::jsonb), 'expiredAt', now()),
        data=jsonb_build_object('rows', '[]'::jsonb, 'metadata', '{}'::jsonb, 'summary', COALESCE(data->'summary', '{}'::jsonb))
    WHERE school_id=${schoolId} AND campus_id=${campusId} AND state='STAGED' AND expires_at <= now()`;
}

function studentFromCsv(row: Record<string, string>, defaultClassId: string) {
  return {
    fullName: importField(row, ["fullName", "studentName", "name"]),
    rollNo: importField(row, ["rollNo", "rollNumber", "registrationNo", "regNo"]),
    classId: importField(row, ["classId"]) || defaultClassId,
    gender: importField(row, ["gender"]).toUpperCase() || "OTHER",
    dateOfBirth: importField(row, ["dateOfBirth", "dob"]) || null,
    phone: importField(row, ["phone", "studentPhone"]) || null,
    studentEmail: importField(row, ["studentEmail", "studentLoginEmail", "email"]) || null,
    guardianName: importField(row, ["guardianName", "parentName"]) || null,
    guardianPhone: importField(row, ["guardianPhone", "parentPhone"]),
    guardianWhatsapp: importField(row, ["guardianWhatsapp", "whatsapp"]) || null,
    guardianEmail: importField(row, ["guardianEmail", "parentEmail"]) || null,
    guardianRelationship: importField(row, ["guardianRelationship", "relationship"]) || undefined,
    address: importField(row, ["address"]) || null,
    city: importField(row, ["city"]) || null,
    medicalNotes: importField(row, ["medicalNotes", "medical"]) || null,
  };
}

export type RosterSourceRow = { rowNumber: number; source: Record<string, string> };

/** CSV records (header row first, headers already normalised) as roster source rows; row numbers count the header. */
export function csvRosterSources(headers: string[], records: string[][]): RosterSourceRow[] {
  return records.slice(1).map((cells, index) => ({
    rowNumber: index + 2,
    source: headers.reduce<Record<string, string>>((result, header, column) => { result[header] = cells[column] || ""; return result; }, {}),
  }));
}

/**
 * Classifies roster rows against the campus without writing anything: ACCEPTED, SKIPPED (the class and
 * roll-number key already exists; never overwritten), UNRESOLVED (the roll number is used in another class)
 * or REJECTED (invalid, outside the campus, or repeated in the file).
 */
export async function classifyStudentRoster(user: AuthUser, input: { campusId: string; defaultClassId: string; headers: string[]; sources: RosterSourceRow[] }) {
  const { campusId, defaultClassId, headers } = input;
  if (!defaultClassId) throw new ApiError("Choose a class before validating the roster", 400);
  const rosterClasses = await prisma.class.findMany({ where: { campusId, schoolId: user.schoolId, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, section: true } });
  const rawRows = input.sources.map(({ rowNumber, source }) => {
    const explicitClass = importField(source, ["className"]), section = importField(source, ["classSection"]);
    const raw = studentFromCsv(source, defaultClassId);
    if (explicitClass || section) raw.classId = resolveRosterClass(rosterClasses, explicitClass, section, defaultClassId);
    return { rowNumber, source, raw };
  });
  const proposals = rawRows.map(({ raw }) => studentSchema.safeParse(raw));
  const classIds = [...new Set(proposals.flatMap((parsed) => parsed.success ? [parsed.data.classId] : []))];
  const [classes, existing] = await Promise.all([
    prisma.class.findMany({ where: { id: { in: classIds }, campusId, campus: { schoolId: user.schoolId }, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, section: true, campusId: true } }),
    prisma.student.findMany({ where: { campusId, campus: { schoolId: user.schoolId }, archivedAt: null }, select: { id: true, rollNo: true, classId: true, fullName: true } }),
  ]);
  const classesById = new Map(classes.map((item) => [item.id, item]));
  const existingByRoll = new Map<string, typeof existing>();
  for (const student of existing) existingByRoll.set(student.rollNo.trim().toLocaleLowerCase(), [...(existingByRoll.get(student.rollNo.trim().toLocaleLowerCase()) || []), student]);
  const seenKeys = new Set<string>();
  const rows: ImportRow[] = rawRows.map(({ rowNumber, source }, index) => {
    const parsed = proposals[index];
    if (!parsed.success) {
      return { rowNumber, source, proposal: null, state: "REJECTED", selected: false, matchKey: null, errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`) };
    }
    const proposal = parsed.data;
    const errors: string[] = [];
    if (proposal.dateOfBirth && !isoDate(proposal.dateOfBirth)) errors.push("dateOfBirth: Use a real date in YYYY-MM-DD format");
    const targetClass = classesById.get(proposal.classId);
    if (!targetClass) errors.push("classId: Class is outside the selected campus or does not exist");
    const matchKey = `${proposal.classId}:${proposal.rollNo.trim().toLocaleLowerCase()}`;
    const rollMatches = existingByRoll.get(proposal.rollNo.trim().toLocaleLowerCase()) || [];
    if (rollMatches.some((student) => student.classId === proposal.classId)) {
      return { rowNumber, source, proposal: proposal as unknown as Record<string, unknown>, state: "SKIPPED", selected: false, matchKey: `class:${proposal.classId}/roll:${proposal.rollNo}`, matchLabel: `Existing pupil: ${rollMatches.find((student) => student.classId === proposal.classId)?.fullName}`, errors: ["This stable class and roll-number key already exists. Review the existing record; it will not be overwritten."] };
    }
    if (rollMatches.length) errors.push("rollNo: This roll number exists in another class at the selected campus; resolve the identity before importing");
    if (seenKeys.has(matchKey)) errors.push("rollNo: This file repeats the same class and roll number; choose a corrected file row");
    seenKeys.add(matchKey);
    if (errors.length) return { rowNumber, source, proposal: proposal as unknown as Record<string, unknown>, state: rollMatches.length ? "UNRESOLVED" : "REJECTED", selected: false, matchKey: `class:${proposal.classId}/roll:${proposal.rollNo}`, errors };
    return { rowNumber, source, proposal: proposal as unknown as Record<string, unknown>, state: "ACCEPTED", selected: true, matchKey: `class:${proposal.classId}/roll:${proposal.rollNo}`, matchLabel: targetClass ? `${targetClass.name}${targetClass.section ? ` · ${targetClass.section}` : ""}` : null, errors: [] };
  });
  const targetScope = `classes:${[...new Set(classIds)].sort().join(",")}`;
  const metadata: Record<string, unknown> = { mappedColumns: headers, defaultClassId };
  return { rows, targetScope, metadata };
}

export type PersistImportBatch = { campusId: string; kind: ImportBatchKind; fingerprint: string; targetScope: string; sourceName: string; rows: ImportRow[]; metadata: Record<string, unknown> };
const batchKey = (user: AuthUser, input: Pick<PersistImportBatch, "campusId" | "kind" | "fingerprint" | "targetScope">) =>
  ({ schoolId_campusId_kind_fingerprint_targetScope: { schoolId: user.schoolId, campusId: input.campusId, kind: input.kind, fingerprint: input.fingerprint, targetScope: input.targetScope } });

/** The batch already holding this idempotency key, if any (read-only; used by previews). */
export function findImportBatch(user: AuthUser, input: Pick<PersistImportBatch, "campusId" | "kind" | "fingerprint" | "targetScope">) {
  return prisma.importBatch.findUnique({ where: batchKey(user, input) });
}

/**
 * Saves a STAGED batch under its idempotency key. The same file for the same target returns the batch
 * already staged (`created: false`); an EXPIRED one is restaged in place (it was never committed).
 */
export async function persistImportBatch(user: AuthUser, input: PersistImportBatch) {
  const { campusId, kind, fingerprint, targetScope, sourceName, rows, metadata } = input;
  const now = new Date();
  const existingBatch = await prisma.importBatch.findUnique({ where: batchKey(user, input) });
  if (existingBatch && existingBatch.state !== "EXPIRED") return { batch: existingBatch, created: false };
  if (existingBatch) {
    // Reuse an expired idempotency key so an identical file can be staged again
    // without discarding any committed receipt (expired rows were never committed).
    const refreshed = await prisma.importBatch.updateMany({
      where: { id: existingBatch.id, schoolId: user.schoolId, campusId, state: "EXPIRED" },
      data: { state: "STAGED", sourceName, data: { rows, metadata, summary: summarizeImportRows(rows) } as Prisma.InputJsonValue, receipt: Prisma.JsonNull, createdById: user.userId, createdAt: now, expiresAt: new Date(now.getTime() + STAGING_TTL_MS), committedAt: null, reversedAt: null },
    });
    if (refreshed.count === 1) {
      const batch = await prisma.importBatch.findFirst({ where: { id: existingBatch.id, schoolId: user.schoolId, campusId } });
      if (batch) return { batch, created: false };
    }
    const latest = await prisma.importBatch.findUnique({ where: batchKey(user, input) });
    if (latest) return { batch: latest, created: false };
  }
  try {
    const batch = await prisma.importBatch.create({ data: {
      schoolId: user.schoolId, campusId, kind, fingerprint, targetScope, sourceName,
      state: "STAGED", data: { rows, metadata, summary: summarizeImportRows(rows) } as Prisma.InputJsonValue,
      createdById: user.userId, expiresAt: new Date(now.getTime() + STAGING_TTL_MS),
    } });
    return { batch, created: true };
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      const batch = await prisma.importBatch.findUnique({ where: batchKey(user, input) });
      if (batch) return { batch, created: false };
    }
    throw error;
  }
}

// ─── Structured roster rows (typed or pasted, not a file) ───────────────────

/** The roster columns a typed row may carry; the same names the CSV mapping reads. */
export const ROSTER_ROW_FIELDS = ["fullName", "rollNo", "className", "classSection", "gender", "dateOfBirth", "phone", "guardianName", "guardianPhone", "guardianWhatsapp", "guardianEmail", "guardianRelationship", "address", "city", "medicalNotes"] as const;
export type RosterRowField = typeof ROSTER_ROW_FIELDS[number];
export type StructuredRosterInput = { campusId: string; defaultClassId: string; sourceName: string; rows: ReadonlyArray<Partial<Record<RosterRowField, string | null>>> };

/** Classifies typed rows exactly as a file with these columns would be; nothing is written. */
export async function classifyStructuredRoster(user: AuthUser, input: StructuredRosterInput) {
  if (!input.rows.length) throw new ApiError("CSV needs a header row and at least one data row", 400);
  if (input.rows.length > MAX_IMPORT_ROWS) throw new ApiError(`Maximum ${MAX_IMPORT_ROWS} rows allowed per import`, 400);
  const fields = ROSTER_ROW_FIELDS.filter(field => input.rows.some(row => typeof row[field] === "string" && row[field]!.trim()));
  const headers = fields.map(normalizeImportHeader);
  const records = [headers, ...input.rows.map(row => fields.map(field => String(row[field] ?? "").trim()))];
  // The same rows for the same classes stage once, whichever conversation typed them.
  const fingerprint = createHash("sha256").update(`structured:${JSON.stringify(records)}`, "utf8").digest("hex");
  const classified = await classifyStudentRoster(user, { campusId: input.campusId, defaultClassId: input.defaultClassId, headers, sources: csvRosterSources(headers, records).map(row => ({ ...row, rowNumber: row.rowNumber - 1 })) });
  return { ...classified, fingerprint, sourceName: input.sourceName.split(/[\\/]/).pop()?.slice(0, 180) || "import.csv" };
}

/** Stages typed rows into a STAGED STUDENT_ROSTER batch for review. Never commits a student. */
export async function stageStructuredRoster(user: AuthUser, input: StructuredRosterInput) {
  await expireStagedBatches(user.schoolId, input.campusId);
  const classified = await classifyStructuredRoster(user, input);
  const result = await persistImportBatch(user, { campusId: input.campusId, kind: "STUDENT_ROSTER", fingerprint: classified.fingerprint, targetScope: classified.targetScope, sourceName: classified.sourceName, rows: classified.rows, metadata: { ...classified.metadata, origin: "structured" } });
  return { ...result, view: importBatchView(result.batch) };
}
