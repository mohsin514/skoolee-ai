import { createHash } from "node:crypto";
import { bankRowKeys } from "@/lib/fees/bank-reconciliation";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, assertStaffRole, canManageCampusOps, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { parseMoney, localePackageSchema } from "@/lib/locale/package";
import { bankImportSchema } from "@/lib/validators/schemas";
import { normalizeImportHeader, parseImportCsv } from "@/lib/imports/csv";
import { isoDate, type ImportRow } from "@/lib/imports/batch";
import { assertRosterPermission } from "@/lib/imports/roster-access";
import { MAX_IMPORT_ROWS as MAX_ROWS, classifyStudentRoster, csvRosterSources, expireStagedBatches, importBatchView as respond, persistImportBatch } from "@/lib/imports/stage-batch-command";
import { readJsonBody } from "@/lib/api/validate";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    const kind = request.nextUrl.searchParams.get("kind");
    if (kind !== "STUDENT_ROSTER" && kind !== "BANK_STATEMENT") throw new ApiError("Choose a supported import type", 400);
    if (kind === "STUDENT_ROSTER" && !canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    if (kind === "STUDENT_ROSTER") await assertRosterPermission(user, "view");
    else await assertPermission(user, "fees", "view");
    const campusId = await resolveCampusId(user, request.nextUrl.searchParams.get("campusId"));
    await expireStagedBatches(user.schoolId, campusId);
    const batches = await prisma.importBatch.findMany({ where: { schoolId: user.schoolId, campusId, kind }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, kind: true, state: true, sourceName: true, createdAt: true, expiresAt: true, receipt: true, data: true, campusId: true } });
    return Response.json({ success: true, data: batches.map(respond) });
  } catch (error) {
    return errorResponse(error, "[import-batches] GET failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    const body = object(await readJsonBody(request));
    if (!body) throw new ApiError("Invalid import request", 400);
    const kind = body.kind;
    if (kind !== "STUDENT_ROSTER" && kind !== "BANK_STATEMENT") throw new ApiError("Choose a supported import type", 400);
    const permissionModule = kind === "STUDENT_ROSTER" ? "students" : "fees";
    if (kind === "STUDENT_ROSTER" && !canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    if (kind === "STUDENT_ROSTER") await assertRosterPermission(user, "add");
    else await assertPermission(user, permissionModule, "add");

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
      ({ rows, targetScope, metadata } = await classifyStudentRoster(user, { campusId, defaultClassId, headers, sources: csvRosterSources(headers, records) }));
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
      // SKO-432: stable identities for each transaction; ones already committed are not offered again.
      const parsedForKeys = rawRows.map(({ cells }) => {
        let minor = 0;
        try { minor = parseMoney((cells[amountIndex] || "").replace(/,/g, "").trim(), currency.data).minor; } catch { minor = 0; }
        return { date: cells[dateIndex]?.trim() || "", amountMinor: minor, description: cells[descIndex]?.trim() || "" };
      });
      const rowKeys = bankRowKeys(details.data.accountName, parsedForKeys);
      const alreadyImported = new Set((await prisma.bankTransactionKey.findMany({ where: { campusId, schoolId: user.schoolId, rowKey: { in: rowKeys } }, select: { rowKey: true } })).map(key => key.rowKey));
      rows = rawRows.map(({ rowNumber, source, cells }, index) => {
        const rowKey = rowKeys[index];
        if (alreadyImported.has(rowKey)) return { rowNumber, source, proposal: { ...parsedForKeys[index], currency: currency.data, rowKey, matchedInvoiceId: null, candidates: [] }, state: "SKIPPED", selected: false, matchKey: `bank:${rowKey.slice(0, 16)}`, matchLabel: "This transaction was already imported; no duplicate was posted.", errors: [] };
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
        return { rowNumber, source, proposal: { date, amountMinor, currency: currency.data, description, rowKey, autoMatchedInvoiceId: selectedInvoice?.id || null, matchedInvoiceId: selectedInvoice?.id || null, studentName: selectedInvoice?.student.fullName || null, candidates }, state, selected: state === "ACCEPTED", matchKey: selectedInvoice ? `invoice:${selectedInvoice.invoiceNumber}` : null, matchLabel: selectedInvoice?.student.fullName || "No exact invoice reference", errors };
      });
      targetScope = `account:${details.data.accountName.trim().toLowerCase()}|currency:${currency.data}|from:${from}|to:${to}`;
      metadata = { accountName: details.data.accountName.trim(), statementFrom: from, statementTo: to, currency: currency.data, mappedColumns: headers };
    }

    const { batch, created } = await persistImportBatch(user, { campusId, kind, fingerprint, targetScope, sourceName, rows, metadata });
    return created ? Response.json({ success: true, data: respond(batch) }, { status: 201 }) : Response.json({ success: true, data: respond(batch) });
  } catch (error) {
    return errorResponse(error, "[import-batches] POST failed");
  }
}
