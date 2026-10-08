import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, assertStaffRole, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { parseMoney, localePackageSchema } from "@/lib/locale/package";
import { bankImportSchema, studentSchema } from "@/lib/validators/schemas";
import { importField, normalizeImportHeader, parseImportCsv } from "@/lib/imports/csv";
import { isoDate, summarizeImportRows, type ImportRow } from "@/lib/imports/batch";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 1000;
const STAGING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

function respond(batch: { id: string; campusId: string; kind: string; state: string; sourceName: string; expiresAt: Date; data: Prisma.JsonValue; receipt: Prisma.JsonValue | null; createdAt: Date }) {
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
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    const kind = request.nextUrl.searchParams.get("kind");
    if (kind !== "STUDENT_ROSTER" && kind !== "BANK_STATEMENT") throw new ApiError("Choose a supported import type", 400);
    if (kind === "STUDENT_ROSTER" && !canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, kind === "STUDENT_ROSTER" ? "students" : "fees", "view");
    const campusId = await resolveCampusId(user, request.nextUrl.searchParams.get("campusId"));
    await expireStagedBatches(user.schoolId, campusId);
    const batches = await prisma.importBatch.findMany({ where: { schoolId: user.schoolId, campusId, kind }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, kind: true, state: true, sourceName: true, createdAt: true, expiresAt: true, receipt: true, data: true, campusId: true } });
    return Response.json({ success: true, data: batches.map(respond) });
  } catch (error) {
    return errorResponse(error, "[import-batches] GET failed");
  }
}

async function expireStagedBatches(schoolId: string, campusId: string) {
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

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    const body = object(await request.json());
    if (!body) throw new ApiError("Invalid import request", 400);
    const kind = body.kind;
    if (kind !== "STUDENT_ROSTER" && kind !== "BANK_STATEMENT") throw new ApiError("Choose a supported import type", 400);
    const permissionModule = kind === "STUDENT_ROSTER" ? "students" : "fees";
    if (kind === "STUDENT_ROSTER" && !canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, permissionModule, "add");

    let requestedCampusId = typeof body.campusId === "string" ? body.campusId : null;
    if (!requestedCampusId && kind === "STUDENT_ROSTER" && typeof body.defaultClassId === "string") {
      requestedCampusId = (await prisma.class.findFirst({ where: { id: body.defaultClassId, campus: { schoolId: user.schoolId } }, select: { campusId: true } }))?.campusId || null;
    }
    const campusId = await resolveCampusId(user, requestedCampusId);
    await expireStagedBatches(user.schoolId, campusId);
    const csvText = typeof body.csvText === "string" ? body.csvText : "";
    if (!csvText || new TextEncoder().encode(csvText).byteLength > MAX_FILE_BYTES) throw new ApiError("CSV file must be under 5MB", 400);
    const sourceName = typeof body.sourceName === "string" ? body.sourceName.split(/[\\/]/).pop()?.slice(0, 180) || "import.csv" : "import.csv";
    let records: string[][];
    try { records = parseImportCsv(csvText); } catch (error) { throw new ApiError(error instanceof Error ? error.message : "Could not parse CSV file", 400); }
    if (records.length < 2) throw new ApiError("CSV needs a header row and at least one data row", 400);
    if (records.length - 1 > MAX_ROWS) throw new ApiError(`Maximum ${MAX_ROWS} rows allowed per import`, 400);
    const headers = records[0].map(normalizeImportHeader);
    if (new Set(headers).size !== headers.length) throw new ApiError("CSV contains duplicate column names", 400);
    const fingerprint = createHash("sha256").update(csvText, "utf8").digest("hex");

    let targetScope = `campus:${campusId}`;
    let metadata: Record<string, unknown> = {};
    let rows: ImportRow[];

    if (kind === "STUDENT_ROSTER") {
      const defaultClassId = typeof body.defaultClassId === "string" ? body.defaultClassId : "";
      if (!defaultClassId) throw new ApiError("Choose a class before validating the roster", 400);
      const rawRows = records.slice(1).map((cells, index) => {
        const source = headers.reduce<Record<string, string>>((result, header, column) => { result[header] = cells[column] || ""; return result; }, {});
        return { rowNumber: index + 2, source, raw: studentFromCsv(source, defaultClassId) };
      });
      const proposals = rawRows.map(({ raw }) => studentSchema.safeParse(raw));
      const classIds = [...new Set(proposals.flatMap((parsed) => parsed.success ? [parsed.data.classId] : []))];
      const [classes, existing] = await Promise.all([
        prisma.class.findMany({ where: { id: { in: classIds }, campusId, campus: { schoolId: user.schoolId } }, select: { id: true, name: true, section: true, campusId: true } }),
        prisma.student.findMany({ where: { campusId, campus: { schoolId: user.schoolId }, archivedAt: null }, select: { id: true, rollNo: true, classId: true, fullName: true } }),
      ]);
      const classesById = new Map(classes.map((item) => [item.id, item]));
      const existingByRoll = new Map<string, typeof existing>();
      for (const student of existing) existingByRoll.set(student.rollNo.trim().toLocaleLowerCase(), [...(existingByRoll.get(student.rollNo.trim().toLocaleLowerCase()) || []), student]);
      const seenKeys = new Set<string>();
      rows = rawRows.map(({ rowNumber, source }, index) => {
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
      targetScope = `classes:${[...new Set(classIds)].sort().join(",")}`;
      metadata = { mappedColumns: headers, defaultClassId };
    } else {
      const currency = localePackageSchema.shape.currency.safeParse(body.currency);
      if (!currency.success) throw new ApiError("Select a valid statement currency", 400);
      const details = bankImportSchema.safeParse({ accountName: body.accountName, statementFrom: body.statementFrom, statementTo: body.statementTo });
      if (!details.success) throw new ApiError("Account name and statement dates are required", 400);
      const from = details.data.statementFrom;
      const to = details.data.statementTo;
      if (!isoDate(from) || !isoDate(to) || from > to) throw new ApiError("Enter a valid statement date range", 400);
      const dateIndex = headers.findIndex((header) => /date|transactiondate/.test(header));
      const amountIndex = headers.findIndex((header) => /amount|value/.test(header));
      const descIndex = headers.findIndex((header) => /description|narration|details|reference/.test(header));
      if (dateIndex < 0 || amountIndex < 0 || descIndex < 0) throw new ApiError("CSV needs transaction date, amount and description columns", 400);
      const rawRows = records.slice(1).map((cells, index) => ({ rowNumber: index + 2, source: headers.reduce<Record<string, string>>((result, header, column) => { result[header] = cells[column] || ""; return result; }, {}), cells }));
      const invoices = await prisma.invoice.findMany({ where: { campusId, schoolId: user.schoolId, currency: currency.data, status: { in: ["PENDING", "PARTIAL", "OVERDUE"] }, balanceDue: { gt: 0 }, invoiceNumber: { not: null } }, select: { id: true, invoiceNumber: true, balanceDue: true, student: { select: { fullName: true } } }, take: 1000 });
      rows = rawRows.map(({ rowNumber, source, cells }) => {
        const errors: string[] = [];
        const date = cells[dateIndex]?.trim() || "";
        if (!isoDate(date)) errors.push("date: Use a real date in YYYY-MM-DD format");
        else if (date < from || date > to) errors.push("date: Transaction is outside the statement period");
        let amountMinor = 0;
        try { amountMinor = parseMoney((cells[amountIndex] || "").replace(/,/g, "").trim(), currency.data).minor; }
        catch { errors.push("amount: Enter a valid amount in the selected currency"); }
        if (amountMinor <= 0) errors.push("amount: Only positive credit transactions can be included in this reconciliation");
        const description = cells[descIndex]?.trim() || "";
        if (!description) errors.push("description: Transaction description is required");
        const invoiceMatches = invoices.filter((invoice) => invoice.invoiceNumber && description.toLocaleLowerCase().includes(invoice.invoiceNumber.toLocaleLowerCase()));
        const exactMatches = invoiceMatches.filter((invoice) => amountMinor <= invoice.balanceDue);
        let selectedInvoice: typeof invoices[number] | null = null;
        if (exactMatches.length === 1) selectedInvoice = exactMatches[0];
        if (exactMatches.length > 1) errors.push("invoice: More than one stable invoice reference appears in the description; choose one before including this row");
        const state = errors.length ? (errors.some((error) => error.startsWith("invoice:")) ? "UNRESOLVED" : "REJECTED") : "ACCEPTED";
        const candidates = invoices.filter((invoice) => amountMinor <= invoice.balanceDue).sort((a, b) => Number(b.balanceDue === amountMinor) - Number(a.balanceDue === amountMinor)).slice(0, 30).map((invoice) => ({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, studentName: invoice.student.fullName, balanceDue: invoice.balanceDue }));
        return { rowNumber, source, proposal: { date, amountMinor, currency: currency.data, description, matchedInvoiceId: selectedInvoice?.id || null, studentName: selectedInvoice?.student.fullName || null, candidates }, state, selected: state === "ACCEPTED", matchKey: selectedInvoice ? `invoice:${selectedInvoice.invoiceNumber}` : null, matchLabel: selectedInvoice?.student.fullName || "No exact invoice reference", errors };
      });
      targetScope = `account:${details.data.accountName.trim().toLowerCase()}|currency:${currency.data}|from:${from}|to:${to}`;
      metadata = { accountName: details.data.accountName.trim(), statementFrom: from, statementTo: to, currency: currency.data, mappedColumns: headers };
    }

    const now = new Date();
    const existingBatch = await prisma.importBatch.findUnique({ where: { schoolId_campusId_kind_fingerprint_targetScope: { schoolId: user.schoolId, campusId, kind, fingerprint, targetScope } } });
    if (existingBatch && existingBatch.state !== "EXPIRED") return Response.json({ success: true, data: respond(existingBatch) });
    if (existingBatch) {
      // Reuse an expired idempotency key so an identical file can be staged again
      // without discarding any committed receipt (expired rows were never committed).
      const refreshed = await prisma.importBatch.updateMany({
        where: { id: existingBatch.id, schoolId: user.schoolId, campusId, state: "EXPIRED" },
        data: { state: "STAGED", sourceName, data: { rows, metadata, summary: summarizeImportRows(rows) } as Prisma.InputJsonValue, receipt: Prisma.JsonNull, createdById: user.userId, createdAt: now, expiresAt: new Date(now.getTime() + STAGING_TTL_MS), committedAt: null, reversedAt: null },
      });
      if (refreshed.count === 1) {
        const batch = await prisma.importBatch.findFirst({ where: { id: existingBatch.id, schoolId: user.schoolId, campusId } });
        if (batch) return Response.json({ success: true, data: respond(batch) });
      }
      const latest = await prisma.importBatch.findUnique({ where: { schoolId_campusId_kind_fingerprint_targetScope: { schoolId: user.schoolId, campusId, kind, fingerprint, targetScope } } });
      if (latest) return Response.json({ success: true, data: respond(latest) });
    }
    try {
      const batch = await prisma.importBatch.create({ data: {
        schoolId: user.schoolId, campusId, kind, fingerprint, targetScope, sourceName,
        state: "STAGED", data: { rows, metadata, summary: summarizeImportRows(rows) } as Prisma.InputJsonValue,
        createdById: user.userId, expiresAt: new Date(now.getTime() + STAGING_TTL_MS),
      } });
      return Response.json({ success: true, data: respond(batch) }, { status: 201 });
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") {
        const batch = await prisma.importBatch.findUnique({ where: { schoolId_campusId_kind_fingerprint_targetScope: { schoolId: user.schoolId, campusId, kind, fingerprint, targetScope } } });
        if (batch) return Response.json({ success: true, data: respond(batch) });
      }
      throw error;
    }
  } catch (error) {
    return errorResponse(error, "[import-batches] POST failed");
  }
}
